import { Tabs } from 'expo-router';
import { Home, List, Settings } from 'lucide-react-native';
import { useThemeColors } from '../../src/theme';

export default function TabLayout() {
  const c = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: c.tabBarInactive,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: c.card },
        headerTitleStyle: { color: c.text, fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
      }}>
      <Tabs.Screen name="index" options={{ title: '仪表盘', headerShown: false, tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }} />
      <Tabs.Screen name="records" options={{ title: '账单', headerShown: false, tabBarIcon: ({ color, size }) => <List size={size} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: ({ color, size }) => <Settings size={size} color={color} /> }} />
    </Tabs>
  );
}
