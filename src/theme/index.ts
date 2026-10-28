import { useColorScheme, type ColorSchemeName } from 'react-native';
import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { useSettingsStore } from '../stores/settingsStore';

/** 主题偏好：跟随系统 / 浅色 / 深色 */
export type ThemePreference = 'light' | 'dark' | 'system';
/** 解析后的实际主题 */
export type ThemeName = 'light' | 'dark';

/** 语义色 token：浅色 / 深色两套取值，组件只认 token 不认字面量 */
export interface ThemeColors {
  /** 页面背景 */
  background: string;
  /** 卡片 / tabBar / header 背景 */
  card: string;
  /** 主文字 */
  text: string;
  /** 次要文字 */
  textSecondary: string;
  /** 提示 / 占位 */
  hint: string;
  /** 边框 / chip 描边 */
  border: string;
  /** 内嵌输入 / 面板 */
  inputBg: string;
  /** 轨道 / 分隔线 / 分段控件轨道（深色下比 card 深，靠明度差表现选中） */
  subtle: string;
  /** 激活 chip 底色 */
  primarySoftBg: string;
  /** primarySoftBg 上的文字 */
  primaryText: string;
  /** 历史月提示条底色 */
  histHintBg: string;
  /** 历史月提示条文字 */
  histHintText: string;
  /** 禁用态 */
  disabled: string;
  /** tab 栏背景 */
  tabBar: string;
  /** tab 未选中 tint */
  tabBarInactive: string;
  /** 品牌主色（按钮/激活态/图表主色） */
  primary: string;
  /** 收入 / 成功 */
  success: string;
  /** 支出超出 / 危险 / 删除 */
  danger: string;
  /** 预算预警 */
  warning: string;
  /** 信息提示 */
  info: string;
}

export const lightColors: ThemeColors = {
  background: '#f8fafc',
  card: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  hint: '#94a3b8',
  border: '#e2e8f0',
  inputBg: '#f8fafc',
  subtle: '#f1f5f9',
  primarySoftBg: '#eef2ff',
  primaryText: '#6366f1',
  histHintBg: '#fef3c7',
  histHintText: '#b45309',
  disabled: '#cbd5e1',
  tabBar: '#ffffff',
  tabBarInactive: '#94a3b8',
  primary: '#6366f1',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

export const darkColors: ThemeColors = {
  background: '#0f172a',
  card: '#1e293b',
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  hint: '#64748b',
  border: '#475569',
  inputBg: '#334155',
  subtle: '#0f172a',
  primarySoftBg: '#312e81',
  primaryText: '#818cf8',
  histHintBg: '#78350f',
  histHintText: '#fcd34d',
  disabled: '#475569',
  tabBar: '#1e293b',
  tabBarInactive: '#64748b',
  // 深色下用提亮变体保证对比度（primary 与 primaryText 同为 indigo-400）
  primary: '#818cf8',
  success: '#4ade80',
  danger: '#f87171',
  warning: '#fbbf24',
  info: '#60a5fa',
};

/**
 * 卡片统一阴影：iOS/web 走 shadow*（elevation 在 web 不生效，截图/网页端会显得扁平），
 * Android 走 elevation。样式工厂里以 `...cardShadow` 展开。
 */
export const cardShadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

/**
 * 解析实际主题：preference 为 light/dark 时固定；system 跟随系统
 * （系统主题不可判定时（useColorScheme 返回 null）安全回落浅色）
 */
export function resolveTheme(
  preference: ThemePreference,
  systemScheme: ColorSchemeName
): ThemeName {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemScheme === 'dark' ? 'dark' : 'light';
}

/** 当前解析后的主题名（偏好 × 系统主题） */
export function useResolvedTheme(): ThemeName {
  return resolveTheme(useSettingsStore(s => s.theme), useColorScheme());
}

/** 当前主题色（模块级常量，主题切换才变化，可用作 useMemo deps） */
export function useThemeColors(): ThemeColors {
  return useResolvedTheme() === 'dark' ? darkColors : lightColors;
}

/**
 * react-navigation 主题（供 expo-router <ThemeProvider>）：
 * spread 内置 DefaultTheme/DarkTheme 保留 fonts，仅覆盖 colors，
 * 导航场景背景 / 头部 / 转场随主题。
 */
export function getNavigationTheme(c: ThemeColors, dark: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark,
    colors: {
      ...base.colors,
      primary: c.primary,          // 品牌主色（随主题）
      background: c.background,    // 场景背景（转场 / tab 场景）
      card: c.card,                // header / 卡片默认
      text: c.text,
      border: c.border,
      notification: '#ef4444',     // 固定危险色（tab badge）
    },
  };
}
