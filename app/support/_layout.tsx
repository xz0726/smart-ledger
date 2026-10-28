import { Stack } from 'expo-router';
import { useThemeColors } from '../../src/theme';

export default function SupportLayout() {
  const c = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.card },
        headerTitleStyle: { color: c.text, fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
        headerTintColor: c.primary,
        contentStyle: { backgroundColor: c.background },
      }}>
      <Stack.Screen name="contact" options={{ title: '骚扰作者' }} />
      <Stack.Screen name="feedback" options={{ title: '意见反馈' }} />
      <Stack.Screen name="donate" options={{ title: '投喂作者' }} />
    </Stack>
  );
}
