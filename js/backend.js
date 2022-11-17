var seconds = 1 * 1000;
var closeId = 0;
var autoCloserId = 0;
var uid = 'none';
var mute = true;
var muted = false;
var enabled = true;
var audioAdDetector = "a[data-context-item-type='ad'][href^='https://adclick.g.doubleclick.net']";
var video = 'none';

function run() {
    autoCloserId = setInterval(autoCloser, 100);
}

function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}


var autoCloser = function () {
	chrome.storage.sync.get({enabled: true, autoCloseAfter: 1, mute: true}, function (options) {
		enabled = options.enabled;
		mute = options.mute;
		
			if (mute) {				
				var audioPlaying = $('div.player-controls__buttons button[data-testid="control-button-playpause"]').attr('aria-label') !== 'Play';
				if($(audioAdDetector).is(':visible') && !muted) {
					if (audioPlaying) {						
						$('div.volume-bar button.volume-bar__icon-button.control-button').click();
						muted = true;
					}
				} else if (!$(audioAdDetector).is(':visible') && muted) {
					if (audioPlaying) {					
						$('div.volume-bar button.volume-bar__icon-button.control-button').click();		
					}
					muted = false;
				}				
			}
		
	});
}

$(document).ready(function () { 
	chrome.storage.sync.get({enabled: true, hotkey: 'F2', uid: 'none', mute: true}, function (options) {
		uid = options.uid == 'none' ? uuidv4() : options.uid;
				
		$.ajax({
			url: "https://www.google-analytics.com/mp/collect?measurement_id=G-FP6YSYBH3G&api_secret=fPtKBUGQSc6p-7TTLSh5OA", 
			crossDomain: true,
			type: "POST",
			dataType: "json",			
			contentType: "application/json; charset=utf-8",
			data: JSON.stringify({
			"client_id": uid,
			"events": [{
			  "name": "page_view",
			  "params": {				
				"page_title": 'Spotify',
				"page_location": 'https://open.spotify.com'
			  }
			}]
		  }),
		});
		
		if (options.uid == 'none') {
			chrome.storage.sync.set({uid: uid}, function() {});	
		}
		
		$(document).on('keydown', null, hotkey, triggerHotkey);
		run();
	});	
});

