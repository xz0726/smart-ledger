import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import * as SystemUI from 'expo-system-ui';
import { useSettingsStore } from '../src/stores/settingsStore';
import { syncFixedItems } from '../src/services/db';
import { getNavigationTheme, useResolvedTheme, useThemeColors } from '../src/theme';

export default function RootLayout() {
  const loadSettings = useSettingsStore(s => s.loadSettings);
  const resolved = useResolvedTheme();
  const c = useThemeColors();
  const navTheme = useMemo(() => getNavigationTheme(c, resolved === 'dark'), [c, resolved]);

  useEffect(() => {
    loadSettings();
    // 打开 App 时补生成到期固定收支记录（幂等，无新增则 no-op）
    syncFixedItems().catch(e => console.error('syncFixedItems failed:', e));
  }, []);

  // 窗口背景跟随主题：native-stack 转场（pop fade）期间白色窗口背景会透过透明 Fragment 层
  // 露白，contentStyle 染不到该层；这里直接把 window.decorView 背景染成主题背景
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.background).catch(() => {});
  }, [c]);

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} animated />
      <Stack screenOptions={{ contentStyle: { backgroundColor: c.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="support" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
