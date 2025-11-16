(function () {
  var s = document.createElement('script');
  var functionText = wsHookFunc.toString();
  s.textContent = functionText.substring(functionText.indexOf('{') + 1, functionText.length - 1);

  (document.head || document.documentElement).appendChild(s);
})();

(async function () {
  await injectScript('inject/adBlock.js');
})();

function modifyUserAgent() {
  // Détecter si l'user-agent correspond à Firefox Android
  const originalUserAgent = navigator.userAgent;
  // Pattern: Mozilla/5.0 (Android [Y]; Mobile; rv:[X]) Gecko/[X] Firefox/[X]
  const firefoxAndroidPattern = /Mozilla\/5\.0 \(Android .*; Mobile; rv:([\d.]+)\) Gecko\/[\d.]+ Firefox\/([\d.]+)/;
  const match = originalUserAgent.match(firefoxAndroidPattern);
  
  if (match) {
    const firefoxVersion = match[2]; // Version Firefox (Firefox/[X])
    const rvVersion = match[1]; // Version rv (rv:[X])
    
    // Nouvel user-agent Windows Firefox
    const newUserAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${rvVersion}) Gecko/20100101 Firefox/${firefoxVersion}`;
    
    // Modifier navigator.userAgent de manière optimisée
    try {
      // Utiliser une variable en closure pour éviter les recalculs
      Object.defineProperty(navigator, 'userAgent', {
        get: function() {
          return newUserAgent;
        },
        configurable: true,
        enumerable: true
      });
      
      // Modifier aussi navigator.platform si nécessaire
      Object.defineProperty(navigator, 'platform', {
        get: function() {
          return 'Win32';
        },
        configurable: true,
        enumerable: true
      });
      
      // Modifier navigator.userAgentData si disponible (pour les navigateurs modernes)
      if (navigator.userAgentData) {
        try {
          Object.defineProperty(navigator, 'userAgentData', {
            get: function() {
              return {
                ...navigator.userAgentData,
                platform: 'Windows',
                mobile: false
              };
            },
            configurable: true
          });
        } catch (e) {
          // Ignorer si userAgentData n'est pas modifiable
        }
      }
    } catch (e) {
      console.error('Erreur lors de la modification de l\'user-agent:', e);
    }
  }
}

// Appeler la fonction de modification de l'user-agent immédiatement, avant tout autre script
if (document.readyState === 'loading') {
  modifyUserAgent();
} else {
  modifyUserAgent();
}

function injectScript(scriptName) {
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = chrome.extension.getURL(scriptName);
    s.onload = function () {
      this.parentNode.removeChild(this);
      resolve(true);
    };
    (document.head || document.documentElement).appendChild(s);
  });
}

function wsHookFunc() {
  var wsHook = {};

  (function () {
    var before = (wsHook.before = function (data, url) {
      return new Promise(function (resolve, reject) {
        resolve(data);
      });
    });
    var after = (wsHook.after = function (e, url) {
      return e;
    });
    wsHook.resetHooks = function () {
      wsHook.before = before;
      wsHook.after = after;
    };

    var _WS = WebSocket;
    WebSocket = function (url, protocols) {
      var WSObject;
      this.url = url;
      this.protocols = protocols;
      if (!this.protocols) WSObject = new _WS(url);
      else WSObject = new _WS(url, protocols);

      var _send = WSObject.send;
      var _wsobject = this;
      wsHook._send = WSObject.send = function (data) {
        new wsHook.before(data, WSObject.url)
          .then(function (newData) {
            if (newData != null) _send.apply(WSObject, [newData]);
          })
          .catch(function (e) {
            console.error(e);
            _send.apply(WSObject, [newData]);
          });
      };

      var onmessageFunction;
      WSObject.__defineSetter__('onmessage', function (func) {
        onmessageFunction = wsHook.onMessage = func;
      });
      WSObject.addEventListener('message', function (event) {
        if (!onmessageFunction) {
          console.log('warning: no onmessageFunction');
          return;
        }

        wsHook
          .after(new MutableMessageEvent(event), this.url)
          .then(function (modifiedEvent) {
            if (modifiedEvent != null) onmessageFunction.apply(this, [modifiedEvent]);
          })
          .catch(function (e) {
            console.error(e);
            onmessageFunction.apply(this, [event]);
          });
      });

      return WSObject;
    };
  })();

  function MutableMessageEvent(o) {
    this.bubbles = o.bubbles || false;
    this.cancelBubble = o.cancelBubble || false;
    this.cancelable = o.cancelable || false;
    this.currentTarget = o.currentTarget || null;
    this.data = o.data || null;
    this.defaultPrevented = o.defaultPrevented || false;
    this.eventPhase = o.eventPhase || 0;
    this.lastEventId = o.lastEventId || '';
    this.origin = o.origin || '';
    this.path = o.path || new Array(0);
    this.ports = o.parts || new Array(0);
    this.returnValue = o.returnValue || true;
    this.source = o.source || null;
    this.srcElement = o.srcElement || null;
    this.target = o.target || null;
    this.timeStamp = o.timeStamp || null;
    this.type = o.type || 'message';
    this.__proto__ = o.__proto__ || MessageEvent.__proto__;
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.type === 'log') {
    browser.runtime.sendMessage({ type: 'log', message: event.data.message, timestamp: event.data.timestamp });
  } else if (event.data?.type == 'updateCounter') {
    browser.runtime.sendMessage({ type: 'updateCounter', message: event.data.message });
    if (event.data.message == 0) {
      browser.runtime.sendMessage({ type: 'setSessionStart', sessionStart: Date.now() });
    }
  }
});

function hideUpgradeButton() {
  const style = document.createElement('style');
  style.textContent = `
    button[data-testid="upgrade-button"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  const hideButtons = () => {
    const buttons = document.querySelectorAll('button[data-testid="upgrade-button"]');
    buttons.forEach(button => {
      button.style.display = 'none';
      button.style.visibility = 'hidden';
      button.style.opacity = '0';
      button.style.height = '0';
      button.style.width = '0';
      button.style.overflow = 'hidden';
    });
  };

  const initObserver = () => {
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(initObserver, 100);
      return;
    }

    hideButtons();

    const observer = new MutationObserver(() => {
      hideButtons();
    });

    observer.observe(target, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }
}

function hidePremiumBanner() {
  const style = document.createElement('style');
  style.textContent = `
    [data-testid="premium-banner"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  const hideBanners = () => {
    const banners = document.querySelectorAll('[data-testid="premium-banner"]');
    banners.forEach(banner => {
      banner.style.display = 'none';
      banner.style.visibility = 'hidden';
      banner.style.opacity = '0';
      banner.style.height = '0';
      banner.style.width = '0';
      banner.style.overflow = 'hidden';
    });
  };

  const initObserver = () => {
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(initObserver, 100);
      return;
    }

    hideBanners();

    const observer = new MutationObserver(() => {
      hideBanners();
    });

    observer.observe(target, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }
}

function hideClassElement() {
  const style = document.createElement('style');
  style.textContent = `
    .Mxo5IID6cL0rkODED2vU {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  const hideElements = () => {
    const elements = document.querySelectorAll('.Mxo5IID6cL0rkODED2vU');
    elements.forEach(element => {
      element.style.display = 'none';
      element.style.visibility = 'hidden';
      element.style.opacity = '0';
      element.style.height = '0';
      element.style.width = '0';
      element.style.overflow = 'hidden';
    });
  };

  const initObserver = () => {
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(initObserver, 100);
      return;
    }

    hideElements();

    const observer = new MutationObserver(() => {
      hideElements();
    });

    observer.observe(target, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }
}

function replaceDownloadLinks() {
  const replaceLinks = () => {
    const links = document.querySelectorAll('a[href="/download"]');
    links.forEach(link => {
      if (link.dataset.replaced !== 'true') {
        const textNode = document.createTextNode('Modded by CSystem');
        
        link.innerHTML = '';
        link.appendChild(textNode);
        
        link.removeAttribute('href');
        
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        
        link.dataset.replaced = 'true';
      }
    });
  };

  const initObserver = () => {
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(initObserver, 100);
      return;
    }

    replaceLinks();

    const observer = new MutationObserver(() => {
      replaceLinks();
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }
}

function replaceHomeLinks() {
  const getImageUrl = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime.getURL('img/logo_cspotify.png');
    } else if (typeof browser !== 'undefined' && browser.runtime) {
      return browser.runtime.getURL('img/logo_cspotify.png');
    }
    return null;
  };

  const imageUrl = getImageUrl();
  if (!imageUrl) {
    console.error('Impossible de charger l\'image logo_cspotify.png');
    return;
  }

  const replaceLinks = () => {
    const links = document.querySelectorAll('a[href="/"]');
    links.forEach(link => {
      if (link.dataset.replacedHome !== 'true') {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'CSpotify';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        
        link.innerHTML = '';
        link.appendChild(img);
        
        link.href = '/';
        
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = '/';
        });
        
        link.dataset.replacedHome = 'true';
      }
    });
  };

  const initObserver = () => {
    const target = document.body || document.documentElement;
    if (!target) {
      setTimeout(initObserver, 100);
      return;
    }

    replaceLinks();

    const observer = new MutationObserver(() => {
      replaceLinks();
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }
}

function injectCustomCSS() {
  // Détecter si l'user-agent correspond au pattern Windows Firefox modifié
  // (qui indique qu'il s'agissait à l'origine d'un Firefox Android)
  const isModifiedWindowsFirefox = () => {
    const userAgent = navigator.userAgent;
    // Pattern: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:[X]) Gecko/20100101 Firefox/[X]
    const modifiedWindowsPattern = /Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64; rv:[\d.]+\) Gecko\/20100101 Firefox\/[\d.]+/;
    return modifiedWindowsPattern.test(userAgent);
  };

  const getCSSUrl = () => {
    // Si l'user-agent correspond au pattern Windows modifié, charger le CSS Android
    const cssFileName = isModifiedWindowsFirefox() ? 'css/web-player.android.css' : 'css/web-player.css';
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime.getURL(cssFileName);
    } else if (typeof browser !== 'undefined' && browser.runtime) {
      return browser.runtime.getURL(cssFileName);
    }
    return null;
  };

  const cssUrl = getCSSUrl();
  if (!cssUrl) {
    console.error('Impossible de charger le fichier CSS');
    return;
  }

  const hasSpotifyWebPlayerCSS = () => {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (let link of links) {
      const href = link.href || '';
      if (href.includes('web-player.') && href.endsWith('.css')) {
        return true;
      }
    }
    return false;
  };

  const injectCSS = () => {
    const existingLink = document.querySelector(`link[href="${cssUrl}"]`);
    if (existingLink) {
      return;
    }

    const links = document.querySelectorAll('link[rel="stylesheet"]');
    let lastSpotifyCSS = null;
    
    for (let link of links) {
      const href = link.href || '';
      if (href.includes('web-player.') && href.endsWith('.css')) {
        lastSpotifyCSS = link;
      }
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    link.type = 'text/css';

    if (lastSpotifyCSS && lastSpotifyCSS.nextSibling) {
      lastSpotifyCSS.parentNode.insertBefore(link, lastSpotifyCSS.nextSibling);
    } else if (lastSpotifyCSS) {
      lastSpotifyCSS.parentNode.appendChild(link);
    } else {
      (document.head || document.documentElement).appendChild(link);
    }
  };

  const initCSSInjection = () => {
    const head = document.head || document.documentElement;
    if (!head) {
      setTimeout(initCSSInjection, 100);
      return;
    }

    if (hasSpotifyWebPlayerCSS()) {
      injectCSS();
    }

    const observer = new MutationObserver((mutations) => {
      let shouldInject = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'LINK' && node.rel === 'stylesheet') {
            const href = node.href || '';
            if (href.includes('web-player.') && href.endsWith('.css')) {
              shouldInject = true;
            }
          }
        });
      });
      if (shouldInject) {
        setTimeout(injectCSS, 50);
      }
    });

    observer.observe(head, {
      childList: true,
      subtree: false
    });

    const checkInterval = setInterval(() => {
      if (hasSpotifyWebPlayerCSS()) {
        injectCSS();
        clearInterval(checkInterval);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkInterval);
      if (!document.querySelector(`link[href="${cssUrl}"]`)) {
        injectCSS();
      }
    }, 10000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCSSInjection);
  } else {
    initCSSInjection();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hideUpgradeButton);
  document.addEventListener('DOMContentLoaded', hidePremiumBanner);
  document.addEventListener('DOMContentLoaded', hideClassElement);
  document.addEventListener('DOMContentLoaded', replaceDownloadLinks);
  document.addEventListener('DOMContentLoaded', replaceHomeLinks);
  document.addEventListener('DOMContentLoaded', injectCustomCSS);
} else {
  hideUpgradeButton();
  hidePremiumBanner();
  hideClassElement();
  replaceDownloadLinks();
  replaceHomeLinks();
  injectCustomCSS();
}
