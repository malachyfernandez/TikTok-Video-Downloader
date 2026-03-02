/**
 * TikTok Video Downloader - Content Script
 * Handles video detection, download methods, and adaptive structure handling
 */

// Comprehensive logging system
class Logger {
  constructor() {
    this.enabled = true;
    this.prefix = '[TT-Downloader]';
    this.maxLogs = 500; // Keep only last 500 logs
    this.contextValid = true;
  }
  
  checkContext() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (error) {
      this.contextValid = false;
      return false;
    }
  }
  
  async storeLog(level, message, data = null) {
    if (!this.checkContext()) {
      console.log(`${this.prefix} [CONTEXT INVALID] ${message}`, data || '');
      return;
    }
    
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

class TikTokVideoDetector {
  constructor() {
    this.detectionStrategies = [
      this.detectByBlobUrl.bind(this),
      this.detectByAttributes.bind(this),
      this.detectByContext.bind(this),
      this.detectByMLScoring.bind(this),
      this.detectByNetworkActivity.bind(this)
    ];
    this.fallbackStrategies = [
      this.detectGeneric.bind(this),
      this.detectBySize.bind(this),
      this.detectByPosition.bind(this),
      this.detectByParentStructure.bind(this)
    ];
    this.successfulPatterns = [];
    this.observer = null;
    this.currentVideo = null;
    
    // Load saved patterns from storage
    this.loadPatterns();
    
    logger.log('TikTokVideoDetector initialized');
    logger.debug('Detection strategies count:', this.detectionStrategies.length);
    logger.debug('Fallback strategies count:', this.fallbackStrategies.length);
  }
  
  async loadPatterns() {
    try {
      logger.log('Loading video patterns from storage...');
      const result = await chrome.storage.local.get(['videoPatterns']);
      if (result.videoPatterns) {
        this.successfulPatterns = result.videoPatterns;
        logger.log('Loaded patterns:', this.successfulPatterns.length);
      } else {
        logger.log('No saved patterns found');
      }
    } catch (error) {
      logger.error('Failed to load patterns:', error);
    }
  }
  
  async savePattern(pattern) {
    try {
      if (!this.successfulPatterns.includes(pattern)) {
        this.successfulPatterns.push(pattern);
        await chrome.storage.local.set({ videoPatterns: this.successfulPatterns });
        logger.log('Saved new pattern:', pattern);
      }
    } catch (error) {
      logger.error('Failed to save pattern:', error);
    }
  }
  
  async findVideo() {
    logger.time('findVideo');
    logger.log('Starting video detection...');
    
    // Try primary strategies first
    for (let i = 0; i < this.detectionStrategies.length; i++) {
      const strategy = this.detectionStrategies[i];
      const strategyName = strategy.name;
      
      logger.log(`Trying primary strategy ${i + 1}/${this.detectionStrategies.length}: ${strategyName}`);
      
      try {
        const video = await strategy();
        if (video && this.isValidVideo(video)) {
          logger.log(`✓ Strategy ${strategyName} found video:`, video);
          this.currentVideo = video;
          logger.timeEnd('findVideo');
          return video;
        } else {
          logger.warn(`Strategy ${strategyName} returned invalid or no video`);
        }
      } catch (error) {
        logger.error(`Strategy ${strategyName} failed:`, error);
      }
    }
    
    // Try fallback strategies
    logger.log('Primary strategies failed, trying fallbacks...');
    for (let i = 0; i < this.fallbackStrategies.length; i++) {
      const strategy = this.fallbackStrategies[i];
      const strategyName = strategy.name;
      
      logger.log(`Trying fallback strategy ${i + 1}/${this.fallbackStrategies.length}: ${strategyName}`);
      
      try {
        const video = await strategy();
        if (video && this.isValidVideo(video)) {
          logger.log(`✓ Fallback strategy ${strategyName} found video:`, video);
          const adapted = this.adaptToNewStructure(video);
          if (adapted) {
            this.currentVideo = adapted;
            logger.timeEnd('findVideo');
            return adapted;
          }
        } else {
          logger.warn(`Fallback strategy ${strategyName} returned invalid or no video`);
        }
      } catch (error) {
        logger.error(`Fallback strategy ${strategyName} failed:`, error);
      }
    }
    
    // Last resort: wait for videos to load and try again
    logger.log('All strategies failed, waiting for videos to load...');
    try {
      const video = await this.waitForVideoLoad();
      if (video) {
        logger.log('✓ Found video after waiting:', video);
        this.currentVideo = video;
        logger.timeEnd('findVideo');
        return video;
      }
    } catch (error) {
      logger.error('Wait for video load failed:', error);
    }
    
    logger.warn('All detection strategies failed');
    logger.timeEnd('findVideo');
    return null;
  }
  
  async waitForVideoLoad(maxWaitTime = 3000) {
    logger.log('Waiting for videos to load...');
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const allVideos = document.querySelectorAll('video');
        logger.debug(`Checking ${allVideos.length} videos for valid candidates...`);
        
        for (const video of allVideos) {
          if (this.isValidVideo(video)) {
            clearInterval(checkInterval);
            logger.log('Found valid video during wait:', video);
            resolve(video);
            return;
          }
        }
        
        // Check if we've waited too long
        if (Date.now() - startTime > maxWaitTime) {
          clearInterval(checkInterval);
          logger.log('Wait timeout, no valid video found');
          resolve(null);
        }
      }, 200);
    });
  }
  
  isValidVideo(video) {
    try {
      if (!video) {
        logger.debug('isValidVideo: video is null/undefined');
        return false;
      }
      
      if (video.tagName !== 'VIDEO') {
        logger.debug('isValidVideo: not a VIDEO element, got:', video.tagName);
        return false;
      }
      
      // NEW: Check if video is in an excluded container (like DivVideoList)
      if (this.isInExcludedContainer(video)) {
        logger.debug('isValidVideo: video is in excluded container - rejecting');
        return false;
      }
      
      // More lenient source checking - allow videos that might load later
      const hasSrc = video.src && video.src.length > 0;
      const hasSources = video.querySelectorAll('source').length > 0;
      const hasBlob = video.src && video.src.startsWith('blob:');
      const hasChildren = video.children.length > 0; // May have source elements
      
      // Allow videos without immediate sources (they might load dynamically)
      if (!hasSrc && !hasSources && !hasBlob && !hasChildren) {
        logger.debug('isValidVideo: no potential source detected');
        return false;
      }
      
      // More lenient dimension checking - allow 0 for unloaded videos
      if (typeof video.videoWidth !== 'number' || video.videoWidth < 0) {
        logger.debug('isValidVideo: invalid videoWidth:', video.videoWidth);
        // Don't fail for 0 width - video might not be loaded yet
        if (video.videoWidth < 0) return false;
      }
      
      if (typeof video.videoHeight !== 'number' || video.videoHeight < 0) {
        logger.debug('isValidVideo: invalid videoHeight:', video.videoHeight);
        // Don't fail for 0 height - video might not be loaded yet
        if (video.videoHeight < 0) return false;
      }
      
      // More lenient duration checking
      if (typeof video.duration !== 'number' || video.duration < 0 || isNaN(video.duration)) {
        logger.debug('isValidVideo: invalid duration:', video.duration);
        // Allow NaN or 0 duration for unloaded videos
        if (video.duration < 0) return false;
      }
      
      // Check if video is in a reasonable container
      const parent = video.parentElement;
      if (!parent) {
        logger.debug('isValidVideo: video has no parent');
        return false;
      }
      
      // More lenient visibility check - allow hidden videos that might become visible
      if (video.offsetWidth < 0 || video.offsetHeight < 0) {
        logger.debug('isValidVideo: video has invalid dimensions');
        return false;
      }
      
      // Additional checks for modern TikTok videos
      const hasTikTokClass = video.className && (
        video.className.includes('video') || 
        video.className.includes('player') ||
        video.className.includes('tiktok') ||
        video.className.includes('feed')
      );
      
      const hasTikTokParent = parent.className && (
        parent.className.includes('video') ||
        parent.className.includes('player') ||
        parent.className.includes('tiktok') ||
        parent.className.includes('feed') ||
        parent.className.includes('container')
      );
      
      // If video doesn't have obvious TikTok markers, be more strict about other requirements
      if (!hasTikTokClass && !hasTikTokParent) {
        // Require at least some basic attributes for non-TikTok videos
        if (!hasSrc && !hasBlob) {
          logger.debug('isValidVideo: non-TikTok video lacks source');
          return false;
        }
      }
      
      logger.debug('isValidVideo: video appears valid');
      return true;
    } catch (error) {
      logger.error('isValidVideo: error checking video validity:', error);
      return false;
    }
  }
  
  // Strategy 1: Detect by blob URL (updated for modern TikTok)
  async detectByBlobUrl() {
    logger.log('detectByBlobUrl: searching for blob URLs');
    
    // Expanded blob URL patterns for modern TikTok
    const blobSelectors = [
      'video[src^="blob:https://www.tiktok.com"]',
      'video[src^="blob:https://tiktok.com"]',
      'video[src^="blob:http://www.tiktok.com"]',
      'video[src^="blob:http://tiktok.com"]',
      'video[src^="blob:https://v16-webapp-prime.tiktok.com"]',
      'video[src^="blob:https://v16-webapp.tiktok.com"]',
      'video[src^="blob:https://v16m-webapp.tiktok.com"]',
      'video[src^="blob:https://v16-webapp.tiktokcdn.com"]',
      'video[src^="blob:"]', // Any blob URL
      'video[data-blob-url]', // Videos with blob data attributes
      'video[data-url*="blob"]', // Videos with blob in data-url
      'video[class*="blob"]', // Videos with blob in class name
      'video[style*="blob"]' // Videos with blob in style
    ];
    
    for (let i = 0; i < blobSelectors.length; i++) {
      const selector = blobSelectors[i];
      logger.debug(`detectByBlobUrl: trying selector ${i + 1}/${blobSelectors.length}: ${selector}`);
      
      const videos = document.querySelectorAll(selector);
      logger.debug(`detectByBlobUrl: found ${videos.length} videos with selector: ${selector}`);
      
      for (let j = 0; j < videos.length; j++) {
        const video = videos[j];
        logger.debug(`detectByBlobUrl: checking video ${j + 1}/${videos.length}`);
        
        // Additional check for blob URLs
        if (video.src && video.src.startsWith('blob:')) {
          logger.debug('detectByBlobUrl: found video with blob URL:', video.src.substring(0, 50) + '...');
        }
        
        if (this.isValidVideo(video)) {
          logger.log('detectByBlobUrl: found valid video via blob URL');
          return video;
        }
      }
    }
    
    // Also check for videos that might have blob URLs in data attributes
    const videosWithBlobData = document.querySelectorAll('video[data-blob-url], video[data-url*="blob"]');
    logger.debug(`detectByBlobUrl: found ${videosWithBlobData.length} videos with blob data attributes`);
    
    for (let i = 0; i < videosWithBlobData.length; i++) {
      const video = videosWithBlobData[i];
      const blobUrl = video.getAttribute('data-blob-url') || video.getAttribute('data-url');
      
      if (blobUrl && blobUrl.startsWith('blob:')) {
        logger.debug('detectByBlobUrl: found video with blob data attribute');
        if (this.isValidVideo(video)) {
          logger.log('detectByBlobUrl: found valid video via blob data attribute');
          return video;
        }
      }
    }
    
    logger.debug('detectByBlobUrl: no valid videos found');
    return null;
  }
  
  // Strategy 2: Detect by attributes (updated for modern TikTok)
  async detectByAttributes() {
    logger.log('detectByAttributes: searching by attributes');
    
    // Expanded attribute selectors for modern TikTok
    const selectors = [
      'video[crossorigin="use-credentials"]',
      'video[data-version]',
      'video[playsinline]',
      'video[loop]',
      'video[muted]',
      'video[autoplay]',
      'video[data-vid]',
      'video[data-video-id]',
      'video[data-src]',
      'video[preload]',
      'video[x-webkit-airplay="allow"]',
      'video[webkit-playsinline]',
      'video[data-e2e*="video"]',
      'video[aria-label*="video"]'
    ];
    
    for (let selIndex = 0; selIndex < selectors.length; selIndex++) {
      const selector = selectors[selIndex];
      logger.debug(`detectByAttributes: trying selector ${selIndex + 1}/${selectors.length}: ${selector}`);
      
      const videos = document.querySelectorAll(selector);
      logger.debug(`detectByAttributes: found ${videos.length} videos with selector: ${selector}`);
      
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        logger.debug(`detectByAttributes: checking video ${i + 1}/${videos.length}`);
        if (this.isValidVideo(video)) {
          logger.log('detectByAttributes: found valid video via attributes');
          return video;
        }
      }
    }
    
    logger.debug('detectByAttributes: no valid videos found');
    return null;
  }
  
  // Strategy 3: Detect by context (updated for modern TikTok)
  async detectByContext() {
    logger.log('detectByContext: searching by context');
    
    // Updated container selectors for modern TikTok
    const containers = [
      '[data-e2e="recommend-list-item-container"]',
      '[data-e2e="video-container"]',
      '[data-e2e="browse-video-container"]',
      '[data-e2e="search-card-video-container"]',
      '[data-e2e="feed-video-container"]',
      '[data-e2e="video-player"]',
      '[data-e2e="main-content"]',
      '[class*="video-container"]',
      '[class*="player-container"]',
      '[class*="DivVideoContainer"]',
      '[class*="DivFeedVideoContainer"]',
      '[class*="DivPlayerContainer"]',
      '[class*="VideoPlayer"]',
      '[class*="VideoContainer"]',
      '[class*="feed-video"]',
      '[class*="tiktok-video"]',
      '[class*="video-feed"]',
      '[class*="player-wrapper"]',
      '[id*="video"]',
      '[id*="player"]',
      'div[class*="Div"][class*="Container"][class*="Video"]',
      'div[class*="Div"][class*="Video"][class*="Container"]',
      'div[class*="video"][class*="container"][class*="tiktok"]',
      // More generic fallbacks
      'main video',
      '[role="main"] video',
      '[role="application"] video',
      'section video',
      'article video'
    ];
    
    for (let i = 0; i < containers.length; i++) {
      const containerSelector = containers[i];
      logger.debug(`detectByContext: trying container ${i + 1}/${containers.length}: ${containerSelector}`);
      
      const containerElements = document.querySelectorAll(containerSelector);
      logger.debug(`detectByContext: found ${containerElements.length} containers with selector: ${containerSelector}`);
      
      for (let j = 0; j < containerElements.length; j++) {
        const container = containerElements[j];
        const video = container.querySelector('video');
        if (video && this.isValidVideo(video)) {
          logger.log(`detectByContext: found valid video in container: ${containerSelector}`);
          return video;
        }
      }
    }
    
    logger.debug('detectByContext: no valid videos found in any container');
    return null;
  }
  
  // Strategy 4: ML-style scoring based on multiple factors
  async detectByMLScoring() {
    logger.log('detectByMLScoring: scoring all videos');
    const allVideos = document.querySelectorAll('video');
    logger.debug(`detectByMLScoring: found ${allVideos.length} total videos`);
    
    let bestVideo = null;
    let bestScore = 0;
    
    for (let i = 0; i < allVideos.length; i++) {
      const video = allVideos[i];
      let score = 0;
      
      // Size score (TikTok videos are typically large)
      if (video.videoWidth >= 720) score += 2;
      if (video.videoWidth >= 1080) score += 2;
      
      // Duration score
      if (video.duration > 3 && video.duration < 600) score += 2;
      
      // Visibility score
      if (video.offsetWidth > 0 && video.offsetHeight > 0) score += 2;
      
      // Playing/paused state score
      if (!video.paused) score += 1;
      
      // Position score (center of viewport)
      const rect = video.getBoundingClientRect();
      const viewportCenter = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      };
      const videoCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      const distance = Math.sqrt(
        Math.pow(videoCenter.x - viewportCenter.x, 2) +
        Math.pow(videoCenter.y - viewportCenter.y, 2)
      );
      if (distance < 300) score += 2;
      
      // Blob URL bonus
      if (video.src && video.src.startsWith('blob:')) score += 3;
      
      logger.debug(`detectByMLScoring: video ${i} score: ${score}`);
      
      if (score > bestScore && this.isValidVideo(video)) {
        bestScore = score;
        bestVideo = video;
      }
    }
    
    if (bestVideo) {
      logger.log(`detectByMLScoring: best video with score: ${bestScore}`);
      return bestVideo;
    }
    
    logger.debug('detectByMLScoring: no valid videos found');
    return null;
  }
  
  // Strategy 5: Detect by network activity patterns
  async detectByNetworkActivity() {
    logger.log('detectByNetworkActivity: analyzing network patterns');
    
    // Look for videos that are likely to be loaded based on network activity
    const allVideos = document.querySelectorAll('video');
    logger.debug(`detectByNetworkActivity: found ${allVideos.length} videos to analyze`);
    
    for (let i = 0; i < allVideos.length; i++) {
      const video = allVideos[i];
      
      // Check if video has indicators of being loaded/played
      const hasNetworkIndicators = (
        video.readyState > 0 || // Has started loading
        video.buffered.length > 0 || // Has buffered data
        video.seekable.length > 0 || // Has seekable data
        video.src || // Has source
        video.currentSrc || // Has current source
        video.classList.contains('tiktok') || // TikTok class
        video.closest('[data-e2e]') // In TikTok data-e2e container
      );
      
      if (hasNetworkIndicators && this.isValidVideo(video)) {
        logger.log('detectByNetworkActivity: found video with network indicators');
        return video;
      }
    }
    
    logger.debug('detectByNetworkActivity: no videos with network indicators found');
    return null;
  }
  
  // Fallback Strategy 1: Generic video detection
  async detectGeneric() {
    logger.log('detectGeneric: searching all video elements');
    const videos = document.querySelectorAll('video');
    logger.debug(`detectGeneric: found ${videos.length} videos`);
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      if (this.isValidVideo(video)) {
        logger.log('detectGeneric: found valid video');
        return video;
      }
    }
    
    logger.debug('detectGeneric: no valid videos found');
    return null;
  }
  
  // Fallback Strategy 2: Detect by largest size
  async detectBySize() {
    logger.log('detectBySize: searching by largest size');
    const videos = document.querySelectorAll('video');
    logger.debug(`detectBySize: found ${videos.length} videos`);
    
    let largestVideo = null;
    let maxArea = 0;
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      if (!this.isValidVideo(video)) continue;
      
      const area = video.videoWidth * video.videoHeight;
      logger.debug(`detectBySize: video ${i} area: ${area}`);
      
      if (area > maxArea) {
        maxArea = area;
        largestVideo = video;
      }
    }
    
    if (largestVideo) {
      logger.log(`detectBySize: found largest video with area: ${maxArea}`);
      return largestVideo;
    }
    
    logger.debug('detectBySize: no valid videos found');
    return null;
  }
  
  // Fallback Strategy 3: Detect by viewport position
  async detectByPosition() {
    logger.log('detectByPosition: searching by viewport position');
    const videos = document.querySelectorAll('video');
    logger.debug(`detectByPosition: found ${videos.length} videos`);
    
    let centeredVideo = null;
    let minDistance = Infinity;
    
    const viewportCenter = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      if (!this.isValidVideo(video)) continue;
      
      const rect = video.getBoundingClientRect();
      const videoCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      
      const distance = Math.sqrt(
        Math.pow(videoCenter.x - viewportCenter.x, 2) +
        Math.pow(videoCenter.y - viewportCenter.y, 2)
      );
      
      logger.debug(`detectByPosition: video ${i} distance from center: ${distance}`);
      
      if (distance < minDistance) {
        minDistance = distance;
        centeredVideo = video;
      }
    }
    
    if (centeredVideo) {
      logger.log(`detectByPosition: found centered video with distance: ${minDistance}`);
      return centeredVideo;
    }
    
    logger.debug('detectByPosition: no valid videos found');
    return null;
  }
  
  // Fallback Strategy 4: Detect by parent structure analysis
  async detectByParentStructure() {
    logger.log('detectByParentStructure: analyzing parent element structure');
    
    // Look for videos in complex nested structures that might be TikTok players
    const allVideos = document.querySelectorAll('video');
    logger.debug(`detectByParentStructure: found ${allVideos.length} videos to analyze`);
    
    for (let i = 0; i < allVideos.length; i++) {
      const video = allVideos[i];
      
      // Analyze the parent hierarchy for TikTok-like patterns
      let parent = video.parentElement;
      let depth = 0;
      let tikTokIndicators = 0;
      
      while (parent && depth < 10) { // Limit depth to prevent infinite loops
        // Check for TikTok-like class names and attributes
        if (parent.className) {
          const className = parent.className.toLowerCase();
          if (className.includes('video') || 
              className.includes('player') || 
              className.includes('tiktok') ||
              className.includes('feed') ||
              className.includes('container')) {
            tikTokIndicators++;
          }
        }
        
        if (parent.getAttribute && parent.getAttribute('data-e2e')) {
          tikTokIndicators += 2; // data-e2e is a strong TikTok indicator
        }
        
        parent = parent.parentElement;
        depth++;
      }
      
      // If we found enough TikTok indicators, this is likely the right video
      if (tikTokIndicators >= 2 && this.isValidVideo(video)) {
        logger.log(`detectByParentStructure: found video with ${tikTokIndicators} TikTok indicators`);
        return video;
      }
    }
    
    logger.debug('detectByParentStructure: no videos with sufficient TikTok indicators found');
    return null;
  }
  
  // Check if video is in an excluded container (like DivVideoList)
  isInExcludedContainer(video) {
    try {
      if (!video || !video.parentElement) {
        return false;
      }
      
      logger.debug('isInExcludedContainer: checking video parent hierarchy');
      
      // Look for parent containers that match the DivVideoList pattern
      let parent = video.parentElement;
      let depth = 0;
      
      while (parent && depth < 15) { // Check up to 15 levels up
        const className = parent.className || '';
        
        // Check for both DivVideoList and DivVideoListTabBarWrapper in class name
        // This handles cases like "css-rbj4vs-5e6d46e3--DivVideoList-5e6d46e3--DivVideoListTabBarWrapper esqjn3w6"
        if (className.includes('DivVideoList') && className.includes('DivVideoListTabBarWrapper')) {
          logger.warn('Found video in DivVideoList+DivVideoListTabBarWrapper container - EXCLUDING');
          logger.debug('Excluded container class:', className);
          return true;
        }
        
        // Fallback: exclude if just DivVideoList is found (less strict)
        if (className.includes('DivVideoList')) {
          logger.warn('Found video in DivVideoList container - EXCLUDING (fallback)');
          logger.debug('Excluded container class:', className);
          return true;
        }
        
        parent = parent.parentElement;
        depth++;
      }
      
      logger.debug('isInExcludedContainer: video not in excluded container');
      return false;
    } catch (error) {
      logger.error('isInExcludedContainer: error checking container:', error);
      return false; // Don't exclude on error
    }
  }

  // Adapt to new structure by analyzing and generating new selectors
  adaptToNewStructure(video) {
    try {
      logger.log('adaptToNewStructure: analyzing video structure');
      
      // Generate selector based on video attributes
      const attributes = {
        class: video.className,
        id: video.id,
        crossorigin: video.crossOrigin,
        dataVersion: video.getAttribute('data-version'),
        playsinline: video.hasAttribute('playsinline'),
        loop: video.hasAttribute('loop')
      };
      
      logger.debug('adaptToNewStructure: video attributes:', attributes);
      
      // Store successful detection pattern
      const pattern = JSON.stringify(attributes);
      this.savePattern(pattern);
      
      logger.log('adaptToNewStructure: adaptation complete');
      return video;
    } catch (error) {
      logger.error('adaptToNewStructure: error adapting to new structure:', error);
      return video;
    }
  }
  
  // Extract metadata from video element
  extractMetadata(video) {
    try {
      if (!video) {
        logger.warn('extractMetadata: video is null');
        return null;
      }
      
      const metadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        src: video.src,
        readyState: video.readyState,
        paused: video.paused,
        currentTime: video.currentTime,
        volume: video.volume,
        muted: video.muted
      };
      
      logger.debug('extractMetadata: extracted metadata:', metadata);
      return metadata;
    } catch (error) {
      logger.error('extractMetadata: error extracting metadata:', error);
      return null;
    }
  }
  
  // Start continuous monitoring for video changes
  startMonitoring(callback) {
    try {
      logger.log('startMonitoring: starting MutationObserver');
      
      this.observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        
        for (let i = 0; i < mutations.length; i++) {
          const mutation = mutations[i];
          
          if (mutation.type === 'childList') {
            for (let j = 0; j < mutation.addedNodes.length; j++) {
              const node = mutation.addedNodes[j];
              
              if (node.nodeName === 'VIDEO' || 
                  (node.nodeType === 1 && node.querySelector && node.querySelector('video'))) {
                shouldCheck = true;
                logger.debug('startMonitoring: video element added to DOM');
                break;
              }
            }
          }
        }
        
        if (shouldCheck) {
          logger.log('startMonitoring: DOM changed, rechecking for videos');
          setTimeout(() => {
            this.findVideo().then(video => {
              if (video && video !== this.currentVideo) {
                this.currentVideo = video;
                logger.log('startMonitoring: new video detected:', video);
                if (callback) callback(video);
              }
            }).catch(error => {
              logger.error('startMonitoring: error during recheck:', error);
            });
          }, 500);
        }
      });
      
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      logger.log('startMonitoring: MutationObserver started successfully');
    } catch (error) {
      logger.error('startMonitoring: failed to start monitoring:', error);
    }
  }
  
  // Stop monitoring
  stopMonitoring() {
    try {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
        logger.log('stopMonitoring: MutationObserver stopped');
      }
    } catch (error) {
      logger.error('stopMonitoring: error stopping monitoring:', error);
    }
  }
}

/**
 * Download Manager - Handles multiple download methods
 */
class TikTokDownloadManager {
  constructor() {
    this.downloadMethods = [
      this.downloadViaBlobUrl.bind(this),
      this.downloadViaMediaRecorder.bind(this),
      this.downloadViaFetchProxy.bind(this)
    ];
    
    logger.log('TikTokDownloadManager initialized');
    logger.debug('Download methods count:', this.downloadMethods.length);
  }
  
  async downloadVideo(videoElement, options = {}) {
    logger.time('downloadVideo');
    logger.log('Starting video download...');
    logger.debug('Video element:', videoElement);
    
    const progressCallback = options.onProgress || (() => {});
    
    for (let i = 0; i < this.downloadMethods.length; i++) {
      const method = this.downloadMethods[i];
      const methodName = method.name;
      
      try {
        logger.log(`Trying download method ${i + 1}/${this.downloadMethods.length}: ${methodName}`);
        progressCallback({ 
          status: 'attempting', 
          method: i + 1, 
          total: this.downloadMethods.length 
        });
        
        const result = await method(videoElement, progressCallback);
        if (result) {
          logger.log(`✓ Download method ${methodName} succeeded:`, result);
          progressCallback({ status: 'success', method: i + 1 });
          logger.timeEnd('downloadVideo');
          return result;
        } else {
          logger.warn(`Download method ${methodName} returned null result`);
        }
      } catch (error) {
        logger.error(`Download method ${methodName} failed:`, error);
        progressCallback({ 
          status: 'failed', 
          method: i + 1, 
          error: error.message 
        });
        continue;
      }
    }
    
    logger.error('All download methods failed');
    logger.timeEnd('downloadVideo');
    throw new Error('All download methods failed');
  }
  
  // Method 1: Direct blob URL fetch (updated for modern TikTok)
  async downloadViaBlobUrl(videoElement, onProgress) {
    logger.time('downloadViaBlobUrl');
    logger.log('Attempting blob URL download...');
    
    // Get user's preferred video format
    const settings = await chrome.storage.local.get({ videoFormat: 'mp4' });
    const preferredFormat = settings.videoFormat;
    logger.log('User preferred format:', preferredFormat);
    
    // Try multiple potential sources for the blob URL
    const potentialSources = [
      videoElement.src,
      videoElement.getAttribute('data-blob-url'),
      videoElement.getAttribute('data-url'),
      videoElement.getAttribute('data-src')
    ].filter(url => url && url.startsWith('blob:'));
    
    if (potentialSources.length === 0) {
      throw new Error('Video does not have a blob URL');
    }
    
    // Try each potential blob URL
    for (let i = 0; i < potentialSources.length; i++) {
      const blobUrl = potentialSources[i];
      logger.debug(`Trying blob URL source ${i + 1}/${potentialSources.length}:`, blobUrl.substring(0, 50) + '...');
      
      try {
        onProgress({ status: 'fetching', method: 1 });
        
        logger.log('Fetching blob directly...');
        const response = await fetch(blobUrl, {
          mode: 'cors',
          credentials: 'include',
          headers: {
            'Accept': 'video/mp4,video/webm,video/quicktime,video/*;q=0.9,application/ogg;q=0.7,video/3gpp;q=0.6,*/*;q=0.5'
          }
        });
        
        logger.debug('Fetch response status:', response.status);
        logger.debug('Fetch response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        onProgress({ status: 'processing', method: 1 });
        logger.log('Creating blob from response...');
        const blob = await response.blob();
        logger.debug('Created blob:', {
          size: blob.size,
          type: blob.type
        });
        
        // Validate blob
        if (blob.size === 0) {
          throw new Error('Downloaded blob is empty');
        }
        
        // Use user's preferred format for filename, but check if we need to convert
        const extension = this.getFileExtension(blob.type) || preferredFormat;
        const filename = this.generateFilename(extension);
        logger.debug('Generated filename:', filename);
        
        // If blob type doesn't match preferred format and we need MP4, try to convert
        if (preferredFormat === 'mp4' && !blob.type.includes('mp4')) {
          logger.log('Blob is not MP4 but user prefers MP4, attempting conversion...');
          try {
            const mp4Blob = await this.convertToMp4(blob);
            if (mp4Blob) {
              logger.log('Successfully converted to MP4');
              const mp4Filename = this.generateFilename('mp4');
              logger.timeEnd('downloadViaBlobUrl');
              return {
                blob: mp4Blob,
                filename: mp4Filename,
                method: 'blob-url-converted'
              };
            }
          } catch (convertError) {
            logger.warn('Failed to convert to MP4, using original format:', convertError);
          }
        }
        
        logger.timeEnd('downloadViaBlobUrl');
        return {
          blob,
          filename,
          method: 'blob-url'
        };
      } catch (error) {
        logger.warn(`Blob URL ${i + 1} failed:`, error);
        if (i === potentialSources.length - 1) {
          // Last attempt failed, throw the error
          logger.error('All blob URL attempts failed:', error);
          logger.timeEnd('downloadViaBlobUrl');
          throw new Error(`Blob fetch failed: ${error.message}`);
        }
        // Try next URL
        continue;
      }
    }
  }
  
  // Method 2: MediaRecorder API (updated for modern TikTok)
  async downloadViaMediaRecorder(videoElement, onProgress) {
    logger.time('downloadViaMediaRecorder');
    logger.log('Attempting MediaRecorder download...');
    
    onProgress({ status: 'recording', method: 2 });
    
    // Get user's preferred video format
    const settings = await chrome.storage.local.get({ videoFormat: 'mp4' });
    const preferredFormat = settings.videoFormat;
    logger.log('User preferred format:', preferredFormat);
    
    return new Promise((resolve, reject) => {
      let mediaRecorder = null;
      let progressInterval = null;
      let recordingTimeout = null;
      let stream = null;
      
      try {
        logger.log('Checking MediaRecorder support...');
        
        // Check if MediaRecorder is supported
        if (!window.MediaRecorder) {
          throw new Error('MediaRecorder is not supported in this browser');
        }
        
        // Try MIME types based on user preference
        let mimeTypes = [];
        
        if (preferredFormat === 'mp4') {
          // Prioritize MP4 formats if user prefers MP4
          mimeTypes = [
            'video/mp4;codecs=h264',
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8', 
            'video/webm'
          ];
        } else {
          // Prioritize WebM formats if user prefers WebM
          mimeTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8', 
            'video/webm',
            'video/mp4;codecs=h264',
            'video/mp4'
          ];
        }
        
        let selectedMimeType = null;
        for (const mimeType of mimeTypes) {
          if (window.MediaRecorder.isTypeSupported(mimeType)) {
            selectedMimeType = mimeType;
            logger.log('Selected MIME type:', mimeType);
            break;
          }
        }
        
        if (!selectedMimeType) {
          throw new Error('No supported MIME type found for MediaRecorder');
        }
        
        logger.log('MediaRecorder is supported');
        
        // Get video stream with fallback
        logger.log('Getting video stream...');
        stream = null;
        
        // Try different stream capture methods
        if (videoElement.captureStream) {
          stream = videoElement.captureStream();
        } else if (videoElement.mozCaptureStream) {
          stream = videoElement.mozCaptureStream();
        } else if (videoElement.webkitCaptureStream) {
          stream = videoElement.webkitCaptureStream();
        }
        
        if (!stream) {
          throw new Error('Could not capture video stream - captureStream not available');
        }
        
        logger.debug('Video stream:', stream);
        logger.debug('Stream tracks:', stream.getTracks());
        
        // Create MediaRecorder with optimal settings
        const recorderOptions = {
          mimeType: selectedMimeType,
          videoBitsPerSecond: 5000000
        };
        
        // Add audio constraints if available
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          recorderOptions.audioBitsPerSecond = 128000;
        }
        
        mediaRecorder = new MediaRecorder(stream, recorderOptions);
        
        logger.debug('MediaRecorder created:', mediaRecorder);
        
        const chunks = [];
        let recordingDuration = 0;
        const totalDuration = (videoElement.duration || 30) * 1000; // Default to 30s if duration unknown
        
        logger.debug('Total recording duration:', totalDuration);
        
        mediaRecorder.ondataavailable = (event) => {
          logger.debug(`MediaRecorder data available: ${event.data.size} bytes`);
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        
        mediaRecorder.onstop = () => {
          logger.log('MediaRecorder stopped');
          logger.debug('Total chunks collected:', chunks.length);
          
          // Clear all timers and intervals
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          if (recordingTimeout) {
            clearTimeout(recordingTimeout);
            recordingTimeout = null;
          }
          
          const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
          logger.debug('Total blob size:', totalSize);
          
          if (totalSize === 0) {
            logger.error('No data recorded');
            logger.timeEnd('downloadViaMediaRecorder');
            reject(new Error('No data was recorded during capture'));
            return;
          }
          
          const blob = new Blob(chunks, { type: selectedMimeType });
          
          // Determine file extension based on actual MIME type used and user preference
          let extension;
          if (selectedMimeType.includes('mp4')) {
            extension = 'mp4';
          } else if (selectedMimeType.includes('webm')) {
            extension = 'webm';
          } else {
            // Fallback to user preference if MIME type is ambiguous
            extension = preferredFormat;
          }
          
          const filename = this.generateFilename(extension);
          
          // Stop all tracks
          if (stream) {
            const tracks = stream.getTracks();
            logger.debug('Stopping stream tracks:', tracks.length);
            tracks.forEach(track => {
              try {
                track.stop();
              } catch (error) {
                logger.warn('Error stopping track:', error);
              }
            });
          }
          
          logger.log(`Generated ${extension} file using MediaRecorder with format: ${selectedMimeType}`);
          logger.timeEnd('downloadViaMediaRecorder');
          resolve({
            blob,
            filename,
            method: 'media-recorder'
          });
        };
        
        mediaRecorder.onerror = (error) => {
          logger.error('MediaRecorder error:', error);
          
          // Clean up on error
          this.cleanupRecording(progressInterval, recordingTimeout, stream);
          
          logger.timeEnd('downloadViaMediaRecorder');
          reject(new Error(`MediaRecorder error: ${error.message || 'Unknown error'}`));
        };
        
        mediaRecorder.onstart = () => {
          logger.log('MediaRecorder started');
        };
        
        // Start recording with better error handling
        this.startRecordingWithRetry(videoElement, mediaRecorder, progressInterval, recordingTimeout, totalDuration, onProgress)
          .then(() => {
            // Recording started successfully
          })
          .catch(error => {
            this.cleanupRecording(progressInterval, recordingTimeout, stream);
            logger.timeEnd('downloadViaMediaRecorder');
            reject(error);
          });
          
      } catch (error) {
        this.cleanupRecording(progressInterval, recordingTimeout, stream);
        logger.timeEnd('downloadViaMediaRecorder');
        reject(new Error(`MediaRecorder setup failed: ${error.message}`));
      }
    });
  }
  
  // Helper method to start recording with retry logic
  async startRecordingWithRetry(videoElement, mediaRecorder, progressInterval, recordingTimeout, totalDuration, onProgress, maxRetries = 3) {
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        attempt++;
        logger.log(`Starting recording attempt ${attempt}/${maxRetries}`);
        
        // Prepare video for recording
        const originalMuted = videoElement.muted;
        const originalCurrentTime = videoElement.currentTime;
        
        videoElement.muted = true; // Prevent audio feedback
        
        // Try to start playback
        await this.startVideoPlayback(videoElement);
        
        // Start recording
        mediaRecorder.start(100); // Collect data every 100ms
        
        // Update progress
        progressInterval = setInterval(() => {
          recordingDuration += 100;
          const progress = Math.min((recordingDuration / totalDuration) * 100, 95);
          logger.debug(`Recording progress: ${progress}% (${recordingDuration}/${totalDuration}ms)`);
          onProgress({ status: 'recording', method: 2, progress });
        }, 100);
        
        // Stop recording after video ends
        recordingTimeout = setTimeout(() => {
          logger.log('Stopping recording...');
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          if (recordingTimeout) {
            clearTimeout(recordingTimeout);
            recordingTimeout = null;
          }
          mediaRecorder.stop();
          videoElement.pause();
          videoElement.muted = originalMuted;
          videoElement.currentTime = originalCurrentTime;
        }, totalDuration);
        
        logger.log('Recording started successfully');
        return;
        
      } catch (error) {
        logger.warn(`Recording attempt ${attempt} failed:`, error);
        
        if (attempt >= maxRetries) {
          throw new Error(`Failed to start recording after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  // Helper method to start video playback with better error handling
  async startVideoPlayback(videoElement) {
    return new Promise((resolve, reject) => {
      // Check if video is already ready
      if (videoElement.readyState >= 2) { // HAVE_CURRENT_DATA
        videoElement.play().then(resolve).catch(reject);
        return;
      }
      
      // Wait for video to be ready
      const timeout = setTimeout(() => {
        reject(new Error('Video load timeout'));
      }, 10000);
      
      videoElement.onloadeddata = () => {
        clearTimeout(timeout);
        videoElement.play().then(resolve).catch(reject);
      };
      
      videoElement.onerror = (error) => {
        clearTimeout(timeout);
        reject(new Error('Video load error'));
      };
      
      // Trigger load if not already loading
      if (videoElement.readyState < 1) { // HAVE_NOTHING
        videoElement.load();
      }
    });
  }
  
  // Method 3: Fetch via proxy/worker (another fallback)
  async downloadViaFetchProxy(videoElement, onProgress) {
    logger.time('downloadViaFetchProxy');
    logger.log('Attempting fetch proxy download...');
    
    onProgress({ status: 'proxy-fetch', method: 3 });
    
    // This method attempts to find the actual video source
    // by looking at network requests or alternative sources
    
    try {
      logger.log('Checking for source elements...');
      // Check for source elements (for <video> with <source> children)
      const sourceElements = videoElement.querySelectorAll('source');
      logger.debug(`Found ${sourceElements.length} source elements`);
      
      for (let i = 0; i < sourceElements.length; i++) {
        const source = sourceElements[i];
        const src = source.src;
        logger.debug(`Checking source ${i + 1}:`, src);
        
        if (src && !src.startsWith('blob:')) {
          logger.log('Found non-blob source, attempting fetch...');
          const response = await fetch(src);
          logger.debug('Source fetch response:', response.status);
          
          if (response.ok) {
            const blob = await response.blob();
            const filename = this.generateFilename('mp4');
            logger.log('Successfully fetched via source element');
            logger.timeEnd('downloadViaFetchProxy');
            return {
              blob,
              filename,
              method: 'source-element'
            };
          }
        }
      }
      
      logger.log('No valid source elements found, checking data attributes...');
      // Check for data attributes that might contain URLs
      const dataSrc = videoElement.getAttribute('data-src') || 
                      videoElement.getAttribute('data-video-url');
      logger.debug('Data attributes:', {
        'data-src': videoElement.getAttribute('data-src'),
        'data-video-url': videoElement.getAttribute('data-video-url')
      });
      
      if (dataSrc) {
        logger.log('Found data source, attempting fetch...');
        const response = await fetch(dataSrc);
        logger.debug('Data source fetch response:', response.status);
        
        if (response.ok) {
          const blob = await response.blob();
          const filename = this.generateFilename('mp4');
          logger.log('Successfully fetched via data attribute');
          logger.timeEnd('downloadViaFetchProxy');
          return {
            blob,
            filename,
            method: 'data-attribute'
          };
        }
      }
      
      logger.debug('No alternative video sources found');
      logger.timeEnd('downloadViaFetchProxy');
      throw new Error('No alternative video source found');
    } catch (error) {
      logger.error('Proxy fetch failed:', error);
      logger.timeEnd('downloadViaFetchProxy');
      throw new Error(`Proxy fetch failed: ${error.message}`);
    }
  }
  
  // Helper method to convert video to MP4 format
  async convertToMp4(inputBlob) {
    try {
      logger.time('convertToMp4');
      logger.log('Converting video to MP4 format...');
      
      // Create a video element to process the input
      const video = document.createElement('video');
      const videoUrl = URL.createObjectURL(inputBlob);
      
      return new Promise((resolve, reject) => {
        video.onloadedmetadata = async () => {
          try {
            // Create canvas for video processing
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            // Create MediaRecorder for MP4 output
            const stream = canvas.captureStream(30); // 30 FPS
            
            // Try MP4 MIME types
            const mp4MimeTypes = [
              'video/mp4;codecs=h264',
              'video/mp4'
            ];
            
            let selectedMimeType = null;
            for (const mimeType of mp4MimeTypes) {
              if (window.MediaRecorder.isTypeSupported(mimeType)) {
                selectedMimeType = mimeType;
                break;
              }
            }
            
            if (!selectedMimeType) {
              logger.warn('No MP4 MIME type supported, returning original blob');
              URL.revokeObjectURL(videoUrl);
              logger.timeEnd('convertToMp4');
              resolve(null);
              return;
            }
            
            const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
            const chunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
              }
            };
            
            mediaRecorder.onstop = () => {
              const mp4Blob = new Blob(chunks, { type: selectedMimeType });
              URL.revokeObjectURL(videoUrl);
              logger.log('MP4 conversion completed');
              logger.timeEnd('convertToMp4');
              resolve(mp4Blob);
            };
            
            // Start recording and play video
            mediaRecorder.start(100); // Collect data every 100ms
            video.play();
            
            // Draw frames to canvas
            const drawFrame = () => {
              if (!video.paused && !video.ended) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                requestAnimationFrame(drawFrame);
              } else {
                // Video ended, stop recording
                mediaRecorder.stop();
              }
            };
            
            drawFrame();
            
            // Stop recording when video ends
            video.onended = () => {
              setTimeout(() => mediaRecorder.stop(), 100);
            };
            
          } catch (error) {
            URL.revokeObjectURL(videoUrl);
            logger.error('Error during MP4 conversion:', error);
            logger.timeEnd('convertToMp4');
            reject(error);
          }
        };
        
        video.onerror = () => {
          URL.revokeObjectURL(videoUrl);
          logger.error('Failed to load video for conversion');
          logger.timeEnd('convertToMp4');
          reject(new Error('Failed to load video for conversion'));
        };
        
        video.src = videoUrl;
        video.load();
      });
      
    } catch (error) {
      logger.error('convertToMp4: Conversion failed:', error);
      logger.timeEnd('convertToMp4');
      return null;
    }
  }

  // Helper method to cleanup recording resources
  cleanupRecording(progressInterval, recordingTimeout, stream) {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    if (recordingTimeout) {
      clearTimeout(recordingTimeout);
      recordingTimeout = null;
    }
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => {
        try {
          track.stop();
        } catch (error) {
          logger.warn('Error stopping track:', error);
        }
      });
    }
  }
  
  // Helper method to get file extension from MIME type
  getFileExtension(mimeType) {
    if (!mimeType) return null;
    
    const mimeToExt = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/x-matroska': 'mkv'
    };
    
    return mimeToExt[mimeType.toLowerCase()] || null;
  }

  // Generate filename with username and timestamp
  generateFilename(extension) {
    logger.time('generateFilename');
    logger.log('Generating filename...');
    
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const username = this.extractUsername();
      const filename = `tiktok_${username}_${timestamp}.${extension}`;
      
      logger.debug('Generated filename:', filename);
      logger.timeEnd('generateFilename');
      return filename;
    } catch (error) {
      logger.error('Failed to generate filename:', error);
      logger.timeEnd('generateFilename');
      // Fallback filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      return `tiktok_video_${timestamp}.${extension}`;
    }
  }
  
  // Extract username from page
  extractUsername() {
    logger.time('extractUsername');
    logger.log('Extracting username from page...');
    
    try {
      // Try multiple selectors to find username
      const selectors = [
        '[data-e2e="user-title"]',
        '[data-e2e="browse-user-avatar"] + span',
        'a[href^="/@"] h2',
        'a[href^="/@"]',
        '[class*="UserName"]',
        'h1'
      ];
      
      logger.debug('Trying username selectors:', selectors);
      
      for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        logger.debug(`Trying username selector ${i + 1}: ${selector}`);
        
        const element = document.querySelector(selector);
        if (element) {
          let text = element.textContent || element.getAttribute('href') || '';
          text = text.replace(/^\/@/, '').replace(/^@/, '').trim();
          
          if (text && text.length > 0) {
            const username = text.substring(0, 30); // Limit length
            logger.log(`Found username via selector ${selector}:`, username);
            logger.timeEnd('extractUsername');
            return username;
          }
        }
      }
      
      logger.log('No username found via selectors, trying URL...');
      // Extract from URL
      const urlMatch = window.location.pathname.match(/\/@[^\/]+/);
      if (urlMatch) {
        const username = urlMatch[0].replace(/\/@/, '').substring(0, 30);
        logger.log('Found username via URL:', username);
        logger.timeEnd('extractUsername');
        return username;
      }
      
      logger.log('No username found, using default');
      logger.timeEnd('extractUsername');
      return 'unknown';
    } catch (error) {
      logger.error('Failed to extract username:', error);
      logger.timeEnd('extractUsername');
      return 'unknown';
    }
  }
}

/**
 * Main Content Script Controller
 */
class TikTokContentController {
  constructor() {
    this.detector = new TikTokVideoDetector();
    this.downloader = new TikTokDownloadManager();
    this.currentVideo = null;
    this.isDownloading = false;
    
    logger.log('TikTokContentController initialized');
    this.initialize();
  }
  
  initialize() {
    try {
      logger.log('Initializing content controller...');
      
      // Set up message listener for popup communication
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        logger.log('Received message:', request);
        logger.debug('Message sender:', sender);
        
        this.handleMessage(request, sender, sendResponse);
        return true; // Keep channel open for async responses
      });
      
      // Start monitoring for videos
      logger.log('Starting video monitoring...');
      this.detector.startMonitoring((video) => {
        this.currentVideo = video;
        logger.log('New video detected via monitoring:', video);
        logger.debug('Video metadata:', this.detector.extractMetadata(video));
      });
      
      // Initial video detection
      logger.log('Performing initial video detection...');
      this.detectVideo();
      
      logger.log('Content controller initialization complete');
    } catch (error) {
      logger.error('Failed to initialize content controller:', error);
    }
  }
  
  async detectVideo() {
    try {
      logger.time('detectVideo');
      logger.log('Detecting video on current page...');
      
      const video = await this.detector.findVideo();
      if (video) {
        this.currentVideo = video;
        logger.log('✓ Video detected successfully:', video);
      } else {
        logger.warn('No video detected on current page');
      }
      
      logger.timeEnd('detectVideo');
      return video;
    } catch (error) {
      logger.error('Error during video detection:', error);
      logger.timeEnd('detectVideo');
      return null;
    }
  }
  
  async handleMessage(request, sender, sendResponse) {
    try {
      logger.time('handleMessage');
      logger.log(`Handling message action: ${request.action}`);
      
      switch (request.action) {
        case 'ping':
          logger.log('Received ping from popup');
          sendResponse({ status: 'ready', timestamp: Date.now() });
          break;
          
        case 'detect-video':
          await this.handleDetectVideo(sendResponse);
          break;
          
        case 'download-video':
          await this.handleDownloadVideo(sendResponse);
          break;
          
        case 'get-video-info':
          await this.handleGetVideoInfo(sendResponse);
          break;
          
        default:
          logger.warn('Unknown message action:', request.action);
          sendResponse({ error: 'Unknown action' });
      }
      
      logger.timeEnd('handleMessage');
    } catch (error) {
      logger.error('Error handling message:', error);
      logger.timeEnd('handleMessage');
      sendResponse({ error: error.message });
    }
  }
  
  async handleDetectVideo(sendResponse) {
    try {
      logger.time('handleDetectVideo');
      logger.log('Processing detect-video request...');
      
      const video = await this.detectVideo();
      if (video) {
        const metadata = this.detector.extractMetadata(video);
        logger.log('Sending video found response:', metadata);
        sendResponse({ 
          videoFound: true, 
          videoInfo: metadata 
        });
      } else {
        logger.log('Sending video not found response');
        sendResponse({ videoFound: false });
      }
      
      logger.timeEnd('handleDetectVideo');
    } catch (error) {
      logger.error('Error in detect-video handler:', error);
      logger.timeEnd('handleDetectVideo');
      sendResponse({ 
        videoFound: false, 
        error: error.message 
      });
    }
  }
  
  async handleDownloadVideo(sendResponse) {
    try {
      logger.time('handleDownloadVideo');
      logger.log('Processing download-video request...');
      
      if (this.isDownloading) {
        logger.warn('Download already in progress, rejecting request');
        sendResponse({ 
          success: false, 
          error: 'Download already in progress' 
        });
        logger.timeEnd('handleDownloadVideo');
        return;
      }
      
      this.isDownloading = true;
      logger.log('Download process started');
      
      // Get or detect video
      let video = this.currentVideo;
      if (!video) {
        logger.log('No current video, attempting detection...');
        video = await this.detectVideo();
      }
      
      if (!video) {
        throw new Error('No video found on this page');
      }
      
      logger.log('Video ready for download:', video);
      
      // Download the video
      logger.log('Starting video download process...');
      const result = await this.downloader.downloadVideo(video, {
        onProgress: (progress) => {
          logger.debug('Download progress update:', progress);
          // Send progress updates if needed
          chrome.runtime.sendMessage({
            action: 'download-progress',
            progress: progress
          }).catch(error => {
            logger.warn('Failed to send progress update:', error);
          }); // Ignore errors if popup is closed
        }
      });
      
      logger.log('Download completed successfully:', result);
      
      // Send download to background script
      const blobUrl = URL.createObjectURL(result.blob);
      logger.debug('Created blob URL for download:', blobUrl);
      
      logger.log('Sending download request to background script...');
      chrome.runtime.sendMessage({
        action: 'trigger-download',
        url: blobUrl,
        filename: result.filename
      }, (downloadResponse) => {
        logger.debug('Background script download response:', downloadResponse);
        
        // Clean up blob URL after download starts
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          logger.debug('Revoked blob URL');
        }, 1000);
        
        // Store download history
        this.storeDownloadHistory(result.filename, result.method);
        
        logger.log('Sending success response to popup');
        sendResponse({ 
          success: true, 
          filename: result.filename,
          method: result.method
        });
        
        this.isDownloading = false;
        logger.log('Download process completed successfully');
        logger.timeEnd('handleDownloadVideo');
      });
      
    } catch (error) {
      logger.error('Download failed:', error);
      logger.timeEnd('handleDownloadVideo');
      this.isDownloading = false;
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  async handleGetVideoInfo(sendResponse) {
    try {
      logger.time('handleGetVideoInfo');
      logger.log('Processing get-video-info request...');
      
      const video = await this.detectVideo();
      if (video) {
        const info = this.detector.extractMetadata(video);
        logger.log('Sending video info response:', info);
        sendResponse({
          success: true,
          info: info
        });
      } else {
        logger.log('No video found for info request');
        sendResponse({
          success: false,
          error: 'No video found'
        });
      }
      
      logger.timeEnd('handleGetVideoInfo');
    } catch (error) {
      logger.error('Error in get-video-info handler:', error);
      logger.timeEnd('handleGetVideoInfo');
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }
  
  async storeDownloadHistory(filename, method) {
    try {
      logger.time('storeDownloadHistory');
      logger.log('Storing download history...');
      logger.debug('Download details:', { filename, method });
      
      const result = await chrome.storage.local.get(['downloadHistory']);
      const history = result.downloadHistory || [];
      
      const historyEntry = {
        filename,
        method,
        url: window.location.href,
        timestamp: Date.now()
      };
      
      history.unshift(historyEntry);
      logger.debug('History entry created:', historyEntry);
      
      // Keep only last 50 downloads
      if (history.length > 50) {
        const removed = history.pop();
        logger.debug('Removed old history entry:', removed);
      }
      
      await chrome.storage.local.set({ downloadHistory: history });
      logger.log(`Download history stored. Total entries: ${history.length}`);
      logger.timeEnd('storeDownloadHistory');
    } catch (error) {
      logger.error('Failed to store download history:', error);
      logger.timeEnd('storeDownloadHistory');
    }
  }
}

// Initialize the content controller
try {
  logger.log('Content script loading...');
  const controller = new TikTokContentController();
  logger.log('TikTok Video Downloader: Content script loaded successfully');
} catch (error) {
  console.error('[TT-Downloader] CRITICAL: Failed to load content script:', error);
}
