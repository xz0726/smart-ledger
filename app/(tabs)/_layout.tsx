import { Tabs } from 'expo-router';
import { Home, List, Settings } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e2e8f0',
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: '#ffffff' },
        headerTitleStyle: { color: '#1e293b', fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
      }}>
      <Tabs.Screen name="index" options={{ title: '仪表盘', tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }} />
      <Tabs.Screen name="records" options={{ title: '账单', tabBarIcon: ({ color, size }) => <List size={size} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: ({ color, size }) => <Settings size={size} color={color} /> }} />
    </Tabs>
  );
}