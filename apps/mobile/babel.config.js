// apps/mobile/babel.config.js
const path = require('path');

module.exports = function (api) {
  api.cache(true);
  return {
    // 👇 enable the transform so Hermes never sees raw `import.meta`
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
      [
        'module-resolver',
        {
          extensions: ['.tsx', '.ts', '.js', '.jsx', '.json'],
          alias: {
            // Force single copies from the app's node_modules
            react: path.resolve(__dirname, 'node_modules/react'),
            'react-native': path.resolve(__dirname, 'node_modules/react-native'),
            '@tanstack/react-query': path.resolve(__dirname, 'node_modules/@tanstack/react-query'),

            // Monorepo convenience (optional)
            '@mytutorapp/shared': path.resolve(__dirname, '../../packages/shared'),
            '@shared': path.resolve(__dirname, '../../packages/shared'),
          },
        },
      ],

      // MUST remain last
      'react-native-reanimated/plugin',
    ],
  };
};
