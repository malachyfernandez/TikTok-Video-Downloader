/**
 * TikTok Video Downloader - Popup Controller
 */

// Comprehensive logging system
class Logger {
  constructor() {
    this.enabled = true;
    this.prefix = '[TT-Downloader-POPUP]';
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
    // Removed spam logs - keeping only warnings and errors
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
    // Removed spam logs - keeping only warnings and errors
  }
  
  debug(message, data = null) {
    if (!this.enabled) return;
    // Removed spam debug logs - keeping only warnings and errors
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

class TikTokPopupController {
  constructor() {
    this.isTikTokPage = false;
    this.videoFound = false;
    this.isDownloading = false;
    this.currentTab = null;
    
    // DOM elements
    this.elements = {
      statusBadge: document.getElementById('statusBadge'),
      mainContent: document.getElementById('mainContent'),
      notTiktok: document.getElementById('notTiktok'),
      videoInfo: document.getElementById('videoInfo'),
      videoDuration: document.getElementById('videoDuration'),
      videoResolution: document.getElementById('videoResolution'),
      downloadBtn: document.getElementById('downloadBtn'),
      btnText: document.getElementById('btnText'),
      progressSection: document.getElementById('progressSection'),
      progressFill: document.getElementById('progressFill'),
      progressStatus: document.getElementById('progressStatus'),
      progressMethod: document.getElementById('progressMethod'),
      progressText: document.getElementById('progressText'),
      messageSection: document.getElementById('messageSection'),
      messageText: document.getElementById('messageText'),
      settingsLink: document.getElementById('settingsLink')
    };
    
    logger.log('TikTokPopupController initialized');
    this.init();
  }
  
  async init() {
    try {
      logger.time('init');
      logger.log('Initializing popup controller...');
      
      this.setupEventListeners();
      await this.checkCurrentTab();
      
      logger.log('Popup controller initialization complete');
      logger.timeEnd('init');
    } catch (error) {
      logger.error('Failed to initialize popup controller:', error);
      logger.timeEnd('init');
    }
  }
  
  setupEventListeners() {
    try {
      logger.log('Setting up event listeners...');
      
      // Download button
      if (this.elements.downloadBtn) {
        this.elements.downloadBtn.addEventListener('click', () => {
          logger.log('Download button clicked');
          this.startDownload();
        });
        logger.debug('Download button listener attached');
      } else {
        logger.warn('Download button element not found');
      }
      
      // Settings link
      if (this.elements.settingsLink) {
        this.elements.settingsLink.addEventListener('click', (e) => {
          logger.log('Settings link clicked');
          e.preventDefault();
          const optionsUrl = chrome.runtime.getURL('options.html');
          logger.debug('Opening options page:', optionsUrl);
          chrome.tabs.create({ url: optionsUrl }, (tab) => {
            if (chrome.runtime.lastError) {
              logger.error('Failed to open options page:', chrome.runtime.lastError);
            } else {
              logger.log('Options page opened successfully:', tab.id);
            }
          });
        });
        logger.debug('Settings link listener attached');
      } else {
        logger.warn('Settings link element not found');
      }
      
      // Listen for download progress messages from content script
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'download-progress') {
          logger.debug('Received download progress:', request.progress);
          this.updateProgress(request.progress);
        }
      });
      
      logger.log('Event listeners setup complete');
    } catch (error) {
      logger.error('Failed to setup event listeners:', error);
    }
  }
  
  async checkCurrentTab() {
    try {
      logger.time('checkCurrentTab');
      logger.log('Checking current tab...');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
      
      logger.debug('Current tab:', tab);
      
      // Check if we're on a TikTok page
      if (!tab.url || (!tab.url.includes('tiktok.com'))) {
        logger.log('Not on TikTok page, showing not-TikTok message');
        this.showNotTikTok();
      } else {
        logger.log('On TikTok page, showing main content');
        this.isTikTokPage = true;
        this.elements.mainContent.style.display = 'block';
        this.elements.notTiktok.style.display = 'none';
        
        // Check if there's a video on the page
        await this.detectVideo();
      }
      
      logger.timeEnd('checkCurrentTab');
    } catch (error) {
      logger.error('Error checking current tab:', error);
      logger.timeEnd('checkCurrentTab');
    }
  }
  
  async detectVideo() {
    try {
      logger.time('detectVideo');
      logger.log('Detecting video on current page...');
      
      this.updateStatus('loading', 'Detecting...');
      
      const response = await this.sendMessageToTabWithRetry({ action: 'detect-video' }, 3, 500);
      logger.debug('Video detection response:', response);
      
      if (response && response.videoFound) {
        logger.log('Video found on page');
        this.videoFound = true;
        this.updateStatus('active', 'Video Found');
        this.showVideoInfo(response.videoInfo);
        this.elements.downloadBtn.disabled = false;
        this.hideMessage();
      } else {
        logger.warn('No video detected on page');
        this.videoFound = false;
        this.updateStatus('inactive', 'No Video');
        this.elements.videoInfo.style.display = 'none';
        this.elements.downloadBtn.disabled = true;
        this.showMessage('No video detected. Make sure a TikTok video is playing.', 'warning');
      }
      
      logger.timeEnd('detectVideo');
    } catch (error) {
      logger.error('Error during video detection:', error);
      logger.timeEnd('detectVideo');
      this.updateStatus('inactive', 'Error');
      this.showMessage('Error detecting video. Try refreshing the page.', 'error');
    }
  }
  
  async startDownload() {
    try {
      logger.time('startDownload');
      logger.log('Starting download process...');
      
      if (this.isDownloading) {
        logger.warn('Download already in progress, ignoring click');
        logger.timeEnd('startDownload');
        return;
      }
      
      this.isDownloading = true;
      this.elements.downloadBtn.disabled = true;
      this.elements.downloadBtn.classList.add('loading');
      this.elements.btnText.textContent = 'Downloading...';
      this.showProgressSection();
      
      const response = await this.sendMessageToTabWithRetry({ action: 'download-video' }, 3, 500);
      logger.debug('Download response:', response);
      
      if (response && response.success) {
        logger.log('Download completed successfully');
        this.elements.downloadBtn.classList.remove('loading');
        this.elements.downloadBtn.classList.add('success');
        this.elements.btnText.textContent = 'Downloaded!';
        this.updateStatus('active', 'Downloaded');
        this.showMessage(`Video downloaded successfully!\nFilename: ${response.filename}`, 'success');
        
        // Reset button after a delay
        setTimeout(() => {
          logger.log('Resetting download button state');
          this.elements.downloadBtn.classList.remove('success');
          this.elements.btnText.textContent = 'Download Video';
          this.elements.downloadBtn.disabled = false;
          this.hideProgressSection();
          this.isDownloading = false;
        }, 3000);
      } else {
        throw new Error(response?.error || 'Download failed');
      }
      
      logger.timeEnd('startDownload');
    } catch (error) {
      logger.error('Download failed:', error);
      logger.timeEnd('startDownload');
      this.elements.downloadBtn.classList.remove('loading');
      this.elements.btnText.textContent = 'Download Failed';
      this.updateStatus('inactive', 'Failed');
      this.showMessage(`Download failed: ${error.message}. Try again or refresh the page.`, 'error');
      this.isDownloading = false;
      this.elements.downloadBtn.disabled = false;
    }
  }
  
  updateProgress(progress) {
    try {
      if (!progress) {
        logger.warn('Received empty progress update');
        return;
      }
      
      logger.debug('Updating progress:', progress);
      
      switch (progress.status) {
        case 'attempting':
          this.elements.progressStatus.textContent = 'Trying download method...';
          this.elements.progressMethod.textContent = `Method ${progress.method}/${progress.total}`;
          this.elements.progressFill.style.width = '10%';
          this.elements.progressText.textContent = `Attempting download method ${progress.method} of ${progress.total}...`;
          break;
          
        case 'fetching':
          this.elements.progressStatus.textContent = 'Fetching video...';
          this.elements.progressFill.style.width = '30%';
          this.elements.progressText.textContent = 'Retrieving video data...';
          break;
          
        case 'processing':
          this.elements.progressStatus.textContent = 'Processing...';
          this.elements.progressFill.style.width = '60%';
          this.elements.progressText.textContent = 'Processing video...';
          break;
          
        case 'recording':
          this.elements.progressStatus.textContent = 'Recording video...';
          this.elements.progressMethod.textContent = 'Fallback method';
          if (progress.progress) {
            this.elements.progressFill.style.width = `${progress.progress}%`;
            this.elements.progressText.textContent = `Recording: ${Math.round(progress.progress)}%`;
          }
          break;
          
        case 'proxy-fetch':
          this.elements.progressStatus.textContent = 'Finding video source...';
          this.elements.progressFill.style.width = '40%';
          this.elements.progressText.textContent = 'Searching for alternative video source...';
          break;
          
        case 'failed':
          this.elements.progressStatus.textContent = 'Method failed, retrying...';
          this.elements.progressFill.style.width = '5%';
          this.elements.progressText.textContent = `Method ${progress.method} failed, trying next...`;
          break;
          
        case 'success':
          this.elements.progressStatus.textContent = 'Finishing...';
          this.elements.progressFill.style.width = '90%';
          this.elements.progressText.textContent = 'Almost done...';
          break;
          
        default:
          logger.warn('Unknown progress status:', progress.status);
      }
    } catch (error) {
      logger.error('Error updating progress:', error);
    }
  }
  
  showVideoInfo(info) {
    try {
      logger.debug('Showing video info:', info);
      
      this.elements.videoInfo.style.display = 'block';
      
      // Format duration
      if (info.duration) {
        const minutes = Math.floor(info.duration / 60);
        const seconds = Math.floor(info.duration % 60);
        const formattedDuration = 
          `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.elements.videoDuration.textContent = formattedDuration;
        logger.debug('Formatted duration:', formattedDuration);
      }
      
      // Format resolution
      if (info.width && info.height) {
        const formattedResolution = `${info.width} x ${info.height}`;
        this.elements.videoResolution.textContent = formattedResolution;
        logger.debug('Formatted resolution:', formattedResolution);
      }
    } catch (error) {
      logger.error('Error showing video info:', error);
    }
  }
  
  showNotTikTok() {
    try {
      logger.log('Showing not-TikTok message');
      this.elements.mainContent.style.display = 'none';
      this.elements.notTiktok.style.display = 'block';
      this.elements.statusBadge.className = 'status-badge inactive';
      this.elements.statusBadge.textContent = 'Off Site';
    } catch (error) {
      logger.error('Error showing not-TikTok message:', error);
    }
  }
  
  updateStatus(type, text) {
    try {
      logger.debug(`Updating status: ${type} - ${text}`);
      this.elements.statusBadge.className = `status-badge ${type}`;
      this.elements.statusBadge.textContent = text;
    } catch (error) {
      logger.error('Error updating status:', error);
    }
  }
  
  showProgressSection() {
    try {
      logger.debug('Showing progress section');
      this.elements.progressSection.classList.add('active');
      this.elements.progressFill.style.width = '0%';
      this.elements.progressStatus.textContent = 'Initializing...';
      this.elements.progressText.textContent = 'Starting download...';
    } catch (error) {
      logger.error('Error showing progress section:', error);
    }
  }
  
  hideProgressSection() {
    try {
      logger.debug('Hiding progress section');
      this.elements.progressSection.classList.remove('active');
    } catch (error) {
      logger.error('Error hiding progress section:', error);
    }
  }
  
  showMessage(text, type = 'info') {
    try {
      logger.debug(`Showing message: ${type} - ${text}`);
      this.elements.messageSection.className = 'message-section active';
      if (type === 'error') {
        this.elements.messageSection.classList.add('error');
      } else if (type === 'success') {
        this.elements.messageSection.classList.add('success');
      }
      this.elements.messageText.textContent = text;
    } catch (error) {
      logger.error('Error showing message:', error);
    }
  }
  
  hideMessage() {
    try {
      logger.debug('Hiding message');
      this.elements.messageSection.classList.remove('active', 'error', 'success');
    } catch (error) {
      logger.error('Error hiding message:', error);
    }
  }
  
  sendMessageToTab(message) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.currentTab || !this.currentTab.id) {
          logger.error('No active tab available for message');
          reject(new Error('No active tab'));
          return;
        }
        
        logger.debug('Sending message to tab:', message);
        chrome.tabs.sendMessage(this.currentTab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            logger.error('Message sending failed:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            logger.debug('Message response received:', response);
            resolve(response);
          }
        });
      } catch (error) {
        logger.error('Error sending message to tab:', error);
        reject(error);
      }
    });
  }
  
  async sendMessageToTabWithRetry(message, maxRetries = 3, delayMs = 500) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Sending message attempt ${attempt}/${maxRetries}:`, message);
        
        // Check if content script is ready by sending a ping
        const pingResponse = await this.sendMessageToTab({ action: 'ping' });
        logger.debug('Content script ping response:', pingResponse);
        
        // If ping successful, send the actual message
        const response = await this.sendMessageToTab(message);
        logger.debug('Message sent successfully on attempt', attempt);
        return response;
        
      } catch (error) {
        logger.warn(`Attempt ${attempt} failed:`, error.message);
        
        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          logger.error('All retry attempts failed');
          throw new Error(`Failed to communicate with content script after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retrying
        logger.debug(`Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // Try to inject content script if it's not responding
        if (error.message.includes('Could not establish connection')) {
          logger.debug('Attempting to inject content script...');
          try {
            await chrome.scripting.executeScript({
              target: { tabId: this.currentTab.id },
              files: ['content.js']
            });
            logger.debug('Content script injected successfully');
            
            // Wait a bit for the script to initialize
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (injectError) {
            logger.warn('Failed to inject content script:', injectError.message);
          }
        }
      }
    }
  }
}

// Initialize when DOM is ready
try {
  logger.log('Popup script loading...');
  document.addEventListener('DOMContentLoaded', () => {
    logger.log('DOM content loaded, initializing controller');
    new TikTokPopupController();
    logger.log('TikTok Video Downloader: Popup script loaded successfully');
  });
} catch (error) {
  console.error('[TT-Downloader-POPUP] CRITICAL: Failed to load popup script:', error);
}
