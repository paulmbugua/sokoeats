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
    tsconfigRootDir: __dirname,
    // ✅ Single TS program for ESLint (fixes multi-project perf + warnings)
    project: ['./tsconfig.eslint.json'],
    sourceType: 'module',
    ecmaVersion: 2020,
    ecmaFeatures: { jsx: true },
  },

  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'import'],

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
      // Keep resolver projects for path resolution (doesn't create TS programs like parserOptions.project does)
      typescript: {
        project: [
          path.resolve(__dirname, 'tsconfig.base.json'),
          path.resolve(__dirname, 'apps/mobile/tsconfig.json'),
          path.resolve(__dirname, 'apps/web/tsconfig.json'),
          path.resolve(__dirname, 'packages/shared/tsconfig.json'),
          path.resolve(__dirname, 'apps/backend/tsconfig.json'),
          // ✅ Add the unified one too
          path.resolve(__dirname, 'tsconfig.eslint.json'),
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
    // ✅ IMPORTANT: do NOT type-lint config JS files (fixes app.config.js + speeds up)
    {
      files: ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.config.js', '**/app.config.js'],
      parserOptions: { project: null },
    },

    {
      // ✅ Mobile-only: React Native lint lives here
      files: ['apps/mobile/**/*.{ts,tsx,js,jsx}'],
      // ✅ Keep RN rules, but don't spin up a second TS program
      parserOptions: { project: null },
      env: { 'react-native/react-native': true },
      plugins: ['react-native'],
      extends: ['plugin:react-native/all'],
      rules: {
        // ✅ Disable across app for now (your request)
        '@typescript-eslint/no-explicit-any': 'off',
        'react-native/no-inline-styles': 'off',
        'react-native/no-color-literals': 'off',
        'react-native/no-raw-text': 'off',

        // Existing relaxations
        '@typescript-eslint/no-unused-vars': 'off',
        'react/prop-types': 'off',
        'react-native/split-platform-components': 'off',
      },
    },

    {
      files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
      // ✅ Don't create another TS program; use the unified one already
      parserOptions: { project: null },
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
      files: ['packages/shared/**/*.{ts,tsx,js,jsx}'],
      // ✅ Don't create another TS program; use the unified one already
      parserOptions: { project: null },
      env: { browser: true, node: true },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-unused-expressions': 'off',
      },
    },

    {
      files: ['apps/backend/**/*.{js,mjs,cjs}'],
      parserOptions: {
        project: null, // ✅ prevents TS project lookup for backend JS
      },
      env: { node: true },
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
        'import/no-named-as-default': 'off',
        'import/no-named-as-default-member': 'off',
      },
    },
  ],
};
