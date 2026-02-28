// apps/mobile/metro.config.js
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config'); // ✅ use expo/metro-config

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..'); // monorepo root

// Only add folders you actually need Metro to watch (prevents watcher overload on Windows)
const sharedPkg = path.resolve(workspaceRoot, 'packages/shared');

/** @type {import('metro-config').ConfigT} */
const config = getDefaultConfig(projectRoot);

// 1) Watch the shared package (avoid watching the entire monorepo root)
config.watchFolders = Array.from(new Set([...(config.watchFolders || []), sharedPkg]));

// 2) Resolver: prefer this app's node_modules, then the workspace root
config.resolver = {
  ...(config.resolver || {}),
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ],

  // Keep aliases for your shared package
  alias: {
    ...(config.resolver?.alias || {}),
    '@myhandymanapp/shared': sharedPkg,
    '@shared': sharedPkg,
  },

  // Force single copies of these libs from the app's node_modules
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules || {}),
    react: path.resolve(projectRoot, 'node_modules/react'),
    'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
    '@tanstack/react-query': path.resolve(projectRoot, 'node_modules/@tanstack/react-query'),
    '@tanstack/query-core': path.resolve(projectRoot, 'node_modules/@tanstack/query-core'),
  },

  // ❌ REMOVE THIS (doctor complains, and not needed with node-modules linker)
  // unstable_enableSymlinks: true,
};

module.exports = config;
