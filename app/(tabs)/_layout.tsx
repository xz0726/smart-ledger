import { Tabs } from 'expo-router';
import { Home, ReceiptText, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardShadow, useThemeColors } from '../../src/theme';
import { spacing, radius, fontSize, TAB_BAR_CONTENT_HEIGHT } from '../../src/theme/spacing';

export default function TabLayout() {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.tabBarInactive,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.border,
          // 高度/内边距随系统导航方式自适应：三键导航 inset≈48，手势导航≈24，
          // 无导航栏（Web / 部分机型）为 0，此时与原有 64dp 设计完全一致
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingBottom: spacing.sm + insets.bottom,
          paddingTop: 6,
          ...cardShadow,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '500' },
      }}>
      <Tabs.Screen name="index" options={{ title: '仪表盘', headerShown: false, tabBarIcon: ({ color, size }) => <Home size={size} color={color as string} /> }} />
      <Tabs.Screen name="records" options={{ title: '账单', headerShown: false, tabBarIcon: ({ color, size }) => <ReceiptText size={size} color={color as string} /> }} />
      <Tabs.Screen name="settings" options={{ title: '设置', headerShown: false, tabBarIcon: ({ color, size }) => <Settings size={size} color={color as string} /> }} />
    </Tabs>
  );
}
