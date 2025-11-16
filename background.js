let messages = [];
let sessionStart = null;

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'log') {
    messages.push({
      message: msg.message,
      timestamp: msg.timestamp,
    });
  } else if (msg?.type === 'getAllLogs') {
    sendResponse({ messages });
    return true;
  } else if (msg?.type === 'updateCounter') {
    browser.browserAction.setBadgeText({ text: msg.message.toString() });
  } else if (msg?.type === 'setSessionStart') {
    sessionStart = msg.sessionStart;
    messages = [];
  } else if (msg?.type === 'getSessionStart') {
    sendResponse({ sessionStart });
  }
});

function modifyUserAgentHeader(userAgent) {
  const firefoxAndroidPattern = /Mozilla\/5\.0 \(Android .*; Mobile; rv:([\d.]+)\) Gecko\/[\d.]+ Firefox\/([\d.]+)/;
  const match = userAgent.match(firefoxAndroidPattern);
  
  if (match) {
    const firefoxVersion = match[2]; 
    const rvVersion = match[1];

    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${rvVersion}) Gecko/20100101 Firefox/${firefoxVersion}`;
  }
  
  return userAgent; 
}

browser.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    // Modifier l'user-agent uniquement pour les requêtes Spotify
    if (details.requestHeaders) {
      for (let header of details.requestHeaders) {
        if (header.name.toLowerCase() === 'user-agent') {
          const modifiedUA = modifyUserAgentHeader(header.value);
          // Ne modifier que si l'user-agent a effectivement changé
          if (modifiedUA !== header.value) {
            header.value = modifiedUA;
          }
          break;
        }
      }
    }
    
    return { requestHeaders: details.requestHeaders };
  },
  { urls: ['*://open.spotify.com/*', '*://*.spotify.com/*'] },
  ['blocking', 'requestHeaders']
);

browser.webRequest.onHeadersReceived.addListener(
  function (details) {
    for (let header of details.responseHeaders) {
      if (header.name.toLowerCase() === 'content-security-policy') {
        header.value = "default-src * data: blob: 'unsafe-inline' 'unsafe-eval';";
      }
    }

    return { responseHeaders: details.responseHeaders };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'responseHeaders']
);
