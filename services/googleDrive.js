/**
 * Google Drive Service
 * Handles file operations with Google Drive API v3
 */

// Constants
const SYNC_FILE_NAME = "chrome-temporary-bookmarks.json";
const MIME_TYPE = "application/json";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

// Token getter function (set by init)
let getAuthToken = null;

/**
 * Initialize Google Drive module
 * @param {function} tokenGetter - Function to retrieve auth token
 * @returns {Promise<void>}
 */
async function init(tokenGetter) {
	getAuthToken = tokenGetter;
	console.log("[GoogleDrive] Module initialized");
}

/**
 * Make authenticated request to Google Drive API
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function apiRequest(endpoint, options = {}) {
	const token = await getAuthToken();
	if (!token) {
		throw new Error("AUTH_ERROR");
	}

	const url = endpoint.startsWith("http")
		? endpoint
		: `${DRIVE_API_BASE}${endpoint}`;

	const response = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});

	if (response.status === 401) {
		throw new Error("AUTH_ERROR");
	}

	if (response.status === 403) {
		const error = await response.text();
		if (error.includes("quota")) {
			throw new Error("QUOTA_EXCEEDED");
		}
		throw new Error("FORBIDDEN");
	}

	if (!response.ok && response.status !== 404) {
		throw new Error(`API_ERROR: ${response.status}`);
	}

	return response;
}

/**
 * Find or create the bookmark sync file
 * @returns {Promise<{fileId: string, data: object|null}>}
 */
async function getOrCreateSyncFile() {
	try {
		// Search for existing file
		const searchResponse = await apiRequest(
			`/files?q=name='${SYNC_FILE_NAME}' and trashed=false&spaces=drive&fields=files(id,name)`,
		);

		const searchResult = await searchResponse.json();

		if (searchResult.files && searchResult.files.length > 0) {
			// File exists, read its content
			const file = searchResult.files[0];
			console.log("[GoogleDrive] Found existing sync file:", file.id);

			try {
				const data = await readFile(file.id);
				return { fileId: file.id, data };
			} catch (readError) {
				console.warn(
					"[GoogleDrive] Could not read existing file, creating new:",
					readError,
				);
				// If we can't read it, delete and recreate
				await deleteFile(file.id);
			}
		}

		// Create new file
		console.log("[GoogleDrive] Creating new sync file");

		// First, create the file metadata
		const createResponse = await apiRequest("/files?fields=id,name", {
			method: "POST",
			body: JSON.stringify({
				name: SYNC_FILE_NAME,
				mimeType: MIME_TYPE,
			}),
		});

		const newFile = await createResponse.json();
		console.log("[GoogleDrive] Created sync file:", newFile.id);

		// Initialize with empty data
		const initialData = {
			version: 1,
			lastModified: Date.now(),
			bookmarks: [],
		};

		await writeFile(newFile.id, initialData);

		return { fileId: newFile.id, data: initialData };
	} catch (error) {
		console.error("[GoogleDrive] Error getting/creating sync file:", error);
		throw error;
	}
}

/**
 * Read bookmark data from Google Drive
 * @param {string} fileId - File ID to read
 * @returns {Promise<object>}
 */
async function readFile(fileId) {
	try {
		const response = await apiRequest(`/files/${fileId}?alt=media`);

		if (!response.ok) {
			if (response.status === 404) {
				throw new Error("FILE_NOT_FOUND");
			}
			throw new Error(`READ_ERROR: ${response.status}`);
		}

		const text = await response.text();
		const data = JSON.parse(text);
		console.log(
			"[GoogleDrive] Read file successfully, bookmarks count:",
			data.bookmarks?.length || 0,
		);

		return data;
	} catch (error) {
		console.error("[GoogleDrive] Error reading file:", error);
		throw error;
	}
}

/**
 * Write bookmark data to Google Drive
 * @param {string} fileId - File ID to write
 * @param {object} data - Data to write
 * @returns {Promise<{success: boolean, lastModified: number}>}
 */
async function writeFile(fileId, data) {
	try {
		const lastModified = Date.now();
		const dataToWrite = {
			...data,
			lastModified,
		};

		// Use multipart upload for updating file content
		const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;

		const token = await getAuthToken();
		if (!token) {
			throw new Error("AUTH_ERROR");
		}

		const response = await fetch(uploadUrl, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": MIME_TYPE,
			},
			body: JSON.stringify(dataToWrite),
		});

		if (!response.ok) {
			if (response.status === 403) {
				throw new Error("QUOTA_EXCEEDED");
			}
			throw new Error(`WRITE_ERROR: ${response.status}`);
		}

		console.log("[GoogleDrive] File written successfully");
		return { success: true, lastModified };
	} catch (error) {
		console.error("[GoogleDrive] Error writing file:", error);
		throw error;
	}
}

/**
 * Delete the sync file
 * @param {string} fileId - File ID to delete
 * @returns {Promise<{success: boolean}>}
 */
async function deleteFile(fileId) {
	try {
		const response = await apiRequest(`/files/${fileId}`, {
			method: "DELETE",
		});

		if (response.ok || response.status === 404) {
			console.log("[GoogleDrive] File deleted successfully");
			return { success: true };
		}

		throw new Error(`DELETE_ERROR: ${response.status}`);
	} catch (error) {
		console.error("[GoogleDrive] Error deleting file:", error);
		throw error;
	}
}

export { init, getOrCreateSyncFile, readFile, writeFile, deleteFile };
