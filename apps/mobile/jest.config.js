// apps/mobile/jest.config.js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|nativewind|react-navigation|@react-navigation|expo|@expo)/)',
  ],
  moduleNameMapper: {
    // Stub out the polyfills package and *all* its sub‐paths:
    '^@react-native/js-polyfills$': '<rootDir>/__mocks__/reactNativePolyfill.js',
    '^@react-native/js-polyfills/.+$': '<rootDir>/__mocks__/reactNativePolyfill.js',

    // Your existing mappings:
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@myhandymanapp/shared/(.*)$': '<rootDir>/../../packages/shared/$1',
  },
};
