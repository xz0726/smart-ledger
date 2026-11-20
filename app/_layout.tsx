import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as SystemUI from 'expo-system-ui';
import { useSettingsStore } from '../src/stores/settingsStore';
import { syncFixedItems } from '../src/services/db';
import { startNotifyCapture } from '../src/services/notifyCapture';
import WhatsNewModal from '../src/components/WhatsNewModal';
import { APP_VERSION } from '../src/constants/app';
import { RELEASE_NOTES, type ReleaseNotes } from '../src/constants/releaseNotes';
import { getSeenVersion, setSeenVersion } from '../src/services/whatsNew';
import { getNavigationTheme, useResolvedTheme, useThemeColors } from '../src/theme';

export default function RootLayout() {
  const loadSettings = useSettingsStore(s => s.loadSettings);
  const loaded = useSettingsStore(s => s.loaded);
  const resolved = useResolvedTheme();
  const c = useThemeColors();
  const navTheme = useMemo(() => getNavigationTheme(c, resolved === 'dark'), [c, resolved]);

  // 更新介绍：同一版本只在第一次打开时弹一次（关闭时记已读）
  const [note, setNote] = useState<{ version: string; notes: ReleaseNotes } | null>(null);
  const [noteVisible, setNoteVisible] = useState(false);

  useEffect(() => {
    loadSettings();
    // 打开 App 时补生成到期固定收支记录（幂等，无新增则 no-op）
    syncFixedItems().catch(e => console.error('syncFixedItems failed:', e));
    // 通知捕获自动记账：开关开启且已授权时开始监听（含取出后台落盘缓冲）
    startNotifyCapture().catch(e => console.error('startNotifyCapture failed:', e));
  }, []);

  // 窗口背景跟随主题：native-stack 转场（pop fade）期间白色窗口背景会透过透明 Fragment 层
  // 露白，contentStyle 染不到该层；这里直接把 window.decorView 背景染成主题背景
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.background).catch(() => {});
  }, [c]);

  // 等设置（主题等）加载完再判断，避免弹层先以浅色闪一下
  useEffect(() => {
    if (!loaded) return;
    const entry = APP_VERSION ? RELEASE_NOTES[APP_VERSION] : undefined;
    if (!entry) return; // 该版本没有更新文案 → 不弹，也不写已读
    let alive = true;
    getSeenVersion()
      .then(seen => {
        if (!alive || seen === APP_VERSION) return;
        setNote({ version: APP_VERSION, notes: entry });
        setNoteVisible(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [loaded]);

  const closeNote = useCallback(() => {
    setNoteVisible(false);
    if (note) setSeenVersion(note.version).catch(() => {});
  }, [note]);

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} animated />
      <Stack screenOptions={{ contentStyle: { backgroundColor: c.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="support" options={{ headerShown: false }} />
      </Stack>
      {note ? (
        <WhatsNewModal visible={noteVisible} version={note.version} notes={note.notes} onClose={closeNote} />
      ) : null}
    </ThemeProvider>
  );
}
