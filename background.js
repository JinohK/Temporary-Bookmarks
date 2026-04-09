/**
 * Background Service Worker for Temporary Bookmark Extension
 * Handles browser action and sync
 *
 * NOTE: Expiration check moved to popup.js (feature 009)
 * NOTE: Sync now happens on popup open instead of periodic alarm (feature 010)
 */

/**
 * Import sync services
 */
import * as googleAuth from "./services/googleAuth.js";
import * as googleDrive from "./services/googleDrive.js";
import * as syncManager from "./services/syncManager.js";

/**
 * Storage change listener
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName === "local") {
		console.log("[Background] Storage changed:", changes);

		// Trigger syncUp only for actual local edits queued for upload.
		if (
			changes.bookmarkData ||
			changes.pendingSyncChanges ||
			changes.deletedBookmarks
		) {
			triggerSyncUp();
		}
	}
});

/**
 * Trigger upload sync if connected
 */
async function triggerSyncUp() {
	try {
		const result = await chrome.storage.local.get([
			"syncState",
			"pendingSyncChanges",
			"deletedBookmarks",
		]);
		const syncState = result.syncState;
		const pendingChanges = result.pendingSyncChanges || [];
		const deletedBookmarks = result.deletedBookmarks || [];

		if (
			syncState &&
			syncState.isConnected &&
			(pendingChanges.length > 0 || deletedBookmarks.length > 0)
		) {
			console.log("[Background] Local changes detected, triggering syncUp");
			await syncManager.syncUp();
		}
	} catch (error) {
		console.error("[Background] Error triggering syncUp:", error);
	}
}

/**
 * Message listener for popup communication
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log("[Background] Received message:", message.type);

	if (message.type === "SYNC_CONNECT") {
		syncManager
			.connect()
			.then((result) => sendResponse(result))
			.catch((error) =>
				sendResponse({ success: false, error: error.message }),
			);
		return true; // Keep channel open for async response
	}

	if (message.type === "SYNC_DISCONNECT") {
		syncManager
			.disconnect()
			.then((result) => sendResponse(result))
			.catch((error) =>
				sendResponse({ success: false, error: error.message }),
			);
		return true;
	}

	if (message.type === "SYNC_NOW") {
		syncManager
			.sync()
			.then((result) => sendResponse(result))
			.catch((error) =>
				sendResponse({ success: false, error: error.message }),
			);
		return true;
	}

	if (message.type === "GET_SYNC_STATE") {
		syncManager
			.getSyncState()
			.then((state) => sendResponse(state))
			.catch((error) => sendResponse(null));
		return true;
	}

	return false;
});

/**
 * Initialize extension on installation or update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
	console.log("[Background] Extension installed/updated:", details.reason);

	// Clear old alarms (feature 009 & 010 cleanup)
	await chrome.alarms.clear("expiration-check");
	await chrome.alarms.clear("sync-check");
	console.log("[Background] Cleared old alarms");

	// Initialize storage schema if needed
	const result = await chrome.storage.local.get([
		"bookmarkData",
		"userPreferences",
		"syncState",
		"pendingSyncChanges",
		"deletedBookmarks",
	]);

	if (!result.bookmarkData) {
		await chrome.storage.local.set({
			bookmarkData: {
				bookmarks: [],
				version: 1,
			},
		});
	}

	if (!result.userPreferences) {
		await chrome.storage.local.set({
			userPreferences: {
				defaultExpirationDays: null,
				allowDuplicates: false,
				showNotifications: true,
				theme: "system",
			},
		});
	}

	// Initialize sync state for Google Drive sync
	if (!result.syncState) {
		await chrome.storage.local.set({
			syncState: {
				isConnected: false,
				syncEnabled: true,
				lastSyncTime: null,
				accountEmail: null,
				error: null,
				fileId: null,
			},
		});
	}

	// Initialize pending sync changes array
	if (!result.pendingSyncChanges) {
		await chrome.storage.local.set({
			pendingSyncChanges: [],
		});
	}

	// Initialize deleted bookmarks array for sync
	if (!result.deletedBookmarks) {
		await chrome.storage.local.set({
			deletedBookmarks: [],
		});
	}
});

// Initialize sync services
syncManager.init().catch(console.error);

console.log("[Background] Service worker loaded");
