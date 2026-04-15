/**
 * Sync Manager Service
 * Orchestrates sync operations between local storage and Google Drive
 */

import * as googleAuth from "./googleAuth.js";
import * as googleDrive from "./googleDrive.js";

const SYNC_STATE_KEY = "syncState";
const BOOKMARK_DATA_KEY = "bookmarkData";
const PENDING_CHANGES_KEY = "pendingSyncChanges";
const DELETED_BOOKMARKS_KEY = "deletedBookmarks";

const TOMBSTONE_TTL_MS = 15 * 24 * 60 * 60 * 1000;

let isInitialized = false;
let isSyncing = false;

async function init() {
	if (isInitialized) return;

	try {
		await googleAuth.init();
		await googleDrive.init(googleAuth.getToken);

		isInitialized = true;
		console.log("[SyncManager] Initialized");
	} catch (error) {
		console.error("[SyncManager] Initialization error:", error);
		throw error;
	}
}

async function getSyncState() {
	try {
		const result = await chrome.storage.local.get([SYNC_STATE_KEY]);
		return (
			result[SYNC_STATE_KEY] || {
				isConnected: false,
				syncEnabled: true,
				lastSyncTime: null,
				accountEmail: null,
				error: null,
				fileId: null,
			}
		);
	} catch (error) {
		console.error("[SyncManager] Error getting sync state:", error);
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

async function updateSyncState(updates) {
	const currentState = await getSyncState();
	await chrome.storage.local.set({
		[SYNC_STATE_KEY]: { ...currentState, ...updates },
	});

	chrome.runtime
		.sendMessage({
			type: "SYNC_STATE_CHANGED",
			payload: { ...currentState, ...updates },
		})
		.catch(() => {});
}

function normalizeBookmark(bookmark) {
	return {
		...bookmark,
		lastModified: bookmark.lastModified || bookmark.createdAt || Date.now(),
	};
}

function normalizeTombstones(entries = []) {
	return entries
		.map((entry) => {
			if (typeof entry === "string") {
				return { id: entry, deletedAt: Date.now() };
			}
			if (!entry || typeof entry !== "object" || !entry.id) {
				return null;
			}

			const deletedAt =
				typeof entry.deletedAt === "number" ? entry.deletedAt : Date.now();

			return {
				id: entry.id,
				deletedAt,
			};
		})
		.filter(Boolean);
}

function pruneExpiredTombstones(tombstones, now = Date.now()) {
	const cutoff = now - TOMBSTONE_TTL_MS;
	return normalizeTombstones(tombstones).filter(
		(tombstone) => tombstone.deletedAt >= cutoff,
	);
}

function mergeTombstones(...groups) {
	const merged = new Map();

	groups.flat().forEach((tombstone) => {
		if (!tombstone?.id) return;

		const existing = merged.get(tombstone.id);
		if (!existing || tombstone.deletedAt > existing.deletedAt) {
			merged.set(tombstone.id, tombstone);
		}
	});

	return merged;
}

function buildSyncPayload(bookmarks, tombstones) {
	return {
		version: 1,
		bookmarks,
		deletedBookmarks: tombstones,
	};
}

function normalizeRemoteData(data = {}) {
	return {
		version: data.version || 1,
		bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
		deletedBookmarks: pruneExpiredTombstones(data.deletedBookmarks || []),
	};
}

function resolveBookmarksAndTombstones(
	localBookmarks,
	remoteBookmarks,
	tombstones = [],
) {
	const mergedBookmarks = new Map();
	const tombstoneMap = mergeTombstones(tombstones);

	[...localBookmarks, ...remoteBookmarks].forEach((bookmark) => {
		const normalized = normalizeBookmark(bookmark);
		const existing = mergedBookmarks.get(normalized.id);

		if (!existing || normalized.lastModified > existing.lastModified) {
			mergedBookmarks.set(normalized.id, normalized);
		}
	});

	for (const [id, bookmark] of mergedBookmarks.entries()) {
		const tombstone = tombstoneMap.get(id);
		if (!tombstone) continue;

		if (tombstone.deletedAt >= bookmark.lastModified) {
			mergedBookmarks.delete(id);
			continue;
		}

		tombstoneMap.delete(id);
	}

	return {
		bookmarks: Array.from(mergedBookmarks.values()),
		tombstones: Array.from(tombstoneMap.values()),
	};
}

async function getDeletedBookmarkTombstones() {
	try {
		const result = await chrome.storage.local.get([DELETED_BOOKMARKS_KEY]);
		return pruneExpiredTombstones(result[DELETED_BOOKMARKS_KEY] || []);
	} catch (error) {
		console.error("[SyncManager] Error getting deleted tombstones:", error);
		return [];
	}
}

async function setDeletedBookmarkTombstones(tombstones) {
	const pruned = pruneExpiredTombstones(tombstones);
	await chrome.storage.local.set({ [DELETED_BOOKMARKS_KEY]: pruned });
}

async function markBookmarkDeleted(bookmarkId, deletedAt = Date.now()) {
	try {
		const tombstones = await getDeletedBookmarkTombstones();
		const merged = mergeTombstones(tombstones, [{ id: bookmarkId, deletedAt }]);
		await setDeletedBookmarkTombstones(Array.from(merged.values()));
		console.log("[SyncManager] Marked bookmark as deleted:", bookmarkId);
	} catch (error) {
		console.error("[SyncManager] Error marking bookmark deleted:", error);
	}
}

async function getLocalBookmarkData() {
	const localResult = await chrome.storage.local.get([BOOKMARK_DATA_KEY]);
	return localResult[BOOKMARK_DATA_KEY] || { bookmarks: [], version: 1 };
}

async function saveLocalState(bookmarks, tombstones, version = 1) {
	await chrome.storage.local.set({
		[BOOKMARK_DATA_KEY]: {
			bookmarks,
			version,
		},
		[DELETED_BOOKMARKS_KEY]: pruneExpiredTombstones(tombstones),
	});
}

async function syncCore(mode = "full") {
	const state = await getSyncState();

	if (!state.isConnected || !state.fileId) {
		console.log("[SyncManager] Not connected, skipping sync");
		return { success: false, error: "NOT_CONNECTED" };
	}

	const localData = await getLocalBookmarkData();
	const localBookmarks = localData.bookmarks || [];
	const localTombstones = await getDeletedBookmarkTombstones();

	const remoteData = normalizeRemoteData(
		await googleDrive.readFile(state.fileId),
	);

	const { bookmarks, tombstones } = resolveBookmarksAndTombstones(
		localBookmarks,
		remoteData.bookmarks || [],
		[...localTombstones, ...(remoteData.deletedBookmarks || [])],
	);

	await saveLocalState(bookmarks, tombstones, localData.version || 1);

	if (mode !== "download") {
		await googleDrive.writeFile(
			state.fileId,
			buildSyncPayload(bookmarks, tombstones),
		);
	}

	await updateSyncState({
		lastSyncTime: Date.now(),
		error: null,
	});

	if (mode !== "download") {
		await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: [] });
	}

	return {
		success: true,
		bookmarks,
		tombstones,
	};
}

async function connect() {
	try {
		await init();

		console.log("[SyncManager] Starting connection flow...");

		const authResult = await googleAuth.connect();
		if (!authResult.success) {
			await updateSyncState({
				isConnected: false,
				error: authResult.error,
			});
			return { success: false, error: authResult.error };
		}

		const { fileId } = await googleDrive.getOrCreateSyncFile();

		await updateSyncState({
			isConnected: true,
			accountEmail: authResult.email,
			fileId,
			error: null,
		});

		console.log("[SyncManager] Connected successfully");

		await sync();

		return { success: true };
	} catch (error) {
		console.error("[SyncManager] Connection error:", error);

		await updateSyncState({
			isConnected: false,
			error: error.message || "CONNECTION_FAILED",
		});

		return { success: false, error: error.message || "CONNECTION_FAILED" };
	}
}

async function disconnect() {
	try {
		console.log("[SyncManager] Disconnecting...");

		await googleAuth.disconnect();

		await updateSyncState({
			isConnected: false,
			accountEmail: null,
			fileId: null,
			lastSyncTime: null,
			error: null,
		});

		await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: [] });

		console.log("[SyncManager] Disconnected successfully");

		return { success: true };
	} catch (error) {
		console.error("[SyncManager] Disconnect error:", error);
		return { success: false, error: error.message || "DISCONNECT_FAILED" };
	}
}

function mergeBookmarks(localBookmarks, remoteBookmarks, tombstones = []) {
	return resolveBookmarksAndTombstones(
		localBookmarks,
		remoteBookmarks,
		tombstones,
	).bookmarks;
}

async function sync() {
	if (isSyncing) {
		console.log("[SyncManager] Sync already in progress, skipping");
		return { success: true };
	}

	isSyncing = true;

	try {
		console.log("[SyncManager] Starting full sync...");

		const result = await syncCore("full");

		console.log(
			"[SyncManager] Sync completed, bookmarks:",
			result.bookmarks.length,
		);

		chrome.runtime
			.sendMessage({
				type: "SYNC_COMPLETED",
				payload: { bookmarksCount: result.bookmarks.length },
			})
			.catch(() => {});

		return { success: true };
	} catch (error) {
		console.error("[SyncManager] Sync error:", error);

		await updateSyncState({ error: error.message || "SYNC_FAILED" });

		chrome.runtime
			.sendMessage({
				type: "SYNC_ERROR",
				payload: { error: error.message || "SYNC_FAILED" },
			})
			.catch(() => {});

		return { success: false, error: error.message || "SYNC_FAILED" };
	} finally {
		isSyncing = false;
	}
}

async function syncUp() {
	if (isSyncing) {
		console.log("[SyncManager] Sync already in progress, queuing");
		return { success: true };
	}

	isSyncing = true;

	try {
		console.log("[SyncManager] Starting upload sync...");
		await syncCore("upload");
		console.log("[SyncManager] Upload completed");
		return { success: true };
	} catch (error) {
		console.error("[SyncManager] Upload error:", error);
		await updateSyncState({ error: error.message || "UPLOAD_FAILED" });
		return { success: false, error: error.message || "UPLOAD_FAILED" };
	} finally {
		isSyncing = false;
	}
}

async function syncDown() {
	if (isSyncing) {
		console.log("[SyncManager] Sync already in progress, skipping");
		return { success: true };
	}

	isSyncing = true;

	try {
		console.log("[SyncManager] Starting download sync...");
		const result = await syncCore("download");

		console.log(
			"[SyncManager] Download completed, bookmarks:",
			result.bookmarks.length,
		);

		chrome.runtime
			.sendMessage({
				type: "SYNC_COMPLETED",
				payload: { bookmarksCount: result.bookmarks.length },
			})
			.catch(() => {});

		return { success: true };
	} catch (error) {
		console.error("[SyncManager] Download error:", error);
		await updateSyncState({ error: error.message || "DOWNLOAD_FAILED" });
		return { success: false, error: error.message || "DOWNLOAD_FAILED" };
	} finally {
		isSyncing = false;
	}
}

async function queueChange(type, bookmarkId) {
	try {
		const result = await chrome.storage.local.get([PENDING_CHANGES_KEY]);
		const pending = result[PENDING_CHANGES_KEY] || [];

		pending.push({
			type,
			bookmarkId,
			timestamp: Date.now(),
		});

		await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: pending });
		console.log("[SyncManager] Queued change:", type, bookmarkId);
	} catch (error) {
		console.error("[SyncManager] Error queuing change:", error);
	}
}

async function getPendingCount() {
	try {
		const result = await chrome.storage.local.get([PENDING_CHANGES_KEY]);
		return (result[PENDING_CHANGES_KEY] || []).length;
	} catch (error) {
		console.error("[SyncManager] Error getting pending count:", error);
		return 0;
	}
}

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
	markBookmarkDeleted,
};
