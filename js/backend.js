chrome.webRequest.onHeadersReceived.addListener(function(details) { 
    if(details.responseHeaders.find(el => el.name == "Content-Type").value.includes("mp3"))
        return {redirectUrl: 'https://raw.githubusercontent.com/texnikru/blank-mp3s/master/1sec.mp3'};
}, { urls: ["*://media-match.com/*","*://*.doublecklick.net/*","*://googleadservices.com/*","*://*.googlesyndication.com/*","*://desktop.spotify.com/*","*://*.doubleclick.net/*","*://audio2.spotify.com/*","*://www.omaze.com/*","*://omaze.com/*","*://bounceexchange.com/*","*://*.audio-akp-quic-spotify-com.akamaized.net/*", "*://*.audio-fa.scdn.co/*", "*://creativeservice-production.scdn.co/*", "*://gew1-spclient.spotify.com/*"] }, ["blocking","responseHeaders"])
