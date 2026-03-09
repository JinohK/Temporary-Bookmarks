/**
 * Google Authentication Service
 * Handles OAuth 2.0 authentication with Google using Chrome Identity API
 */

// Storage key for auth state
const AUTH_STATE_KEY = 'authState';

// Default auth state
const DEFAULT_AUTH_STATE = {
	isAuthenticated: false,
	accountEmail: null,
	tokenExpiry: null
};

/**
 * Initialize authentication module
 * Ensures auth state exists in storage
 * @returns {Promise<void>}
 */
async function init() {
	try {
		const result = await chrome.storage.local.get([AUTH_STATE_KEY]);
		if (!result[AUTH_STATE_KEY]) {
			await chrome.storage.local.set({
				[AUTH_STATE_KEY]: DEFAULT_AUTH_STATE
			});
		}
		console.log('[GoogleAuth] Module initialized');
	} catch (error) {
		console.error('[GoogleAuth] Initialization error:', error);
		throw error;
	}
}

/**
 * Check if user is currently authenticated
 * @returns {Promise<boolean>}
 */
async function isAuthenticated() {
	try {
		const result = await chrome.storage.local.get([AUTH_STATE_KEY]);
		const authState = result[AUTH_STATE_KEY] || DEFAULT_AUTH_STATE;

		// Check if we have a valid token
		if (!authState.isAuthenticated) {
			return false;
		}

		// Verify token is still valid by trying to get it silently
		const token = await getToken();
		return token !== null;
	} catch (error) {
		console.error('[GoogleAuth] Error checking auth status:', error);
		return false;
	}
}

/**
 * Get current access token (silent)
 * Returns cached token or fetches new one
 * @returns {Promise<string|null>}
 */
async function getToken() {
	return new Promise((resolve) => {
		chrome.identity.getAuthToken({ interactive: false }, (token) => {
			if (chrome.runtime.lastError) {
				console.log('[GoogleAuth] No cached token available:', chrome.runtime.lastError.message);
				resolve(null);
			} else {
				resolve(token);
			}
		});
	});
}

/**
 * Get connected account info
 * @returns {Promise<{email: string|null}>}
 */
async function getAccountInfo() {
	try {
		const result = await chrome.storage.local.get([AUTH_STATE_KEY]);
		const authState = result[AUTH_STATE_KEY] || DEFAULT_AUTH_STATE;
		return { email: authState.accountEmail };
	} catch (error) {
		console.error('[GoogleAuth] Error getting account info:', error);
		return { email: null };
	}
}

/**
 * Start interactive authentication flow
 * Shows consent screen to user
 * @returns {Promise<{success: boolean, token?: string, email?: string, error?: string}>}
 */
async function connect() {
	return new Promise(async (resolve) => {
		try {
			chrome.identity.getAuthToken({ interactive: true }, async (token) => {
				if (chrome.runtime.lastError) {
					const errorMessage = chrome.runtime.lastError.message;
					console.error('[GoogleAuth] Auth failed:', errorMessage);

					// Update state
					await chrome.storage.local.set({
						[AUTH_STATE_KEY]: {
							...DEFAULT_AUTH_STATE,
							isAuthenticated: false
						}
					});

					resolve({
						success: false,
						error: errorMessage.includes('cancelled') ? 'AUTH_CANCELLED' : 'AUTH_FAILED'
					});
					return;
				}

				// Get user info from Google API
				let email = null;
				try {
					const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
						headers: { Authorization: `Bearer ${token}` }
					});
					if (response.ok) {
						const userInfo = await response.json();
						email = userInfo.email;
					}
				} catch (e) {
					console.warn('[GoogleAuth] Could not fetch user info:', e);
				}

				// Update auth state
				await chrome.storage.local.set({
					[AUTH_STATE_KEY]: {
						isAuthenticated: true,
						accountEmail: email,
						tokenExpiry: Date.now() + 3600000 // ~1 hour
					}
				});

				console.log('[GoogleAuth] Successfully authenticated:', email);
				resolve({
					success: true,
					token,
					email
				});
			});
		} catch (error) {
			console.error('[GoogleAuth] Connect error:', error);
			resolve({
				success: false,
				error: 'NETWORK_ERROR'
			});
		}
	});
}

/**
 * Disconnect and revoke access
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function disconnect() {
	return new Promise(async (resolve) => {
		try {
			// Get current token to revoke
			chrome.identity.getAuthToken({ interactive: false }, async (token) => {
				if (token) {
					// Revoke token on Google's side
					try {
						await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
					} catch (e) {
						console.warn('[GoogleAuth] Could not revoke token on server:', e);
					}

					// Remove cached token
					chrome.identity.removeCachedAuthToken({ token }, () => {
						if (chrome.runtime.lastError) {
							console.warn('[GoogleAuth] Error removing cached token:', chrome.runtime.lastError);
						}
					});
				}

				// Clear auth state
				await chrome.storage.local.set({
					[AUTH_STATE_KEY]: DEFAULT_AUTH_STATE
				});

				console.log('[GoogleAuth] Disconnected successfully');
				resolve({ success: true });
			});
		} catch (error) {
			console.error('[GoogleAuth] Disconnect error:', error);
			resolve({
				success: false,
				error: 'DISCONNECT_FAILED'
			});
		}
	});
}

/**
 * Clear authentication state without revoking token
 * Used when token is already invalid
 * @returns {Promise<void>}
 */
async function clearAuthState() {
	await chrome.storage.local.set({
		[AUTH_STATE_KEY]: DEFAULT_AUTH_STATE
	});
}

export {
	init,
	isAuthenticated,
	getToken,
	getAccountInfo,
	connect,
	disconnect,
	clearAuthState
};
