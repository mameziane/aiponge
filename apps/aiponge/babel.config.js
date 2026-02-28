module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // Enable react-native codegen for native modules
          unstable_transformProfile: 'hermes-stable',
          // Enable new architecture
          jsxRuntime: 'automatic',
        },
      ],
    ],
    plugins: ['react-native-reanimated/plugin'],
  };
};
