// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const workspaceRoot = path.resolve(__dirname, '../..');

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const RNTP_STUB = path.resolve(__dirname, 'src/__stubs__/track-player-stub.js');
const AUDIO_STUDIO_STUB = path.resolve(__dirname, 'src/__stubs__/expo-audio-studio-stub.js');

// Modules excluded from iOS native linking (see react-native.config.js).
// Metro must redirect their JS imports to stubs so the bundle never references
// absent TurboModules. Android builds resolve normally.
const IOS_STUB_MAP = {
  'react-native-track-player': RNTP_STUB,
  '@siteed/expo-audio-studio': AUDIO_STUDIO_STUB,
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'ios' && IOS_STUB_MAP[moduleName]) {
    return { filePath: IOS_STUB_MAP[moduleName], type: 'sourceFile' };
  }

  if (moduleName.endsWith('.js') && context.originModulePath.includes(workspaceRoot + '/packages')) {
    try {
      const tsModuleName = moduleName.replace(/\.js$/, '.ts');
      return context.resolveRequest(context, tsModuleName, platform);
    } catch {
      return context.resolveRequest(context, moduleName, platform);
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
