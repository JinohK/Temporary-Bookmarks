# Privacy Policy

**Last Updated:** March 9, 2026

## Introduction

Temporary Bookmarks ("we", "our", or "the Extension") respects your privacy and is committed to protecting your personal data. This privacy policy explains how the Extension collects, uses, and safeguards your information.

## Data Collection

### 1. Local Storage Data

The Extension stores the following data locally on your device using Chrome's storage API:

- **Bookmark Data:** URLs, page titles, creation timestamps, expiration settings
- **User Preferences:** Default expiration days, duplicate settings, notification preferences
- **Sync State:** Connection status, last sync time (only when Google Drive sync is enabled)
- **Pending Deletions:** Temporarily deleted bookmarks awaiting undo (automatically cleared after 3 seconds)

**Storage Location:** All data is stored locally on your device using `chrome.storage.local` and never transmitted to our servers.

### 2. Google Drive Sync (Optional)

If you choose to enable Google Drive synchronization:

- The Extension uses Chrome's Identity API and OAuth2 for secure authentication
- Your bookmark data is stored in your personal Google Drive account
- We use the `https://www.googleapis.com/auth/drive.file` scope, which allows access only to files created by this Extension
- **We do not have access to your Google Drive credentials or data**

### 3. Browser Tabs

The Extension requests access to your browser tabs to:

- Get the URL and title of the current page when you click "Save Page"
- This data is used only to create bookmarks and is not transmitted elsewhere

## Data Usage

We use the collected data solely to:

1. Save and manage your bookmarks locally
2. Synchronize bookmarks across your devices via Google Drive (if enabled)
3. Automatically delete expired bookmarks based on your settings
4. Provide undo functionality for deleted bookmarks (5-second window)

## Data Sharing

**We do not sell, rent, or share your personal data with third parties for marketing purposes.**

Your bookmark data is only shared with:

- Google Drive (if you explicitly enable sync) - stored in your personal account
- No other third parties receive your data

## Data Retention

- **Local Storage:** Bookmarks are stored until you delete them or they expire (based on your expiration settings)
- **Pending Deletions:** Temporarily deleted bookmarks are retained for 5 seconds to allow undo
- **Google Drive:** Bookmarks remain in your Google Drive until you delete them or disconnect sync

## Your Rights

You have the right to:

1. **Access:** View all your bookmarks in the Extension popup
2. **Delete:** Remove any bookmark individually or clear all data
3. **Export:** Access your data directly from Google Drive (if sync is enabled)
4. **Disable Sync:** Disconnect from Google Drive at any time

To clear all local data:

1. Open Chrome Extensions page (`chrome://extensions`)
2. Find "Temporary Bookmarks"
3. Click "Remove" or clear site data in Chrome settings

## Security

We implement reasonable security measures to protect your data:

- All data is stored locally using Chrome's secure storage API
- Google Drive sync uses OAuth2 for secure authentication
- The Extension does not collect or transmit any sensitive personal information

## Children's Privacy

The Extension is not intended for children under 13. We do not knowingly collect data from children under 13.

## Changes to This Policy

We may update this privacy policy from time to time. We will notify you of any changes by:

- Updating the "Last Updated" date
- Posting the new policy in the Extension

## Contact Us

If you have questions about this privacy policy or how we handle your data, please contact us:

- **GitHub Issues:** [https://github.com/your-username/temporary-bookmark/issues](https://github.com/your-username/temporary-bookmark/issues)

---

**Note:** This Extension is an open-source project. You can review the source code at: [https://github.com/your-username/temporary-bookmark](https://github.com/your-username/temporary-bookmark)
