import { Tabs } from 'expo-router';
import { Home, ReceiptText, Settings } from 'lucide-react-native';
import { cardShadow, useThemeColors } from '../../src/theme';
import { spacing, radius, fontSize } from '../../src/theme/spacing';

export default function TabLayout() {
  const c = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.tabBarInactive,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.border,
          height: 64,
          paddingBottom: spacing.sm,
          paddingTop: 6,
          ...cardShadow,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '500' },
        headerStyle: { backgroundColor: c.card, shadowColor: 'transparent' },
        headerTitleStyle: { color: c.text, fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
      }}>
      <Tabs.Screen name="index" options={{ title: '仪表盘', headerShown: false, tabBarIcon: ({ color, size }) => <Home size={size} color={color as string} /> }} />
      <Tabs.Screen name="records" options={{ title: '账单', headerShown: false, tabBarIcon: ({ color, size }) => <ReceiptText size={size} color={color as string} /> }} />
      <Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: ({ color, size }) => <Settings size={size} color={color as string} /> }} />
    </Tabs>
  );
}
