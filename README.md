# 📌 Temporary Bookmarks

> A Chrome extension for managing temporary bookmarks with auto-expiration and Google Drive sync

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=google-chrome)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)

## ✨ Features

- **🎯 One-Click Save** - Instantly save the current page as a temporary bookmark
- **⏰ Auto-Expiration** - Set custom expiration dates or make bookmarks permanent
- **↩️ Undo Delete** - 3-second window to restore accidentally deleted bookmarks
- **☁️ Google Drive Sync** - Sync bookmarks across multiple devices securely
- **🌍 Multi-Language** - Supports English and Korean
- **🔒 Privacy First** - All data stored locally, optional cloud sync

## 🛠️ Tech Stack

- **Chrome Extension Manifest V3**
- **JavaScript ES2020+**
- **Chrome Storage API**
- **Chrome Alarms API**
- **Google Drive API (OAuth2)**

## 📦 Installation

### From Chrome Web Store

[🏪 Install from Chrome Web Store](https://chrome.google.com/webstore/detail/adclfhflhjnpdahjcnliibmddpolfaga)

### From Source

1. Clone this repository

```bash
git clone https://github.com/JinohK/Temporary-Bookmarks.git
cd temporary-bookmarks
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the `extension` folder

## 🚀 Usage

### Saving a Bookmark

1. Click the extension icon in your browser toolbar
2. Click the "Save Page" button
3. The current page will be saved as a bookmark

### Setting Expiration

1. Find the bookmark in the list
2. Enter the number of days in the input field next to the bookmark
3. Leave empty or enter `0` for permanent storage

### Deleting a Bookmark

1. Click the "Delete" button next to any bookmark
2. Click "Undo" within 3 seconds to restore the bookmark

### Syncing with Google Drive

1. Click the "Connect" button in the popup
2. Sign in with your Google account
3. Grant permission to access Google Drive
4. Bookmarks will automatically sync across devices

## 🔒 Privacy

This extension respects your privacy:

- **Local Storage** - All data stored locally by default
- **Optional Sync** - Google Drive sync is opt-in only
- **No Tracking** - No analytics or tracking scripts
- **Open Source** - All code is publicly auditable

For more details, see [PRIVACY.md](PRIVACY.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📧 Contact

If you have any questions, suggestions, or issues:

- **GitHub Issues:** [https://github.com/JinohK/Temporary-Bookmarks/issues](https://github.com/JinohK/Temporary-Bookmarks/issues)
