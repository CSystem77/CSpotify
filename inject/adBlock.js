let authorization = '';
let deviceId = '';

const tamperedStateIds = [];
let currentTracks = [];
const removedAdsList = [];
let totalAdsRemoved = 0;

let isFetchInterceptionWorking = false;
let isWebSocketInterceptionWorking = false;
let didCheckForInterception = false;
let didShowInterceptionWarning = false;
let isSimulatingStateChange = false;

const originalFetch = window.fetch;

startObserving();

window.postMessage({ type: 'log', message: 'Started observing', timestamp: Date.now() }, '*');
window.postMessage({ type: 'updateCounter', message: 0 }, '*');

window.fetch = function (url, init) {
  url = typeof url == 'string' ? url : url.toString();

  if (url != undefined && url.includes('spclient.wg.spotify.com') && !url.endsWith('/state')) {
    if (init.headers.authorization != undefined) {
      authorization = init.headers.authorization;
    }
  }

  if (url != undefined && url.endsWith('/devices')) {
    if (JSON.parse(init.body).device != undefined) {
      deviceId = JSON.parse(init.body).device.device_id;
    }
  } else if (url != undefined && url.endsWith('/state')) {
    return originalFetch.call(window, url, init).then(function (response) {
      return manipulateFetchResponse(response);
    });
  }

  return originalFetch.call(window, url, init);
};

wsHook.after = function (messageEvent, url) {
  return new Promise(async function (resolve, reject) {
    const data = JSON.parse(messageEvent.data);
    if (data.payloads == undefined) {
      resolve(messageEvent);
      return;
    }

    for (var i = 0; i < data.payloads.length; i++) {
      const payload = data.payloads[i];
      if (payload.type == 'replace_state') {
        const stateMachine = payload['state_machine'];
        const stateRef = payload['state_ref'];

        if (stateRef != null) {
          const currentStateIndex = stateRef['state_index'];

          payload['state_machine'] = await manipulateStateMachine(stateMachine, currentStateIndex, true);
          data.payloads[i] = payload;

          isWebSocketInterceptionWorking = true;
        }

        if (isSimulatingStateChange) {
          return new MessageEvent(messageEvent.type, { data: '{}' });
        }
      } else if (payload.cluster != undefined) {
        if (payload.update_reason == 'DEVICE_STATE_CHANGED') {
          if (deviceId != payload.cluster.active_device_id) {
          }

          if (payload.cluster.player_state.track.provider == 'ads/inject_tracks') {
            console.log(`spotify tried to inject ads, advertiser: ${payload.cluster.player_state.track.metadata.advertiser}`);
            window.postMessage({ type: 'log', message: `spotify tried to inject ads, advertiser: ${payload.cluster.player_state.track.metadata.advertiser}`, timestamp: Date.now() }, '*');
            payload.cluster.player_state.track = null;
            data.payloads[i] = payload;
          }
        }
      }
    }

    messageEvent.data = JSON.stringify(data);
    resolve(messageEvent);
  });
};

function manipulateFetchResponse(response) {
  const originalJson = response.json();
  response.json = function () {
    return originalJson
      .then(async function (data) {
        const stateMachine = data['state_machine'];
        const updatedStateRef = data['updated_state_ref'];
        if (stateMachine == undefined || updatedStateRef == null) return data;

        const currentStateIndex = updatedStateRef['state_index'];

        data['state_machine'] = await manipulateStateMachine(stateMachine, currentStateIndex, false);

        isFetchInterceptionWorking = true;

        return data;
      })
      .catch(function (e) {
        console.error(e);
        window.postMessage({ type: 'log', message: `error: ${e}`, timestamp: Date.now() }, '*');
      });
  };

  return response;
}

async function manipulateStateMachine(stateMachine, startingStateIndex, isReplacingState) {
  const states = stateMachine['states'];
  const tracks = stateMachine['tracks'];

  let stateMachineString = '';

  do {
    stateMachineString = '';
    var removedAds = false;

    for (let i = 0; i < states.length; i++) {
      let state = states[i];
      const stateId = state['state_id'];

      const trackID = state['track'];
      const track = tracks[trackID];

      const trackURI = track['metadata']['uri'];
      const trackName = track['metadata']['name'];

      stateMachineString += trackName + ' => ';

      if (isAd(state, stateMachine)) {
        console.log('Ad encountered: ' + trackURI);
        window.postMessage({ type: 'log', message: `Ad encountered: ${trackURI}`, timestamp: Date.now() }, '*');

        let nextState = getNextState(stateMachine, track, i);
        if (isAd(nextState, stateMachine)) {
          try {
            const maxAttempts = 3;
            let j = 0;
            let futureStateMachine = stateMachine;

            do {
              const latestTrack = futureStateMachine['tracks'][nextState['track']];
              futureStateMachine = await getStates(futureStateMachine['state_machine_id'], nextState['state_id']);
              nextState = getNextState(futureStateMachine, latestTrack);
              j++;
            } while (isAd(nextState, futureStateMachine) && j < maxAttempts);

            if (isAd(nextState, futureStateMachine)) {
              console.error(`could not find the next ad-free state. state machine was:`);
              console.log(futureStateMachine);
              window.postMessage({ type: 'log', message: `could not find the next ad-free state`, timestamp: Date.now() }, '*');
            }

            const nextStateId = nextState['state_id'];

            nextState['state_id'] = stateId;
            nextState['transitions'] = {};
            const nextTrack = futureStateMachine['tracks'][nextState['track']];
            tracks.push(nextTrack);
            nextState['track'] = tracks.length - 1;

            if (i == startingStateIndex && !isReplacingState) {
              nextState['state_id'] = nextStateId;
              stateMachine['state_machine_id'] = futureStateMachine['state_machine_id'];

              console.log(`removed ad at ${trackURI}, more complex flow`);
              window.postMessage({ type: 'log', message: `removed ad at ${trackURI}, more complex flow`, timestamp: Date.now() }, '*');
            }

            removedAds = true;
          } catch (e) {
            state = shortenedState(state, track);
            console.log(`shortened ad at ${trackURI} due to exception`);
            console.error(e);
            window.postMessage({ type: 'log', message: `shortened ad at ${trackURI} due to exception`, timestamp: Date.now() }, '*');
          }
        }

        if (nextState != null) {
          state = nextState;
          tamperedStateIds.push(nextState['state_id']);

          removedAds = true;
        }

        states[i] = state;
      }

      if (i == startingStateIndex && !isReplacingState && tamperedStateIds.includes(stateId)) {
        console.log(`removed ad at ${trackURI}`);
        window.postMessage({ type: 'log', message: `removed ad at ${trackURI}`, timestamp: Date.now() }, '*');
        onAdRemoved(trackURI);
      }
    }
  } while (removedAds);

  stateMachine = tryToRemoveAdTracks(stateMachine);

  stateMachine['states'] = states;
  stateMachine['tracks'] = tracks;

  currentTracks = tracks;

  return stateMachine;
}

function shortenedState(state, track) {
  const trackDuration = track['metadata']['duration'];

  state['disallow_seeking'] = false;
  state['restrictions'] = {};
  state['initial_playback_position'] = trackDuration;
  state['position_offset'] = trackDuration;

  return state;
}

async function getStates(stateMachineId, startingStateId, maxRetries = 3) {
  const statesUrl = 'https://spclient.wg.spotify.com/track-playback/v1/devices/' + deviceId + '/state';

  const body = {
    seq_num: 1619015341662,
    state_ref: { state_machine_id: stateMachineId, state_id: startingStateId, paused: false },
    sub_state: { playback_speed: 1, position: 0, duration: 0, stream_time: 0, media_type: 'AUDIO', bitrate: 160000 },
    previous_position: 0,
    debug_source: 'resume',
  };

  const result = await originalFetch.call(window, statesUrl, { method: 'PUT', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  if (result.status != 200) {
    console.error(`failed to get states, http status code ${result.status}`);
    window.postMessage({ type: 'log', message: `failed to get states, http status code ${result.status}`, timestamp: Date.now() }, '*');
    return null;
  }

  const resultJson = await result.json();
  const stateMachine = resultJson['state_machine'];
  if (!stateMachine) {
    console.error(`failed to get states, state machine is null, ${maxRetries > 0 ? 'will retry' : 'giving up'}`);
    window.postMessage({ type: 'log', message: `failed to get states, state machine is null, ${maxRetries > 0 ? 'will retry' : 'giving up'}`, timestamp: Date.now() }, '*');
    if (maxRetries > 0) return getStates(stateMachineId, startingStateId, maxRetries - 1);
  }

  return stateMachine;
}

function* statesGenerator(states, startingStateIndex = 2, nextStateName = 'skip_next') {
  const currentState = states[startingStateIndex];
  let iterationCount = 0;

  for (let state = currentState; state != undefined; state = states[state['transitions'][nextStateName]['state_index']]) {
    iterationCount += 1;

    yield state;

    const nextTransition = state['transitions'][nextStateName];
    if (nextTransition == undefined) break;
  }

  return iterationCount;
}

function getNextState(stateMachine, sourceTrack, startingStateIndex = 2, excludeAds = true) {
  const states = stateMachine['states'];
  const tracks = stateMachine['tracks'];
  let previousState = null;

  let foundTrack = false;
  for (var state of statesGenerator(states, startingStateIndex, 'advance')) {
    const trackID = state['track'];
    const track = tracks[trackID];

    if (foundTrack) {
      if (excludeAds && track['content_type'] == 'AD') continue;
      return state;
    }

    if (previousState == state) {
      console.error('cyclic state machine');
      window.postMessage({ type: 'log', message: 'cyclic state machine', timestamp: Date.now() }, '*');
      return state;
    }

    foundTrack = track['metadata']['uri'] == sourceTrack['metadata']['uri'];
    previousState = state;
  }

  return state;
}

function tryToRemoveAdTracks(stateMachine) {
  const tracks = stateMachine['tracks'];

  for (let i = 0; i < tracks.length; i++) {
    if (isAdTrack(tracks[i])) {
      console.log(`trying to remove ad track ${tracks[i]['metadata']['uri']}`);
      window.postMessage({ type: 'log', message: `trying to remove ad track ${tracks[i]['metadata']['uri']}`, timestamp: Date.now() }, '*');
      tracks[i] = null;
    }
  }

  stateMachine['tracks'] = tracks;
  return stateMachine;
}

function isAd(state, stateMachine) {
  const tracks = stateMachine['tracks'];

  const trackID = state['track'];
  const track = tracks[trackID];
  return isAdTrack(track);
}

function isAdTrack(track) {
  return track['metadata']['uri'].includes(':ad:');
}

function onAdRemoved(trackURI, skipped = false) {
  if (!removedAdsList.includes(trackURI)) {
    removedAdsList.push(trackURI);

    totalAdsRemoved += 1;
    window.postMessage({ type: 'updateCounter', message: totalAdsRemoved }, '*');
  }
}

function onSongResumed() {
  setTimeout(checkInterception, 1000);
}

function checkInterception() {
  let isInterceptionWorking = isFetchInterceptionWorking && isWebSocketInterceptionWorking;
  if (isInterceptionWorking) {
    if (!didCheckForInterception) {
      didCheckForInterception = true;
      console.log('interception working');
      window.postMessage({ type: 'log', message: 'interception working', timestamp: Date.now() }, '*');
    }
  } else if (!didShowInterceptionWarning) {
    didShowInterceptionWarning = true;
    console.log(`interception is not fully working, ${isFetchInterceptionWorking ? '' : 'fetch'} ${isWebSocketInterceptionWorking ? '' : 'websocket'}`);
    window.postMessage(
      { type: 'log', message: `interception is not fully working, ${isFetchInterceptionWorking ? '' : 'fetch'} ${isWebSocketInterceptionWorking ? '' : 'websocket'}`, timestamp: Date.now() },
      '*'
    );
  }
}

function startObserving() {
  let mutationObserver = new MutationObserver(function (mutationList) {
    mutationList.forEach((mutation) => {
      switch (mutation.type) {
        case 'attributes':
          var changedNode = mutation.target;
          if (changedNode.getAttribute('aria-label') == 'Pause') {
            onSongResumed();
          }

          break;
      }
    });
  });
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributeFilter: ['aria-label'] });
}
