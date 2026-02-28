import { vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock('expo-font', () => ({
  loadAsync: vi.fn(() => Promise.resolve()),
  isLoaded: vi.fn(() => true),
  useFonts: vi.fn(() => [true, null]),
}));

vi.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: vi.fn(() => Promise.resolve()),
  hideAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock('expo-router', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    canGoBack: vi.fn(() => false),
  })),
  useSegments: vi.fn(() => []),
  usePathname: vi.fn(() => '/'),
  useLocalSearchParams: vi.fn(() => ({})),
  useGlobalSearchParams: vi.fn(() => ({})),
  Stack: { Screen: vi.fn(() => null) },
  Tabs: { Screen: vi.fn(() => null) },
  Redirect: vi.fn(() => null),
  Link: vi.fn(({ children }: { children: unknown }) => children),
  Slot: vi.fn(() => null),
}));

vi.mock('expo-linking', () => ({
  createURL: vi.fn((path: string) => `exp://localhost:8082/${path}`),
  openURL: vi.fn(),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: vi.fn(() => null),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: vi.fn((obj: Record<string, unknown>) => obj.ios ?? obj.default) },
  Dimensions: { get: vi.fn(() => ({ width: 375, height: 812, scale: 2, fontScale: 1 })) },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, flatten: vi.fn((s: unknown) => s) },
  Alert: { alert: vi.fn() },
  Linking: { openURL: vi.fn(), canOpenURL: vi.fn(() => Promise.resolve(true)) },
  AppState: { currentState: 'active', addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  Keyboard: { dismiss: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) },
  NativeModules: {},
  PixelRatio: { get: vi.fn(() => 2), roundToNearestPixel: vi.fn((v: number) => v) },
  Appearance: { getColorScheme: vi.fn(() => 'dark'), addChangeListener: vi.fn(() => ({ remove: vi.fn() })) },
  AccessibilityInfo: { isScreenReaderEnabled: vi.fn(() => Promise.resolve(false)) },
  View: vi.fn(() => null),
  Text: vi.fn(() => null),
  TouchableOpacity: vi.fn(() => null),
  ScrollView: vi.fn(() => null),
  FlatList: vi.fn(() => null),
  ActivityIndicator: vi.fn(() => null),
  TextInput: vi.fn(() => null),
  Image: vi.fn(() => null),
  Pressable: vi.fn(() => null),
  Switch: vi.fn(() => null),
}));

vi.mock('react-native-reanimated', () => ({
  default: {
    call: vi.fn(),
    createAnimatedComponent: vi.fn((c: unknown) => c),
  },
  useSharedValue: vi.fn((v: unknown) => ({ value: v })),
  useAnimatedStyle: vi.fn(() => ({})),
  withTiming: vi.fn((v: unknown) => v),
  withSpring: vi.fn((v: unknown) => v),
  withDelay: vi.fn((_d: number, v: unknown) => v),
  FadeIn: { duration: vi.fn(() => ({ delay: vi.fn(() => ({})) })) },
  FadeOut: { duration: vi.fn(() => ({})) },
  SlideInRight: {},
  SlideOutLeft: {},
  runOnJS: vi.fn((fn: Function) => fn),
  Easing: { bezier: vi.fn() },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
    getAllKeys: vi.fn(() => Promise.resolve([])),
    multiGet: vi.fn(() => Promise.resolve([])),
    multiSet: vi.fn(() => Promise.resolve()),
    multiRemove: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('react-native-track-player', () => ({
  default: {
    setupPlayer: vi.fn(() => Promise.resolve()),
    add: vi.fn(() => Promise.resolve()),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    reset: vi.fn(() => Promise.resolve()),
    skip: vi.fn(() => Promise.resolve()),
    seekTo: vi.fn(() => Promise.resolve()),
    getProgress: vi.fn(() => Promise.resolve({ position: 0, duration: 0, buffered: 0 })),
    getState: vi.fn(() => Promise.resolve('none')),
    getQueue: vi.fn(() => Promise.resolve([])),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    updateOptions: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn(() => Promise.resolve()),
    getVolume: vi.fn(() => Promise.resolve(1)),
    removeUpcomingTracks: vi.fn(() => Promise.resolve()),
    getActiveTrackIndex: vi.fn(() => Promise.resolve(null)),
    getActiveTrack: vi.fn(() => Promise.resolve(null)),
    move: vi.fn(() => Promise.resolve()),
  },
  useProgress: vi.fn(() => ({ position: 0, duration: 0, buffered: 0 })),
  usePlaybackState: vi.fn(() => ({ state: 'none' })),
  useActiveTrack: vi.fn(() => null),
  useIsPlaying: vi.fn(() => ({ playing: false, bufferingDuringPlay: false })),
  State: {
    None: 'none',
    Playing: 'playing',
    Paused: 'paused',
    Stopped: 'stopped',
    Ready: 'ready',
    Buffering: 'buffering',
    Loading: 'loading',
    Error: 'error',
    Ended: 'ended',
    Connecting: 'connecting',
  },
  Event: {
    PlaybackState: 'playback-state',
    PlaybackError: 'playback-error',
    PlaybackActiveTrackChanged: 'playback-active-track-changed',
    PlaybackQueueEnded: 'playback-queue-ended',
    PlaybackProgressUpdated: 'playback-progress-updated',
    RemotePlay: 'remote-play',
    RemotePause: 'remote-pause',
    RemoteStop: 'remote-stop',
    RemoteNext: 'remote-next',
    RemotePrevious: 'remote-previous',
    RemoteSeek: 'remote-seek',
  },
  Capability: {
    Play: 'play',
    Pause: 'pause',
    Stop: 'stop',
    SeekTo: 'seek-to',
    SkipToNext: 'skip-to-next',
    SkipToPrevious: 'skip-to-previous',
  },
  RepeatMode: { Off: 0, Track: 1, Queue: 2 },
  AppKilledPlaybackBehavior: {
    ContinuePlayback: 'continue-playback',
    PausePlayback: 'pause-playback',
    StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification',
  },
}));

vi.mock('react-native-purchases', () => ({
  default: {
    configure: vi.fn(),
    getCustomerInfo: vi.fn(() => Promise.resolve({ entitlements: { active: {} } })),
    getOfferings: vi.fn(() => Promise.resolve({ current: null })),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn(),
    logIn: vi.fn(),
    logOut: vi.fn(),
  },
  LOG_LEVEL: { VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
  PURCHASES_ERROR_CODE: {},
}));

vi.mock('react-native-purchases-ui', () => ({}));

vi.mock('@siteed/expo-audio-studio', () => ({
  default: {},
  useAudioRecorder: vi.fn(() => ({
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    isRecording: false,
  })),
}));

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: vi.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: vi.fn(() => Promise.resolve()),
  cancelAllScheduledNotificationsAsync: vi.fn(() => Promise.resolve()),
  setNotificationHandler: vi.fn(),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock('expo-image', () => ({
  Image: vi.fn(() => null),
}));

vi.mock('expo-linear-gradient', () => ({
  LinearGradient: vi.fn(({ children }: { children: unknown }) => children),
}));

vi.mock('expo-blur', () => ({
  BlurView: vi.fn(({ children }: { children: unknown }) => children),
}));

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(() => Promise.resolve()),
  getStringAsync: vi.fn(() => Promise.resolve('')),
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(() => Promise.resolve(true)),
  shareAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock('expo-speech-recognition', () => ({
  useSpeechRecognitionEvent: vi.fn(),
  ExpoSpeechRecognitionModule: {
    start: vi.fn(),
    stop: vi.fn(),
    requestPermissionsAsync: vi.fn(() => Promise.resolve({ granted: true })),
    getPermissionsAsync: vi.fn(() => Promise.resolve({ granted: true })),
  },
}));

vi.mock('expo-store-review', () => ({
  requestReview: vi.fn(() => Promise.resolve()),
  isAvailableAsync: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('expo-device', () => ({
  modelName: 'Test Device',
  osName: 'iOS',
  osVersion: '17.0',
  isDevice: true,
}));

vi.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
  readAsStringAsync: vi.fn(() => Promise.resolve('')),
  writeAsStringAsync: vi.fn(() => Promise.resolve()),
  deleteAsync: vi.fn(() => Promise.resolve()),
  getInfoAsync: vi.fn(() => Promise.resolve({ exists: false, isDirectory: false, size: 0 })),
  makeDirectoryAsync: vi.fn(() => Promise.resolve()),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  launchCameraAsync: vi.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  requestMediaLibraryPermissionsAsync: vi.fn(() => Promise.resolve({ granted: true })),
  requestCameraPermissionsAsync: vi.fn(() => Promise.resolve({ granted: true })),
  MediaTypeOptions: { Images: 'images', Videos: 'videos', All: 'all' },
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: vi.fn(({ children }: { children: unknown }) => children),
  SafeAreaProvider: vi.fn(({ children }: { children: unknown }) => children),
  useSafeAreaInsets: vi.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
}));

vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: vi.fn(({ children }: { children: unknown }) => children),
  Swipeable: vi.fn(() => null),
  DrawerLayout: vi.fn(() => null),
  State: {},
  PanGestureHandler: vi.fn(() => null),
  TapGestureHandler: vi.fn(() => null),
  FlingGestureHandler: vi.fn(() => null),
  LongPressGestureHandler: vi.fn(() => null),
  ScrollView: vi.fn(() => null),
  FlatList: vi.fn(() => null),
}));

vi.mock('react-native-screens', () => ({
  enableScreens: vi.fn(),
  Screen: vi.fn(() => null),
  ScreenContainer: vi.fn(() => null),
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: vi.fn(() => vi.fn()),
    fetch: vi.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  },
  useNetInfo: vi.fn(() => ({ isConnected: true, isInternetReachable: true })),
}));

vi.mock('expo-localization', () => ({
  getLocales: vi.fn(() => [{ languageCode: 'en', languageTag: 'en-US' }]),
  locale: 'en-US',
}));

vi.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: vi.fn(({ children }: { children: unknown }) => children),
  useKeyboardHandler: vi.fn(),
  useKeyboardAnimation: vi.fn(() => ({ height: { value: 0 }, progress: { value: 0 } })),
}));

vi.mock('expo-share-intent', () => ({
  useShareIntent: vi.fn(() => ({ shareIntent: null, resetShareIntent: vi.fn() })),
}));

vi.mock('expo-updates', () => ({
  checkForUpdateAsync: vi.fn(() => Promise.resolve({ isAvailable: false })),
  fetchUpdateAsync: vi.fn(() => Promise.resolve()),
  reloadAsync: vi.fn(() => Promise.resolve()),
  isEnabled: false,
}));

vi.mock('expo-audio', () => ({
  useAudioPlayer: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    currentTime: 0,
    duration: 0,
  })),
}));

vi.mock('expo-video', () => ({
  Video: vi.fn(() => null),
  ResizeMode: { CONTAIN: 'contain', COVER: 'cover' },
}));

vi.mock('react-native-worklets', () => ({
  createRunInJsFn: vi.fn((fn: Function) => fn),
  Worklets: { createRunInJsFn: vi.fn((fn: Function) => fn) },
}));

vi.mock('react-native-calendars', () => ({
  Calendar: vi.fn(() => null),
  CalendarList: vi.fn(() => null),
}));

vi.mock('@react-native-community/datetimepicker', () => ({
  default: vi.fn(() => null),
}));

vi.mock('react-native-get-random-values', () => ({}));
