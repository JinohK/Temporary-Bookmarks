/**
 * Popup script for Temporary Bookmark Extension
 * Displays and manages saved bookmarks with i18n support
 */

// Track active notification timer for unified notification system
let activeTimer = null;

// Track undo timeouts for deletion cancellation (TODO: Remove after US2 migration)
const undoTimeouts = new Map();

const undoHideSeconds = 3;

// Constants for expiration calculation
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Sync state tracking
let currentSyncState = null;

/**
 * Get current sync state from storage
 * @returns {Promise<object>}
 */
async function getSyncState() {
	try {
		const result = await chrome.storage.local.get(["syncState"]);
		return (
			result.syncState || {
				isConnected: false,
				syncEnabled: true,
				lastSyncTime: null,
				accountEmail: null,
				error: null,
				fileId: null,
			}
		);
	} catch (error) {
		console.error("[Popup] Error getting sync state:", error);
		return {
			isConnected: false,
			syncEnabled: true,
			lastSyncTime: null,
			accountEmail: null,
			error: null,
			fileId: null,
		};
	}
}

/**
 * Update sync button UI based on current state
 */
async function updateSyncButton() {
	const syncButton = document.getElementById("sync-button");
	if (!syncButton) return;

	const state = await getSyncState();
	currentSyncState = state;

	// const syncIcon = syncButton.querySelector(".sync-icon");
	const syncText = syncButton.querySelector(".sync-text");

	if (state.isConnected) {
		syncButton.classList.add("connected");
		// if (syncIcon) syncIcon.textContent = "🔌";
		if (syncText) {
			syncText.textContent =
				chrome.i18n.getMessage("disconnect") || "Disconnect";
		}
		syncButton.title = state.accountEmail || "Connected to Google Drive";
	} else {
		syncButton.classList.remove("connected");
		syncButton.classList.remove("syncing");
		// if (syncIcon) syncIcon.textContent = "☁️";
		if (syncText) {
			syncText.textContent =
				chrome.i18n.getMessage("connect") || "Connect";
		}
		syncButton.title = "Sync with Google Drive";
	}

	console.log("[Popup] Sync button updated, connected:", state.isConnected);
}

/**
 * Handle sync button click
 */
async function handleSyncClick() {
	const syncButton = document.getElementById("sync-button");
	if (!syncButton) return;

	const state = await getSyncState();

	if (state.isConnected) {
		// Disconnect
		await performDisconnect();
	} else {
		// Connect
		await performConnect();
	}
}

/**
 * Send message to background with retry logic
 * @param {object} message - Message to send
 * @param {number} retries - Number of retries
 * @returns {Promise<object>}
 */
async function sendMessageWithRetry(message, retries = 2) {
	for (let i = 0; i <= retries; i++) {
		try {
			const response = await chrome.runtime.sendMessage(message);
			return response;
		} catch (error) {
			if (
				error.message?.includes("Receiving end does not exist") &&
				i < retries
			) {
				// Wait a bit for service worker to wake up
				console.log(
					"[Popup] Service worker not ready, retrying...",
					i + 1,
				);
				await new Promise((resolve) => setTimeout(resolve, 300));
				continue;
			}
			throw error;
		}
	}
}

/**
 * Perform Google Drive connection
 */
async function performConnect() {
	const syncButton = document.getElementById("sync-button");
	if (!syncButton) return;

	try {
		// Show syncing state
		syncButton.classList.add("syncing");
		const syncText = syncButton.querySelector(".sync-text");
		if (syncText) {
			syncText.textContent =
				chrome.i18n.getMessage("syncing") || "Syncing...";
		}

		// Send message to background to initiate connection (with retry)
		const response = await sendMessageWithRetry({
			type: "SYNC_CONNECT",
		});

		if (response && response.success) {
			showNotification({
				message:
					chrome.i18n.getMessage("syncConnected") ||
					"Connected to Google Drive",
				duration: 3000,
			});
		} else {
			const errorMsg = response?.error || "Connection failed";
			if (errorMsg === "AUTH_CANCELLED") {
				showNotification({
					message:
						chrome.i18n.getMessage("authCancelled") ||
						"Sign-in cancelled",
					duration: 3000,
				});
			} else {
				showNotification({
					message:
						chrome.i18n.getMessage("syncError", errorMsg) ||
						`Sync error: ${errorMsg}`,
					duration: 5000,
				});
			}
		}
	} catch (error) {
		console.error("[Popup] Connection error:", error);
		showNotification({
			message:
				chrome.i18n.getMessage("syncError", error.message) ||
				`Sync error: ${error.message}`,
			duration: 5000,
		});
	} finally {
		syncButton.classList.remove("syncing");
		await updateSyncButton();
	}
}

/**
 * Perform Google Drive disconnection
 */
async function performDisconnect() {
	const syncButton = document.getElementById("sync-button");
	if (!syncButton) return;

	try {
		// Show syncing state
		syncButton.classList.add("syncing");
		const syncText = syncButton.querySelector(".sync-text");
		if (syncText) {
			syncText.textContent = "...";
		}

		// Send message to background to disconnect (with retry)
		const response = await sendMessageWithRetry({
			type: "SYNC_DISCONNECT",
		});

		if (response && response.success) {
			showNotification({
				message:
					chrome.i18n.getMessage("syncDisconnected") ||
					"Disconnected from Google Drive",
				duration: 3000,
			});
		} else {
			const errorMsg = response?.error || "Disconnect failed";
			showNotification({
				message:
					chrome.i18n.getMessage("syncError", errorMsg) ||
					`Sync error: ${errorMsg}`,
				duration: 5000,
			});
		}
	} catch (error) {
		console.error("[Popup] Disconnect error:", error);
		showNotification({
			message:
				chrome.i18n.getMessage("syncError", error.message) ||
				`Sync error: ${error.message}`,
			duration: 5000,
		});
	} finally {
		syncButton.classList.remove("syncing");
		await updateSyncButton();
	}
}

/**
 * Calculate remaining days until expiration
 * @param {number|null} expiresAt - Expiration timestamp (ms) or null for permanent
 * @returns {number|null} - Days remaining or null for permanent
 */
function calculateRemainingDays(expiresAt) {
	if (expiresAt === null || expiresAt === undefined) return null;
	const remaining = Math.ceil((expiresAt - Date.now()) / MS_PER_DAY);
	return remaining > 0 ? remaining : 0;
}

/**
 * Check if bookmark is urgent (expiring within 1 day)
 * @param {number|null} remainingDays - Days remaining or null
 * @returns {boolean} - True if urgent
 */
function isExpirationUrgent(remainingDays) {
	return remainingDays !== null && remainingDays <= 1 && remainingDays > 0;
}

/**
 * Filter out expired bookmarks
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {Array} - Non-expired bookmarks
 */
function filterExpiredBookmarks(bookmarks) {
	const now = Date.now();
	return bookmarks.filter((bookmark) => {
		if (bookmark.expiresAt === null) return true; // Permanent
		return bookmark.expiresAt > now; // Not expired
	});
}

/**
 * Remove expired bookmarks from storage
 * Called on popup open to ensure user never sees expired bookmarks
 * @returns {Promise<{checkedAt: number, expiredCount: number}>}
 */
async function removeExpiredBookmarks() {
	try {
		const result = await chrome.storage.local.get("bookmarkData");
		const bookmarks = result.bookmarkData?.bookmarks || [];
		const now = Date.now();

		const activeBookmarks = bookmarks.filter((bookmark) => {
			if (bookmark.expiresAt === null) return true; // Permanent
			return bookmark.expiresAt > now; // Not expired
		});

		const expiredCount = bookmarks.length - activeBookmarks.length;

		if (expiredCount > 0) {
			await chrome.storage.local.set({
				bookmarkData: {
					bookmarks: activeBookmarks,
					version: result.bookmarkData?.version || 1,
				},
			});
			console.log(`[Popup] Removed ${expiredCount} expired bookmark(s)`);
		}

		return { checkedAt: now, expiredCount };
	} catch (error) {
		// FR-007: Log error only, show bookmarks anyway
		console.error("[Popup] Error removing expired bookmarks:", error);
		return { checkedAt: Date.now(), expiredCount: 0 };
	}
}

/**
 * Update bookmark expiration in storage
 * @param {string} bookmarkId - Bookmark ID
 * @param {string} inputValue - User input value
 * @returns {Promise<boolean>} - Success status
 */
async function updateBookmarkExpiration(bookmarkId, inputValue) {
	try {
		const result = await chrome.storage.local.get("bookmarkData");
		const bookmarks = result.bookmarkData?.bookmarks || [];

		const bookmarkIndex = bookmarks.findIndex((b) => b.id === bookmarkId);
		if (bookmarkIndex === -1) return false;

		const bookmark = bookmarks[bookmarkIndex];

		// Parse input
		const days = parseInt(inputValue, 10);

		if (
			inputValue === "" ||
			inputValue === "0" ||
			isNaN(days) ||
			days <= 0
		) {
			// Make permanent
			bookmark.expiresAt = null;
			bookmark.expirationDays = null;
		} else {
			// Set new expiration
			const now = Date.now();
			bookmark.expiresAt = now + days * MS_PER_DAY;
			bookmark.expirationDays = days;
		}

		// Save to storage
		await chrome.storage.local.set({
			bookmarkData: {
				bookmarks,
				version: result.bookmarkData?.version || 1,
			},
		});

		return true;
	} catch (error) {
		console.error("[Popup] Failed to update expiration:", error);
		return false;
	}
}

/**
 * Bind event handlers to expiration inputs
 */
function bindExpirationInputEvents() {
	document.querySelectorAll(".expiration-input").forEach((input) => {
		// Handle blur (save on focus loss)
		input.addEventListener("blur", async (e) => {
			const value = e.target.value;
			const previousValue = e.target.dataset.previousValue;

			if (value === previousValue) return; // No change

			const bookmarkId = e.target.dataset.bookmarkId;
			const success = await updateBookmarkExpiration(bookmarkId, value);

			if (success) {
				e.target.dataset.previousValue = value;
				// Update urgent class
				const days = parseInt(value, 10);
				e.target.classList.toggle("urgent", isExpirationUrgent(days));
			} else {
				// Revert on failure
				e.target.value = previousValue;
				e.target.classList.add("error");
				setTimeout(() => e.target.classList.remove("error"), 500);
			}
		});

		// Handle Enter key
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				e.target.blur();
			}
		});
	});
}

/**
 * Translate all static text elements in the popup
 * Uses Chrome's i18n API to display text in user's browser language
 */
function translatePage() {
	// Find all elements with data-i18n attribute
	document.querySelectorAll("[data-i18n]").forEach((element) => {
		const key = element.getAttribute("data-i18n");
		const message = chrome.i18n.getMessage(key);

		if (message) {
			// Set translated text
			element.textContent = message;
		} else {
			// Log warning but keep original text as fallback
			console.warn(`[Popup] Translation not found for key: ${key}`);
		}
	});

	console.log("[Popup] Translations applied");
}

/**
 * Hide the notification
 */
function hideNotification() {
	const notification = document.getElementById("notification");
	if (notification) {
		notification.style.display = "none";
	}
}

function showNotification(config) {
	// Destructure config with defaults
	const {
		title = "",
		message = "",
		actionLabel = null,
		actionCallback = null,
		duration = 3000,
		autoHide = true,
	} = config;

	// Get or create notification element
	let notification = document.getElementById("notification");
	if (!notification) {
		notification = document.createElement("div");
		notification.id = "notification";
		notification.className = "notification";
		document.querySelector(".container").appendChild(notification);
	}

	// Cancel existing timer to prevent memory leaks
	if (activeTimer) {
		clearTimeout(activeTimer);
		activeTimer = null;
	}

	// Clear notification
	notification.innerHTML = "";

	// Add title if provided
	if (title) {
		const titleElement = document.createElement("div");
		titleElement.className = "notification-title";
		titleElement.textContent = title;
		notification.appendChild(titleElement);
	}

	// Add message using textContent for XSS prevention
	const messageElement =
		notification.querySelector(".notification-message") ||
		document.createElement("span");
	messageElement.className = "notification-message";
	messageElement.textContent = message;
	notification.appendChild(messageElement);

	// Handle action button (show only if both label and callback provided)
	if (actionLabel && actionCallback) {
		const actionButton =
			notification.querySelector(".notification-action") ||
			document.createElement("button");
		actionButton.className = "notification-action";
		actionButton.textContent = actionLabel;
		actionButton.style.display = "block";

		// Clone-and-replace pattern to remove old event listeners (prevents memory leaks)
		const newButton = actionButton.cloneNode(true);
		actionButton.parentNode?.replaceChild(newButton, actionButton);

		// Add new click listener
		newButton.addEventListener("click", actionCallback);
		notification.appendChild(newButton);
	}

	// Display notification
	notification.style.display = "block";

	// Set auto-hide timer if enabled
	if (autoHide) {
		activeTimer = setTimeout(() => {
			hideNotification();
			activeTimer = null;
		}, duration);
	}
}

/**
 * Cancel deletion and restore the bookmark to its original position
 * @param {string} bookmarkId - ID of the bookmark to restore
 */
async function undoDelete(bookmarkId) {
	// Clear the deletion timeout
	const timeoutId = undoTimeouts.get(bookmarkId);
	if (timeoutId) {
		clearTimeout(timeoutId);
		undoTimeouts.delete(bookmarkId);
	}

	try {
		// Get the pending deletion record to find originalIndex and bookmark data
		const pendingResult = await chrome.storage.local.get([
			"pendingDeletions",
		]);
		const pending = pendingResult.pendingDeletions || [];
		const deletionRecord = pending.find((d) => d.bookmarkId === bookmarkId);

		if (deletionRecord) {
			// Restore bookmark to storage at original position
			const dataResult = await chrome.storage.local.get(["bookmarkData"]);
			const data = dataResult.bookmarkData || { bookmarks: [] };

			// Calculate restore index (handle edge cases)
			const restoreIndex =
				deletionRecord.originalIndex !== undefined
					? Math.min(
							deletionRecord.originalIndex,
							data.bookmarks.length,
						)
					: data.bookmarks.length; // Backward compatibility: append to end

			// Insert bookmark at original position
			data.bookmarks.splice(restoreIndex, 0, deletionRecord.bookmark);

			await chrome.storage.local.set({
				bookmarkData: {
					bookmarks: data.bookmarks,
					version: 1,
				},
			});

			// Remove from pending deletions
			const updated = pending.filter((d) => d.bookmarkId !== bookmarkId);
			await chrome.storage.local.set({ pendingDeletions: updated });

			// Refresh display
			await loadBookmarks();
			renderBookmarks();

			console.log(
				"[Popup] Bookmark restored at index",
				restoreIndex,
				":",
				bookmarkId,
			);
		}
	} catch (error) {
		console.error("[Popup] Error restoring bookmark:", error);
	}
}

/**
 * Permanently finalize deletion (bookmark already removed from storage)
 * This function is idempotent - safe to call on already-deleted bookmark
 * @param {string} bookmarkId - ID of the bookmark to finalize deletion for
 */
async function actuallyDeleteBookmark(bookmarkId) {
	try {
		// Clean up timeout tracking
		undoTimeouts.delete(bookmarkId);

		// Remove from pending deletions (bookmark already removed from bookmarkData)
		const pendingResult = await chrome.storage.local.get([
			"pendingDeletions",
		]);
		const pending = pendingResult.pendingDeletions || [];
		const updated = pending.filter((d) => d.bookmarkId !== bookmarkId);
		await chrome.storage.local.set({ pendingDeletions: updated });

		// Mark as deleted for sync purposes (so it gets removed from Google Drive too)
		await markBookmarkDeletedForSync(bookmarkId);

		console.log("[Popup] Bookmark deletion finalized:", bookmarkId);
	} catch (error) {
		console.error("[Popup] Error finalizing bookmark deletion:", error);
	}
}

/**
 * Mark bookmark as deleted for sync purposes
 * @param {string} bookmarkId - ID of the deleted bookmark
 */
async function markBookmarkDeletedForSync(bookmarkId) {
	try {
		const result = await chrome.storage.local.get(["deletedBookmarks"]);
		const deleted = result.deletedBookmarks || [];

		if (!deleted.includes(bookmarkId)) {
			deleted.push(bookmarkId);
			await chrome.storage.local.set({ deletedBookmarks: deleted });
			console.log(
				"[Popup] Marked bookmark as deleted for sync:",
				bookmarkId,
			);
		}
	} catch (error) {
		console.error(
			"[Popup] Error marking bookmark deleted for sync:",
			error,
		);
	}
}

/**
 * Delete a bookmark with undo option
 * Immediately removes from list for instant visual feedback
 * @param {string} bookmarkId - ID of the bookmark to delete
 * @param {Object} bookmark - Bookmark object (for notification message and restoration)
 */
async function deleteBookmark(bookmarkId, bookmark) {
	try {
		// Get current bookmarks and find the index of the one being deleted
		const dataResult = await chrome.storage.local.get(["bookmarkData"]);
		const data = dataResult.bookmarkData || { bookmarks: [] };
		const originalIndex = data.bookmarks.findIndex(
			(b) => b.id === bookmarkId,
		);

		// Immediately remove bookmark from storage (optimistic deletion)
		data.bookmarks = data.bookmarks.filter((b) => b.id !== bookmarkId);
		await chrome.storage.local.set({
			bookmarkData: {
				bookmarks: data.bookmarks,
				version: 1,
			},
		});

		// Add to pending deletions with original index for undo restoration
		const pendingResult = await chrome.storage.local.get([
			"pendingDeletions",
		]);
		const pending = pendingResult.pendingDeletions || [];
		pending.push({
			bookmarkId,
			bookmark,
			timestamp: Date.now(),
			originalIndex, // Store position for restoration
		});
		await chrome.storage.local.set({ pendingDeletions: pending });

		// Refresh display immediately (bookmark already removed from storage)
		await loadBookmarks();
		renderBookmarks();

		// Show undo notification with action button
		const bookmarkTitle = bookmark.title || bookmark.url;
		const truncatedTitle =
			bookmarkTitle.length > 100
				? bookmarkTitle.slice(0, 100) + "..."
				: bookmarkTitle;

		showNotification({
			message: chrome.i18n.getMessage("bookmarkDeleted", truncatedTitle),
			actionLabel: chrome.i18n.getMessage("undo"),
			actionCallback: async () => {
				await undoDelete(bookmark.id);
				hideNotification();
			},
			autoHide: false,
		});

		// Set timeout for permanent deletion
		const timeoutId = setTimeout(async () => {
			await actuallyDeleteBookmark(bookmark.id);
			hideNotification();
		}, undoHideSeconds * 1000);
		undoTimeouts.set(bookmark.id, timeoutId);
	} catch (error) {
		console.error("[Popup] Error initiating bookmark deletion:", error);
	}
}

/**
 * Load bookmarks from storage
 */
async function loadBookmarks() {
	try {
		const result = await chrome.storage.local.get(["bookmarkData"]);
		const data = result.bookmarkData || { bookmarks: [] };
		return data.bookmarks || [];
	} catch (error) {
		console.error("[Popup] Error loading bookmarks:", error);
		return [];
	}
}

/**
 * Render bookmarks to the UI
 */
function renderBookmarks() {
	const bookmarksList = document.getElementById("bookmarks-list");
	const emptyState = document.getElementById("empty-state");

	loadBookmarks().then((bookmarks) => {
		// Filter out expired bookmarks
		const activeBookmarks = filterExpiredBookmarks(bookmarks);

		// Show empty state if no bookmarks
		if (activeBookmarks.length === 0) {
			bookmarksList.style.display = "none";
			emptyState.style.display = "block";
			return;
		}

		// Hide empty state and show bookmarks
		bookmarksList.style.display = "block";
		emptyState.style.display = "none";

		// Clear existing list
		bookmarksList.innerHTML = "";

		// Render each bookmark
		activeBookmarks.forEach((bookmark) => {
			const remainingDays = calculateRemainingDays(bookmark.expiresAt);
			const urgent = isExpirationUrgent(remainingDays);

			const item = document.createElement("div");
			item.className = "bookmark-item";
			item.dataset.id = bookmark.id;

			// Get translated texts
			const deleteText = chrome.i18n.getMessage("delete");
			const placeholder = chrome.i18n.getMessage(
				"expirationDaysPlaceholder",
			);
			const tooltip = chrome.i18n.getMessage("expirationTooltip");

			item.innerHTML = `
        <div class="bookmark-info">
          <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
          <div class="bookmark-url">${escapeHtml(bookmark.url)}</div>
        </div>
        <div class="bookmark-actions">
          <input
            type="number"
            class="expiration-input ${urgent ? "urgent" : ""}"
            value="${remainingDays !== null ? remainingDays : ""}"
            placeholder="${escapeHtml(placeholder)}"
            title="${escapeHtml(tooltip)}"
            min="0"
            data-bookmark-id="${bookmark.id}"
            data-previous-value="${remainingDays !== null ? remainingDays : ""}"
          />
          <button class="bookmark-delete" data-id="${bookmark.id}">${escapeHtml(deleteText)}</button>
        </div>
      `;

			// Add click listener to bookmark info to open in new tab
			const bookmarkInfo = item.querySelector(".bookmark-info");
			bookmarkInfo.style.cursor = "pointer";
			bookmarkInfo.addEventListener("click", () => {
				chrome.tabs.create({ url: bookmark.url });
			});

			// Add delete button listener
			const deleteButton = item.querySelector(".bookmark-delete");
			deleteButton.addEventListener("click", () => {
				deleteBookmark(bookmark.id, bookmark);
			});

			bookmarksList.appendChild(item);
		});

		// Bind expiration input events
		bindExpirationInputEvents();
	});
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

/**
 * Save the current page as a bookmark
 */
async function saveCurrentPage() {
	try {
		// Get active tab
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});

		if (!tab) {
			showNotification({
				title: chrome.i18n.getMessage("cannotSave"),
				message: chrome.i18n.getMessage("noActivePage"),
			});
			return;
		}

		const { url, title } = tab;

		// Validate URL
		// if (
		// 	!url ||
		// 	(!url.startsWith("http://") && !url.startsWith("https://"))
		// ) {
		// 	showNotification({
		// 		title: chrome.i18n.getMessage("cannotSave"),
		// 		message: chrome.i18n.getMessage("onlyWebPages"),
		// 	});
		// 	return;
		// }

		// Check for duplicates
		const bookmarks = await loadBookmarks();
		const isDuplicate = bookmarks.some((b) => b.url === url);

		if (isDuplicate) {
			showNotification({
				title: chrome.i18n.getMessage("alreadyBookmarked"),
				message: chrome.i18n.getMessage("alreadyBookmarkedDesc"),
			});
			return;
		}

		// Get user preferences
		const prefsResult = await chrome.storage.local.get(["userPreferences"]);
		const prefs = prefsResult.userPreferences || {
			defaultExpirationDays: null,
			allowDuplicates: false,
		};

		// Create bookmark
		const now = Date.now();
		const bookmark = {
			id: generateUUID(),
			title: title || "",
			url: url,
			createdAt: now,
			expirationDays: prefs.defaultExpirationDays,
			expiresAt: prefs.defaultExpirationDays
				? now + prefs.defaultExpirationDays * 24 * 60 * 60 * 1000
				: null,
			faviconUrl: `chrome://favicon/${url}`,
			domain: extractDomain(url),
		};

		// Save to storage
		const dataResult = await chrome.storage.local.get(["bookmarkData"]);
		const data = dataResult.bookmarkData || { bookmarks: [] };
		data.bookmarks.push(bookmark);

		await chrome.storage.local.set({
			bookmarkData: {
				bookmarks: data.bookmarks,
				version: 1,
			},
		});

		// Refresh display
		await loadBookmarks();
		renderBookmarks();

		console.log("[Popup] Bookmark saved:", bookmark);
	} catch (error) {
		console.error("[Popup] Error saving page:", error);
		showNotification({
			title: chrome.i18n.getMessage("error"),
			message: chrome.i18n.getMessage("failedToSave"),
		});
	}
}

/**
 * Generate UUID v4
 * @returns {string} UUID
 */
function generateUUID() {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
		/[xy]/g,
		function (c) {
			const r = (Math.random() * 16) | 0;
			const v = c === "x" ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		},
	);
}

/**
 * Extract domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain or empty string
 */
function extractDomain(url) {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname;
	} catch {
		return "";
	}
}

/**
 * Check for pending deletions and set up timers
 * Handles backward compatibility with records missing originalIndex
 */
async function checkPendingDeletions() {
	try {
		const result = await chrome.storage.local.get(["pendingDeletions"]);
		const pending = result.pendingDeletions || [];
		const now = Date.now();

		for (const deletion of pending) {
			const elapsed = now - deletion.timestamp;
			const remaining = undoHideSeconds * 1000 - elapsed;

			if (remaining <= 0) {
				// Already expired, finalize deletion
				await actuallyDeleteBookmark(deletion.bookmarkId);
			} else {
				// Still has time left, set up timer
				const timeoutId = setTimeout(async () => {
					await actuallyDeleteBookmark(deletion.bookmarkId);
				}, remaining);
				undoTimeouts.set(deletion.bookmarkId, timeoutId);

				// Show toast for most recent deletion
				if (deletion === pending[pending.length - 1]) {
					const bookmarkTitle =
						deletion.bookmark.title || deletion.bookmark.url;
					const truncatedTitle =
						bookmarkTitle.length > 100
							? bookmarkTitle.slice(0, 100) + "..."
							: bookmarkTitle;
					showNotification({
						message: chrome.i18n.getMessage(
							"bookmarkDeleted",
							truncatedTitle,
						),
						actionLabel: chrome.i18n.getMessage("undo"),
						actionCallback: async () => {
							await undoDelete(deletion.bookmarkId);
							hideNotification();
						},
						autoHide: false,
					});
				}
			}
		}
	} catch (error) {
		console.error("[Popup] Error checking pending deletions:", error);
	}
}

/**
 * Initialize popup when DOM is ready
 */
document.addEventListener("DOMContentLoaded", async () => {
	console.log("[Popup] Initializing...");

	// STEP 1: Remove expired bookmarks FIRST (FR-001, FR-004)
	// This ensures users never see expired bookmarks
	await removeExpiredBookmarks();

	// STEP 2: Apply translations to all static text elements
	translatePage();

	// STEP 3: Load and render bookmarks
	await loadBookmarks();
	renderBookmarks();

	// Check for pending deletions
	await checkPendingDeletions();

	// Setup save button listener
	const saveButton = document.getElementById("save-button");
	if (saveButton) {
		saveButton.addEventListener("click", saveCurrentPage);
		console.log("[Popup] Save button listener attached");
	}

	// Setup sync button listener
	const syncButton = document.getElementById("sync-button");
	if (syncButton) {
		syncButton.addEventListener("click", handleSyncClick);
		console.log("[Popup] Sync button listener attached");
	}

	// Initialize sync button state
	await updateSyncButton();

	// Trigger sync on popup open if connected (T038)
	const syncState = await getSyncState();
	if (syncState.isConnected) {
		console.log("[Popup] Connected, triggering syncDown on open");
		sendMessageWithRetry({ type: "SYNC_NOW" }).catch((err) => {
			console.warn("[Popup] Could not trigger sync on open:", err);
		});
	}

	// Listen for sync state changes from background
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.type === "SYNC_STATE_CHANGED") {
			currentSyncState = message.payload;
			updateSyncButton();
		}
		if (message.type === "SYNC_COMPLETED") {
			console.log("[Popup] Sync completed");
			loadBookmarks().then(renderBookmarks);
		}
		if (message.type === "SYNC_ERROR") {
			console.error("[Popup] Sync error:", message.payload?.error);
		}
	});

	console.log("[Popup] Initialization complete");

	hideNotification();
});
