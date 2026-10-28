const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// expo-sqlite web 端以 import 形式加载 wa-sqlite.wasm，需把 wasm 纳入资源类型
config.resolver.assetExts.push('wasm');

// expo-sqlite web 的 worker 通道依赖 SharedArrayBuffer，
// 需要 COOP/COEP 头让页面进入跨域隔离（crossOriginIsolated）状态
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    console.log('[metro-config] enhanceMiddleware invoked');
    return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    middleware(req, res, next);
    };
  },
};

module.exports = config;