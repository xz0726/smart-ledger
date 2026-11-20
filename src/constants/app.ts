import appJson from '../../app.json';

/**
 * 运行时版本号：直接取打进 bundle 的 app.json，Expo Go / 独立 APK / web 一致。
 * （不依赖 Constants.expoConfig：web 开发态下它来自 dev server 的缓存清单，可能与当前 app.json 不同步）
 */
export const APP_VERSION = appJson.expo.version;
