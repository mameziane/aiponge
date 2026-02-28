/**
 * Stub module for react-native-track-player
 * Used when running in Expo Go where native modules aren't available
 * All functions are no-ops that resolve immediately
 */

const noop = () => {};
const noopAsync = () => Promise.resolve();
const _noopAsyncUndefined = () => Promise.resolve(undefined);
const noopAsyncNull = () => Promise.resolve(null);
const noopAsyncNumber = () => Promise.resolve(0);
const noopAsyncArray = () => Promise.resolve([]);
const _noopAsyncObject = () => Promise.resolve({});

// Event constants
const Event = {
  PlaybackState: 'playback-state',
  PlaybackError: 'playback-error',
  PlaybackQueueEnded: 'playback-queue-ended',
  PlaybackTrackChanged: 'playback-track-changed',
  PlaybackActiveTrackChanged: 'playback-active-track-changed',
  PlaybackProgressUpdated: 'playback-progress-updated',
  RemotePlay: 'remote-play',
  RemotePause: 'remote-pause',
  RemoteStop: 'remote-stop',
  RemoteSkip: 'remote-skip',
  RemoteNext: 'remote-next',
  RemotePrevious: 'remote-previous',
  RemoteSeek: 'remote-seek',
  RemoteDuck: 'remote-duck',
  RemoteJumpForward: 'remote-jump-forward',
  RemoteJumpBackward: 'remote-jump-backward',
  RemoteLike: 'remote-like',
  RemoteDislike: 'remote-dislike',
  RemoteBookmark: 'remote-bookmark',
  RemoteSetRating: 'remote-set-rating',
};

// State constants
const State = {
  None: 'none',
  Ready: 'ready',
  Playing: 'playing',
  Paused: 'paused',
  Stopped: 'stopped',
  Buffering: 'buffering',
  Loading: 'loading',
  Error: 'error',
  Ended: 'ended',
};

// Capability constants
const Capability = {
  Play: 'play',
  Pause: 'pause',
  Stop: 'stop',
  SeekTo: 'seek-to',
  Skip: 'skip',
  SkipToNext: 'skip-to-next',
  SkipToPrevious: 'skip-to-previous',
  JumpForward: 'jump-forward',
  JumpBackward: 'jump-backward',
  SetRating: 'set-rating',
  Like: 'like',
  Dislike: 'dislike',
  Bookmark: 'bookmark',
};

// Repeat mode constants
const RepeatMode = {
  Off: 0,
  Track: 1,
  Queue: 2,
};

// App killed playback behavior
const AppKilledPlaybackBehavior = {
  ContinuePlayback: 'continue-playback',
  PausePlayback: 'pause-playback',
  StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification',
};

// No-op event listener that returns a remove function
const addEventListener = (_event, _handler) => ({
  remove: noop,
});

// Track player stub
const TrackPlayer = {
  // registerPlaybackService is a module-level function on the real RNTP module.
  // Included here so any code that calls TrackPlayerModule.registerPlaybackService
  // in Expo Go (where Metro resolves to this stub) gets a safe no-op instead of a throw.
  registerPlaybackService: noop,
  setupPlayer: noopAsync,
  updateOptions: noopAsync,
  add: noopAsync,
  remove: noopAsync,
  removeUpcomingTracks: noopAsync,
  skip: noopAsync,
  skipToNext: noopAsync,
  skipToPrevious: noopAsync,
  reset: noopAsync,
  play: noopAsync,
  pause: noopAsync,
  stop: noopAsync,
  seekTo: noopAsync,
  seekBy: noopAsync,
  setVolume: noopAsync,
  setRate: noopAsync,
  setRepeatMode: noopAsync,
  getVolume: noopAsyncNumber,
  getRate: noopAsyncNumber,
  getTrack: noopAsyncNull,
  getQueue: noopAsyncArray,
  getActiveTrack: noopAsyncNull,
  getActiveTrackIndex: noopAsyncNull,
  getDuration: noopAsyncNumber,
  getBufferedPosition: noopAsyncNumber,
  getPosition: noopAsyncNumber,
  getProgress: () => Promise.resolve({ position: 0, duration: 0, buffered: 0 }),
  getState: () => Promise.resolve(State.None),
  getPlaybackState: () => Promise.resolve({ state: State.None }),
  getRepeatMode: () => Promise.resolve(RepeatMode.Off),
  addEventListener,
  useTrackPlayerEvents: noop,
  useProgress: () => ({ position: 0, duration: 0, buffered: 0 }),
  usePlaybackState: () => ({ state: State.None }),
  useActiveTrack: () => null,
};

// Export as default and named exports
module.exports = TrackPlayer;
module.exports.default = TrackPlayer;
module.exports.registerPlaybackService = noop;
module.exports.Event = Event;
module.exports.State = State;
module.exports.Capability = Capability;
module.exports.RepeatMode = RepeatMode;
module.exports.AppKilledPlaybackBehavior = AppKilledPlaybackBehavior;
module.exports.useTrackPlayerEvents = noop;
module.exports.useProgress = () => ({ position: 0, duration: 0, buffered: 0 });
module.exports.usePlaybackState = () => ({ state: State.None });
module.exports.useActiveTrack = () => null;
