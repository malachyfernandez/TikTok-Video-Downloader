# TikTok Video Downloader

A powerful Chrome extension that lets you download TikTok videos directly from your browser with multiple intelligent fallback methods.

## ✨ Features

- **Smart Video Detection** - Automatically finds TikTok videos on any page
- **Multiple Download Methods** - Blob URL, MediaRecorder, and fetch proxy fallbacks
- **Format Selection** - Choose between MP4 and WebM formats in settings
- **Adaptive Technology** - Handles TikTok's changing website structure
- **One-Click Downloads** - Simple, intuitive interface
- **Download History** - Track your downloaded videos
- **Smart Filtering** - Excludes video list thumbnails and previews

## 🚀 Installation

1. Download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. Pin the extension to your toolbar for easy access

## 📖 Usage

1. Navigate to any TikTok video page
2. Click the extension icon in your toolbar
3. If a video is detected, click "Download Video"
4. Choose your preferred format in settings (MP4 recommended)
5. Video downloads automatically to your default folder

**Pro Tip:** For best results, click download when the video is at the beginning (0:00).

## ⚙️ Settings

Access settings to customize:
- **Video Format** - MP4 (recommended) or WebM
- **Auto-Enable** - Start detection automatically
- **Download History** - View and manage your downloads
3. In the top right corner, **turn on Developer Mode** (toggle switch).

4. Click **"Load unpacked"** and select the folder where you downloaded this project.

That's it! You should now see TikTok Video Downloader in your list of extensions.

---

## 🎯 How to Use

1. **Navigate to TikTok**: Go to any TikTok video page (e.g., `tiktok.com/@username/video/...`)
2. **Click the extension icon**: Click on the TikTok Video Downloader icon in your Chrome toolbar
3. **Click Download**: Click the "Download Video" button in the popup
4. **Wait for completion**: The extension will automatically detect and download the video
5. **Find your video**: The video will be saved to your default downloads folder

---

## 🧠 Key Features

- **Multiple Detection Strategies**: Uses blob URLs, attributes, context, and ML-style scoring
- **Fallback Methods**: If one download method fails, automatically tries alternatives
- **Smart Adaptation**: Stores successful patterns for future detection
- **Progress Tracking**: Real-time progress updates during download
- **Cross-Platform Filenames**: Sanitized filenames work on all operating systems
- **Clean UI**: Modern, TikTok-inspired interface

---

## 💡 Built for people who:

- Want to save TikTok videos for offline viewing
- Need a reliable video downloader that adapts to website changes
- Prefer a simple, one-click download experience
- Want automatic video detection without manual URL copying

---

## 🔧 Technical Details

- **Detection Methods**: 7 strategies including blob URL detection, attribute matching, context selectors, ML-style scoring, and size/position heuristics
- **Download Methods**: 3 fallback strategies (blob fetch, MediaRecorder, source detection)
- **Adaptive Learning**: Stores successful detection patterns in Chrome storage
- **Real-time Monitoring**: Uses MutationObserver to detect new videos as you scroll
- **Filename Sanitization**: Cross-platform compatible filenames
- **Privacy**: All processing happens locally in your browser

---

## ⚠️ Known Limitations

- **Blob URL Access**: Some videos may require fallback recording methods
- **Video Quality**: Downloads the quality available in the player's current state
- **Structure Changes**: TikTok may change their layout (extension adapts automatically)
- **Performance**: Recording entire videos may take time for longer content

---

## 🛠️ File Structure

```
TikTokVideoDownloader/
├── manifest.json          # Extension configuration
├── content.js             # Video detection and download logic
├── background.js          # Download coordination and storage
├── popup.html             # Popup UI
├── popup.js               # Popup controller
├── options.html           # Settings page
├── options.js             # Settings logic
├── ICONFINAL.png          # Extension icon
└── README.md              # This file
```

---

✨ No complicated setup. No manual URL copying. TikTok Video Downloader is built to just work.

Made with ❤️ for seamless video downloading.

**Version**: 1.0.0
