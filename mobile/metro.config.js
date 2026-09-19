// Metro bundles /content (scenarios, trust key) from outside the app folder (D-027, T-08):
// the APK carries the committed content and needs no network to load it.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../content')];

// `.txt` files import as their text (content/trust/root_public_key.txt)
config.resolver.sourceExts = [...config.resolver.sourceExts, 'txt'];
config.transformer.babelTransformerPath = require.resolve('./metro-text-transformer.js');

module.exports = config;
