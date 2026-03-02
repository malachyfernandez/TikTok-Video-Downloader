document.addEventListener("DOMContentLoaded", () => {
  // Dismiss button handling.
  const dismissButton = document.querySelector(".dismiss-button");
  if (dismissButton) {
    dismissButton.addEventListener("click", () => {
      const pointer = document.getElementById("settingsPointer");
      pointer.classList.add("dismissing");
      pointer.addEventListener("transitionend", () => {
        pointer.remove();
      });
    });
  }

  const autoEnableCheckbox = document.getElementById("autoEnableCheckbox");
  const videoFormatSelect = document.getElementById("videoFormatSelect");
  const githubLink = document.getElementById("github-link");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const historyList = document.getElementById("historyList");
  
  // Debug logs elements
  const clearLogsBtn = document.getElementById("clearLogsBtn");
  const refreshLogsBtn = document.getElementById("refreshLogsBtn");
  const downloadLogsBtn = document.getElementById("downloadLogsBtn");
  const logsFilter = document.getElementById("logsFilter");
  const logsList = document.getElementById("logsList");

  // Load settings from storage.
  chrome.storage.local.get({ 
    extensionEnabled: true,
    autoEnable: true,
    videoFormat: 'mp4'
  }, (result) => {
    autoEnableCheckbox.checked = result.autoEnable;
    videoFormatSelect.value = result.videoFormat;
  });

  // Save settings on change
  autoEnableCheckbox.addEventListener("change", () => {
    const autoEnable = autoEnableCheckbox.checked;
    chrome.storage.local.set({ autoEnable }, () => {
      console.log("Auto-enable setting updated to", autoEnable);
    });
  });

  // Save video format setting on change
  videoFormatSelect.addEventListener("change", () => {
    const videoFormat = videoFormatSelect.value;
    chrome.storage.local.set({ videoFormat }, () => {
      console.log("Video format setting updated to", videoFormat);
    });
  });

  // GitHub link
  if (githubLink) {
    githubLink.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs.create({ url: githubLink.href });
    });
  }

  // Load download history
  loadDownloadHistory();

  // Clear history button
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: 'clear-download-history' }, (response) => {
        if (response && response.success) {
          renderEmptyHistory();
        }
      });
    });
  }

  // Debug logs functionality
  loadDebugLogs();
  
  // Clear logs button
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener("click", () => {
      chrome.storage.local.set({ debugLogs: [] }, () => {
        renderEmptyLogs();
      });
    });
  }
  
  // Refresh logs button
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener("click", () => {
      loadDebugLogs();
    });
  }
  
  // Download logs button
  if (downloadLogsBtn) {
    downloadLogsBtn.addEventListener("click", () => {
      downloadLogs();
    });
  }
  
  // Filter logs
  if (logsFilter) {
    logsFilter.addEventListener("input", () => {
      filterLogs(logsFilter.value);
    });
  }

  // Load and display download history
  function loadDownloadHistory() {
    chrome.runtime.sendMessage({ action: 'get-download-history' }, (response) => {
      if (response && response.history) {
        if (response.history.length === 0) {
          renderEmptyHistory();
        } else {
          renderHistoryList(response.history);
        }
      } else {
        renderEmptyHistory();
      }
    });
  }

  // Render empty history state
  function renderEmptyHistory() {
    historyList.innerHTML = '<div class="empty-history">No downloads yet. Start downloading TikTok videos!</div>';
  }

  // Render history list
  function renderHistoryList(history) {
    historyList.innerHTML = '';
    
    // Show only last 10 items
    const recentHistory = history.slice(0, 10);
    
    recentHistory.forEach(item => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      
      const date = new Date(item.timestamp);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      historyItem.innerHTML = `
        <div class="history-filename" title="${item.filename}">${item.filename}</div>
        <div class="history-date">${dateStr}</div>
      `;
      
      historyList.appendChild(historyItem);
    });
  }
  
  // Load debug logs
  function loadDebugLogs() {
    chrome.storage.local.get(['debugLogs'], (result) => {
      const logs = result.debugLogs || [];
      if (logs.length === 0) {
        renderEmptyLogs();
      } else {
        renderLogsList(logs);
      }
    });
  }
  
  // Render logs list
  function renderLogsList(logs) {
    logsList.innerHTML = '';
    
    logs.forEach(log => {
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry';
      
      const date = new Date(log.timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      logEntry.innerHTML = `
        <div class="log-timestamp">${timeStr}</div>
        <div class="log-level ${log.level}">${log.level}</div>
        <div class="log-message">${log.message}</div>
      `;
      
      logsList.appendChild(logEntry);
    });
  }
  
  // Render empty logs state
  function renderEmptyLogs() {
    logsList.innerHTML = '<div class="empty-logs">No logs available. Use the extension to generate logs.</div>';
  }
  
  // Filter logs
  function filterLogs(filterText) {
    chrome.storage.local.get(['debugLogs'], (result) => {
      const logs = result.debugLogs || [];
      const filteredLogs = logs.filter(log => 
        log.message.toLowerCase().includes(filterText.toLowerCase()) ||
        log.level.toLowerCase().includes(filterText.toLowerCase())
      );
      
      if (filteredLogs.length === 0) {
        logsList.innerHTML = '<div class="empty-logs">No logs match the filter.</div>';
      } else {
        renderLogsList(filteredLogs);
      }
    });
  }
  
  // Download logs as file
  function downloadLogs() {
    chrome.storage.local.get(['debugLogs'], (result) => {
      const logs = result.debugLogs || [];
      
      if (logs.length === 0) {
        alert('No logs to download.');
        return;
      }
      
      const logText = logs.map(log => {
        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleString();
        return `[${timeStr}] [${log.level.toUpperCase()}] ${log.message}`;
      }).join('\n');
      
      const blob = new Blob([logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiktok-downloader-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
});
