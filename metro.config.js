const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// expo-sqlite web 端以 import 形式加载 wa-sqlite.wasm，需把 wasm 纳入资源类型
config.resolver.assetExts.push('wasm');

module.exports = config;