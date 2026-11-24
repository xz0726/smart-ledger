import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Constants from 'expo-constants';

/**
 * react-native-keyboard-controller 是原生库，Expo Go 未内置。
 * 它的入口在模块求值时就创建 NativeEventEmitter，原生模块缺失会同步抛
 * LINKING_ERROR，导致 Expo Go 加载完 bundle 直接闪退。
 *
 * 这里在 Expo Go 下不 require 它，退化为普通 View；
 * 原生构建（APK / dev build）下使用真实实现，行为不变。
 */
const isExpoGo = Constants.executionEnvironment === 'storeClient';

type ProviderProps = { children: React.ReactNode };
type StickyProps = {
  children: React.ReactNode;
  offset?: { closed: number; opened: number };
  style?: StyleProp<ViewStyle>;
};

let Provider: React.ComponentType<ProviderProps> = ({ children }) => <>{children}</>;
let Sticky: React.ComponentType<StickyProps> = ({ children, style }) => <View style={style}>{children}</View>;

if (!isExpoGo) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const kc = require('react-native-keyboard-controller');
  Provider = kc.KeyboardProvider;
  Sticky = kc.KeyboardStickyView;
}

export const KeyboardProvider = Provider;
export const KeyboardStickyView = Sticky;
