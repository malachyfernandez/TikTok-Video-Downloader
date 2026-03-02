/**
 * TikTok Video Downloader - Background Script
 * Handles download coordination and storage
 */

// Comprehensive logging system
class Logger {
  constructor() {
    this.enabled = true;
    this.prefix = '[TT-Downloader-BG]';
    this.maxLogs = 500; // Keep only last 500 logs
  }
  
  async storeLog(level, message, data = null) {
    try {
      const result = await chrome.storage.local.get(['debugLogs']);
      const logs = result.debugLogs || [];
      
      const logEntry = {
        timestamp: Date.now(),
        level: level,
        message: message,
        data: data ? String(data) : null
      };
      
      logs.unshift(logEntry);
      
      // Keep only the most recent logs
      if (logs.length > this.maxLogs) {
        logs.splice(this.maxLogs);
      }
      
      await chrome.storage.local.set({ debugLogs: logs });
    } catch (error) {
      console.error('Failed to store log:', error);
    }
  }
  
  log(message, data = null) {
    if (!this.enabled) return;
    console.log(`${this.prefix} ${message}`, data || '');
    this.storeLog('log', message, data);
  }
  
  error(message, error = null) {
    if (!this.enabled) return;
    console.error(`${this.prefix} ERROR: ${message}`, error || '');
    this.storeLog('error', message, error);
  }
  
  warn(message, data = null) {
    if (!this.enabled) return;
    console.warn(`${this.prefix} WARNING: ${message}`, data || '');
    this.storeLog('warn', message, data);
  }
  
  info(message, data = null) {
    if (!this.enabled) return;
    console.info(`${this.prefix} INFO: ${message}`, data || '');
    this.storeLog('info', message, data);
  }
  
  debug(message, data = null) {
    if (!this.enabled) return;
    console.debug(`${this.prefix} DEBUG: ${message}`, data || '');
    this.storeLog('debug', message, data);
  }
  
  time(label) {
    if (!this.enabled) return;
    console.time(`${this.prefix} ${label}`);
  }
  
  timeEnd(label) {
    if (!this.enabled) return;
    console.timeEnd(`${this.prefix} ${label}`);
  }
}

const logger = new Logger();

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  logger.log('Extension installed/updated');
  logger.debug('Install details:', details);
  
  try {
    if (details.reason === 'install') {
      logger.log('First time installation detected');
      
      // Set default settings
      const defaultSettings = {
        autoEnable: true,
        extensionEnabled: true,
        downloadHistory: [],
        videoPatterns: [],
        defaultQuality: 'highest',
        autoDownload: false
      };
      
      logger.log('Setting default settings:', defaultSettings);
      chrome.storage.local.set(defaultSettings, () => {
        logger.log('Default settings saved');
      });
      
      // Open welcome page
      const optionsUrl = chrome.runtime.getURL('options.html');
      logger.log('Opening welcome page:', optionsUrl);
      chrome.tabs.create({ url: optionsUrl }, (tab) => {
        if (chrome.runtime.lastError) {
          logger.error('Failed to open welcome page:', chrome.runtime.lastError);
        } else {
          logger.log('Welcome page opened successfully:', tab.id);
        }
      });
    }
    
    if (details.reason === 'update') {
      logger.log('Extension updated');
      logger.debug('Previous version:', details.previousVersion);
    }
  } catch (error) {
    logger.error('Error during extension install/update:', error);
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logger.log('Received message:', request);
  logger.debug('Message sender:', sender);
  
  try {
    switch (request.action) {
      case 'trigger-download':
        logger.log('Processing download trigger request');
        handleDownload(request.url, request.filename)
          .then(downloadId => {
            logger.log('Download triggered successfully:', downloadId);
            sendResponse({ success: true, downloadId });
          })
          .catch(error => {
            logger.error('Download trigger failed:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Keep channel open for async response
        
      case 'get-download-history':
        logger.log('Processing get download history request');
        chrome.storage.local.get(['downloadHistory'], (result) => {
          const history = result.downloadHistory || [];
          logger.debug('Retrieved download history:', history.length, 'entries');
          sendResponse({ history });
        });
        return true;
        
      case 'clear-download-history':
        logger.log('Processing clear download history request');
        chrome.storage.local.set({ downloadHistory: [] }, () => {
          logger.log('Download history cleared');
          sendResponse({ success: true });
        });
        return true;
        
      default:
        logger.warn('Unknown message action:', request.action);
        sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    logger.error('Error handling message:', error);
    sendResponse({ error: error.message });
  }
});

// Handle download with proper error handling
async function handleDownload(url, filename) {
  logger.time('handleDownload');
  logger.log('Starting download process...');
  logger.debug('Download parameters:', { url, filename });
  
  try {
    // Ensure filename is valid
    const safeFilename = sanitizeFilename(filename);
    logger.debug('Sanitized filename:', safeFilename);
    
    // Start download
    logger.log('Initiating Chrome download...');
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: safeFilename,
      saveAs: false,
      conflictAction: 'uniquify'
    });
    
    logger.log('Download initiated successfully:', downloadId);
    logger.timeEnd('handleDownload');
    return downloadId;
  } catch (error) {
    logger.error('Download failed:', error);
    logger.timeEnd('handleDownload');
    throw new Error(`Download failed: ${error.message}`);
  }
}

// Sanitize filename for cross-platform compatibility
function sanitizeFilename(filename) {
  logger.time('sanitizeFilename');
  logger.debug('Original filename:', filename);
  
  try {
    // Remove or replace invalid characters
    const sanitized = filename
      .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid chars with underscore
      .replace(/\s+/g, ' ')              // Normalize whitespace
      .replace(/^\.+/, '')               // Remove leading dots
      .replace(/\.+$/, '')               // Remove trailing dots
      .substring(0, 255);                 // Limit length
    
    logger.debug('Sanitized filename:', sanitized);
    logger.timeEnd('sanitizeFilename');
    return sanitized;
  } catch (error) {
    logger.error('Error sanitizing filename:', error);
    logger.timeEnd('sanitizeFilename');
    // Return a safe fallback filename
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return `tiktok_video_${timestamp}.mp4`;
  }
}

// Listen for download events to track history
chrome.downloads.onCreated.addListener((downloadItem) => {
  logger.log('Download created:', downloadItem.id);
  logger.debug('Download item details:', {
    id: downloadItem.id,
    filename: downloadItem.filename,
    url: downloadItem.url,
    fileSize: downloadItem.fileSize,
    startTime: downloadItem.startTime
  });
});

chrome.downloads.onChanged.addListener((delta) => {
  logger.debug('Download state changed:', delta);
  
  if (delta.state && delta.state.current === 'complete') {
    logger.log('Download completed:', delta.id);
  }
  
  if (delta.error) {
    logger.error('Download error:', delta.error.current);
  }
});

// Handle extension icon click (optional behavior)
chrome.action.onClicked.addListener((tab) => {
  logger.log('Extension icon clicked on tab:', tab.id);
  logger.debug('Tab details:', {
    id: tab.id,
    url: tab.url,
    title: tab.title
  });
});

// Log extension startup
logger.log('Background script loaded');
logger.debug('Chrome runtime available:', typeof chrome.runtime !== 'undefined');
logger.debug('Chrome downloads API available:', typeof chrome.downloads !== 'undefined');
logger.debug('Chrome storage API available:', typeof chrome.storage !== 'undefined');
