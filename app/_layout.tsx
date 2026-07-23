import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useSettingsStore } from '../src/stores/settingsStore';

export default function RootLayout() {
  const loadSettings = useSettingsStore(s => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}