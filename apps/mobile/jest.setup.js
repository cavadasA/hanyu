jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// expo-audio patches AudioPlayer prototypes at import time, which crashes
// under jest (the native AudioModule.AudioPlayer is undefined). The app only
// uses the audio-mode switch, so mock the whole module.
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));
