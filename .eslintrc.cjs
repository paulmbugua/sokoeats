// .eslintrc.cjs
const path = require('path');

module.exports = {
  root: true,
  ignorePatterns: [
    'node_modules/',
    'apps/mobile/android/**',
    'apps/mobile/ios/**',
    'apps/mobile/src/**/*.{native,android,ios}.{js,ts,tsx}',
    '**/*.d.ts',
    'apps/mobile/src/generated/**',
    'babel.config.js',
    '.eslintrc.cjs',
    'apps/web/**/*.config.js',
    'apps/web/**/*.config.ts',
  ],

  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    project: [
      './tsconfig.base.json',
      './apps/mobile/tsconfig.json',
      './apps/web/tsconfig.json',
      './packages/shared/tsconfig.json',
     
    ],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
    ecmaVersion: 2020,
    ecmaFeatures: { jsx: true },
  },

  // ✅ REMOVE react-native from global plugins
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'import'],

  // ✅ REMOVE plugin:react-native/all from global extends
extends: [
  'eslint:recommended',
  'plugin:@typescript-eslint/recommended',
  'plugin:react/recommended',
  'plugin:react/jsx-runtime',
  'plugin:import/errors',
  'plugin:import/warnings',
  'plugin:import/typescript',
  'prettier',
],


  settings: {
    react: { version: 'detect' },
    'import/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
    'import/resolver': {
      typescript: {
        project: [
          path.resolve(__dirname, 'apps/mobile/tsconfig.json'),
          path.resolve(__dirname, 'tsconfig.base.json'),
          path.resolve(__dirname, 'apps/web/tsconfig.json'),
          path.resolve(__dirname, 'packages/shared/tsconfig.json'),
          path.resolve(__dirname, 'apps/backend/tsconfig.json'),
        ],
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        moduleDirectory: ['node_modules', 'apps/mobile/node_modules', 'apps/web/node_modules'],
      },
    },
  },

  env: {
    es6: true,
    browser: true,
    node: true,
  },

rules: {
  'react/react-in-jsx-scope': 'off',
  'react/no-unescaped-entities': 'off',
  'no-empty': ['error', { allowEmptyCatch: true }],
},


  overrides: [
    {
      // ✅ Mobile-only: RN lint lives here now
      files: ['apps/mobile/**/*.{ts,tsx}'],
      parserOptions: { project: ['./apps/mobile/tsconfig.json'], tsconfigRootDir: __dirname },
      env: { 'react-native/react-native': true },
      plugins: ['react-native'],
      extends: ['plugin:react-native/all'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
        'react/prop-types': 'off',
        'react-native/split-platform-components': 'off',
      },
    },
    {
      files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
      parserOptions: { project: ['./apps/web/tsconfig.json'], tsconfigRootDir: __dirname },
      env: { browser: true, node: true },
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        'react/prop-types': 'off',
        'react/display-name': 'off',
        'import/default': 'off',
        'import/no-unresolved': 'off',
        'import/no-named-as-default-member': 'off',
      },
    },
    {
      files: ['packages/shared/**/*.{ts,tsx}'],
      parserOptions: { project: ['./packages/shared/tsconfig.json'], tsconfigRootDir: __dirname },
      env: { browser: true, node: true },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-unused-expressions': 'off',

        // If shared has intentional empty catches, this + global allowEmptyCatch is enough.
      },
    },
    {
  files: ["apps/backend/**/*.{js,mjs,cjs}"],
  parserOptions: {
    project: null, // ✅ KEY: prevents tsconfig lookup / TS5012
  },
  env: { node: true },
  rules: {
    // Optional: if backend is ESM and you don't want import/no-unresolved noise
    // "import/no-unresolved": "off",
  },
},

  ],
};
