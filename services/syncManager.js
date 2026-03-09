/**
 * Sync Manager Service
 * Orchestrates sync operations between local storage and Google Drive
 */

// Import dependencies (will be bundled)
import * as googleAuth from './googleAuth.js';
import * as googleDrive from './googleDrive.js';

// Storage keys
const SYNC_STATE_KEY = 'syncState';
const BOOKMARK_DATA_KEY = 'bookmarkData';
const PENDING_CHANGES_KEY = 'pendingSyncChanges';
const DELETED_BOOKMARKS_KEY = 'deletedBookmarks';

// Sync state
let isInitialized = false;
let isSyncing = false;

/**
 * Initialize sync manager
 * @returns {Promise<void>}
 */
async function init() {
	if (isInitialized) return;

	try {
		// Initialize auth module
		await googleAuth.init();

		// Initialize drive module with token getter
		await googleDrive.init(googleAuth.getToken);

		isInitialized = true;
		console.log('[SyncManager] Initialized');
	} catch (error) {
		console.error('[SyncManager] Initialization error:', error);
		throw error;
	}
}

/**
 * Get current sync state
 * @returns {Promise<object>}
 */
async function getSyncState() {
	try {
		const result = await chrome.storage.local.get([SYNC_STATE_KEY]);
		return result[SYNC_STATE_KEY] || {
			isConnected: false,
			syncEnabled: true,
			lastSyncTime: null,
			accountEmail: null,
			error: null,
			fileId: null
		};
	} catch (error) {
		console.error('[SyncManager] Error getting sync state:', error);
		return {
			isConnected: false,
			syncEnabled: true,
			lastSyncTime: null,
			accountEmail: null,
			error: null,
			fileId: null
		};
	}
}

/**
 * Update sync state
 * @param {object} updates - Partial state updates
 * @returns {Promise<void>}
 */
async function updateSyncState(updates) {
	const currentState = await getSyncState();
	await chrome.storage.local.set({
		[SYNC_STATE_KEY]: { ...currentState, ...updates }
	});

	// Notify listeners of state change
	chrome.runtime.sendMessage({
		type: 'SYNC_STATE_CHANGED',
		payload: { ...currentState, ...updates }
	}).catch(() => {
		// Ignore if no listeners
	});
}

/**
 * Connect to Google Drive
 * Performs auth flow and initial sync
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function connect() {
	try {
		// Ensure initialized
		await init();

		console.log('[SyncManager] Starting connection flow...');

		// Authenticate with Google
		const authResult = await googleAuth.connect();
		if (!authResult.success) {
			await updateSyncState({
				isConnected: false,
				error: authResult.error
			});
			return { success: false, error: authResult.error };
		}

		// Get or create sync file
		const { fileId, data } = await googleDrive.getOrCreateSyncFile();

		// Update sync state
		await updateSyncState({
			isConnected: true,
			accountEmail: authResult.email,
			fileId: fileId,
			error: null
		});

		console.log('[SyncManager] Connected successfully');

		// Perform initial sync
		await sync();

		return { success: true };
	} catch (error) {
		console.error('[SyncManager] Connection error:', error);

		await updateSyncState({
			isConnected: false,
			error: error.message || 'CONNECTION_FAILED'
		});

		return { success: false, error: error.message || 'CONNECTION_FAILED' };
	}
}

/**
 * Disconnect from Google Drive
 * Revokes auth and clears sync state
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function disconnect() {
	try {
		console.log('[SyncManager] Disconnecting...');

		// Get current state before clearing
		const currentState = await getSyncState();

		// Revoke auth
		await googleAuth.disconnect();

		// Clear sync state but preserve bookmarks
		await updateSyncState({
			isConnected: false,
			accountEmail: null,
			fileId: null,
			lastSyncTime: null,
			error: null
		});

		// Clear pending changes
		await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: [] });

		// Clear deleted bookmarks tracking
		await chrome.storage.local.set({ [DELETED_BOOKMARKS_KEY]: [] });

		console.log('[SyncManager] Disconnected successfully');

		return { success: true };
	} catch (error) {
		console.error('[SyncManager] Disconnect error:', error);
		return { success: false, error: error.message || 'DISCONNECT_FAILED' };
	}
}

/**
 * Merge bookmarks using last-modified-wins strategy
 * @param {Array} localBookmarks - Local bookmarks
 * @param {Array} remoteBookmarks - Remote bookmarks
 * @param {Set} deletedIds - Set of deleted bookmark IDs to exclude
 * @returns {Array} - Merged bookmarks
 */
function mergeBookmarks(localBookmarks, remoteBookmarks, deletedIds = new Set()) {
	const merged = new Map();

	// Add all local bookmarks (excluding deleted)
	localBookmarks.forEach(b => {
		if (deletedIds.has(b.id)) return; // Skip deleted
		const lastModified = b.lastModified || b.createdAt;
		merged.set(b.id, { ...b, lastModified });
	});

	// Merge with remote, keeping newer versions (excluding deleted)
	remoteBookmarks.forEach(r => {
		if (deletedIds.has(r.id)) return; // Skip deleted

		const existing = merged.get(r.id);
		const remoteModified = r.lastModified || r.createdAt;

		if (!existing) {
			// New from remote
			merged.set(r.id, { ...r, lastModified: remoteModified });
		} else if (remoteModified > existing.lastModified) {
			// Remote is newer
			merged.set(r.id, { ...r, lastModified: remoteModified });
		}
		// else: local is newer or equal, keep existing
	});

	return Array.from(merged.values());
}

/**
 * Get deleted bookmark IDs
 * @returns {Promise<Set<string>>}
 */
async function getDeletedBookmarkIds() {
	try {
		const result = await chrome.storage.local.get([DELETED_BOOKMARKS_KEY]);
		const deleted = result[DELETED_BOOKMARKS_KEY] || [];
		return new Set(deleted);
	} catch (error) {
		console.error('[SyncManager] Error getting deleted IDs:', error);
		return new Set();
	}
}

/**
 * Mark a bookmark as deleted (for sync purposes)
 * @param {string} bookmarkId - ID of deleted bookmark
 * @returns {Promise<void>}
 */
async function markBookmarkDeleted(bookmarkId) {
	try {
		const result = await chrome.storage.local.get([DELETED_BOOKMARKS_KEY]);
		const deleted = result[DELETED_BOOKMARKS_KEY] || [];

		if (!deleted.includes(bookmarkId)) {
			deleted.push(bookmarkId);
			await chrome.storage.local.set({ [DELETED_BOOKMARKS_KEY]: deleted });
		}

		console.log('[SyncManager] Marked bookmark as deleted:', bookmarkId);
	} catch (error) {
		console.error('[SyncManager] Error marking bookmark deleted:', error);
	}
}

/**
 * Clear deleted bookmark IDs after successful sync
 * @returns {Promise<void>}
 */
async function clearDeletedBookmarkIds() {
	try {
		await chrome.storage.local.set({ [DELETED_BOOKMARKS_KEY]: [] });
		console.log('[SyncManager] Cleared deleted bookmark IDs');
	} catch (error) {
		console.error('[SyncManager] Error clearing deleted IDs:', error);
	}
}

/**
 * Perform full sync (download + merge + upload)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sync() {
	if (isSyncing) {
		console.log('[SyncManager] Sync already in progress, skipping');
		return { success: true };
	}

	isSyncing = true;

	try {
		const state = await getSyncState();

		if (!state.isConnected || !state.fileId) {
			console.log('[SyncManager] Not connected, skipping sync');
			return { success: false, error: 'NOT_CONNECTED' };
		}

		console.log('[SyncManager] Starting full sync...');

		// Get deleted bookmark IDs
		const deletedIds = await getDeletedBookmarkIds();

		// Download remote data
		const remoteData = await googleDrive.readFile(state.fileId);

		// Get local data
		const localResult = await chrome.storage.local.get([BOOKMARK_DATA_KEY]);
		const localData = localResult[BOOKMARK_DATA_KEY] || { bookmarks: [], version: 1 };

		// Merge (excluding deleted)
		const mergedBookmarks = mergeBookmarks(
			localData.bookmarks || [],
			remoteData.bookmarks || [],
			deletedIds
		);

		// Save merged data locally
		await chrome.storage.local.set({
			[BOOKMARK_DATA_KEY]: {
				bookmarks: mergedBookmarks,
				version: localData.version
			}
		});

		// Upload merged data
		await googleDrive.writeFile(state.fileId, {
			version: 1,
			bookmarks: mergedBookmarks
		});

		// Update sync time and clear pending changes
		await updateSyncState({
			lastSyncTime: Date.now(),
			error: null
		});

		await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: [] });

		// Clear deleted IDs after successful sync
		await clearDeletedBookmarkIds();

		console.log('[SyncManager] Sync completed, bookmarks:', mergedBookmarks.length);

		// Notify listeners
		chrome.runtime.sendMessage({
			type: 'SYNC_COMPLETED',
			payload: { bookmarksCount: mergedBookmarks.length }
		}).catch(() => {});

		return { success: true };
	} catch (error) {
		console.error('[SyncManager] Sync error:', error);

		await updateSyncState({ error: error.message || 'SYNC_FAILED' });

		chrome.runtime.sendMessage({
			type: 'SYNC_ERROR',
			payload: { error: error.message || 'SYNC_FAILED' }
		}).catch(() => {});

		return { success: false, error: error.message || 'SYNC_FAILED' };
	} finally {
		isSyncing = false;
	}
}

/**
 * Sync local changes to Google Drive (upload only)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function syncUp() {
	if (isSyncing) {
		console.log('[SyncManager] Sync already in progress, queuing');
		return { success: true };
	}

	isSyncing = true;

	try {
		const state = await getSyncState();

		if (!state.isConnected || !state.fileId) {
			console.log('[SyncManager] Not connected, skipping upload');
			return { success: false, error: 'NOT_CONNECTED' };
		}

		console.log('[SyncManager] Starting upload sync...');

		// Get deleted bookmark IDs
		const deletedIds = await getDeletedBookmarkIds();

		// Get local data
		const localResult = await chrome.storage.local.get([BOOKMARK_DATA_KEY]);
		const localData = localResult[BOOKMARK_DATA_KEY] || { bookmarks: [], version: 1 };

		// Filter out deleted bookmarks and add lastModified
		const bookmarksWithTimestamp = (localData.bookmarks || [])
			.filter(b => !deletedIds.has(b.id))
			.map(b => ({
				...b,
				lastModified: b.lastModified || b.createdAt
			}));

		// Upload to Google Drive
		await googleDrive.writeFile(state.fileId, {
			version: 1,
			bookmarks: bookmarksWithTimestamp
		});

		// Update sync time
		await updateSyncState({
			lastSyncTime: Date.now(),
			error: null
		});

		// Clear pending changes
		await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: [] });

		// Clear deleted IDs after successful upload
		await clearDeletedBookmarkIds();

		console.log('[SyncManager] Upload completed');

		return { success: true };
	} catch (error) {
		console.error('[SyncManager] Upload error:', error);

		await updateSyncState({ error: error.message || 'UPLOAD_FAILED' });

		return { success: false, error: error.message || 'UPLOAD_FAILED' };
	} finally {
		isSyncing = false;
	}
}

/**
 * Pull changes from Google Drive (download + merge)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function syncDown() {
	if (isSyncing) {
		console.log('[SyncManager] Sync already in progress, skipping');
		return { success: true };
	}

	isSyncing = true;

	try {
		const state = await getSyncState();

		if (!state.isConnected || !state.fileId) {
			console.log('[SyncManager] Not connected, skipping download');
			return { success: false, error: 'NOT_CONNECTED' };
		}

		console.log('[SyncManager] Starting download sync...');

		// Get deleted bookmark IDs
		const deletedIds = await getDeletedBookmarkIds();

		// Download remote data
		const remoteData = await googleDrive.readFile(state.fileId);

		// Get local data
		const localResult = await chrome.storage.local.get([BOOKMARK_DATA_KEY]);
		const localData = localResult[BOOKMARK_DATA_KEY] || { bookmarks: [], version: 1 };

		// Merge (excluding deleted)
		const mergedBookmarks = mergeBookmarks(
			localData.bookmarks || [],
			remoteData.bookmarks || [],
			deletedIds
		);

		// Save merged data locally
		await chrome.storage.local.set({
			[BOOKMARK_DATA_KEY]: {
				bookmarks: mergedBookmarks,
				version: localData.version
			}
		});

		// Update sync time
		await updateSyncState({
			lastSyncTime: Date.now(),
			error: null
		});

		console.log('[SyncManager] Download completed, bookmarks:', mergedBookmarks.length);

		// Notify listeners
		chrome.runtime.sendMessage({
			type: 'SYNC_COMPLETED',
			payload: { bookmarksCount: mergedBookmarks.length }
		}).catch(() => {});

		return { success: true };
	} catch (error) {
		console.error('[SyncManager] Download error:', error);

		await updateSyncState({ error: error.message || 'DOWNLOAD_FAILED' });

		return { success: false, error: error.message || 'DOWNLOAD_FAILED' };
	} finally {
		isSyncing = false;
	}
}

/**
 * Queue a change for sync
 * @param {string} type - "add", "update", "delete"
 * @param {string} bookmarkId - Affected bookmark ID
 * @returns {Promise<void>}
 */
async function queueChange(type, bookmarkId) {
	try {
		const result = await chrome.storage.local.get([PENDING_CHANGES_KEY]);
		const pending = result[PENDING_CHANGES_KEY] || [];

		pending.push({
			type,
			bookmarkId,
			timestamp: Date.now()
		});

		await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: pending });
		console.log('[SyncManager] Queued change:', type, bookmarkId);
	} catch (error) {
		console.error('[SyncManager] Error queuing change:', error);
	}
}

/**
 * Get pending changes count
 * @returns {Promise<number>}
 */
async function getPendingCount() {
	try {
		const result = await chrome.storage.local.get([PENDING_CHANGES_KEY]);
		return (result[PENDING_CHANGES_KEY] || []).length;
	} catch (error) {
		console.error('[SyncManager] Error getting pending count:', error);
		return 0;
	}
}

// Initialize on load
init().catch(console.error);

export {
	init,
	getSyncState,
	connect,
	disconnect,
	sync,
	syncUp,
	syncDown,
	queueChange,
	getPendingCount,
	mergeBookmarks,
	markBookmarkDeleted
};
