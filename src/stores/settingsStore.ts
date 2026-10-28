import { create } from 'zustand';
import type { AIConfig } from '../types';
import type { ThemePreference } from '../theme';
import { getSetting, setSetting } from '../services/db';

interface SettingsState {
  aiConfig: AIConfig;
  theme: ThemePreference;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  saveAIConfig: (config: AIConfig) => Promise<void>;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  aiConfig: {
    apiUrl: '',
    apiKey: '',
    model: '',
  },
  theme: 'system',
  loaded: false,

  loadSettings: async () => {
    const apiUrl = await getSetting('ai_api_url');
    const apiKey = await getSetting('ai_api_key');
    const model = await getSetting('ai_model');
    const theme = await getSetting('theme');
    set({
      aiConfig: {
        apiUrl: apiUrl || '',
        apiKey: apiKey || '',
        model: model || '',
      },
      theme: theme === 'light' || theme === 'dark' ? theme : 'system',
      loaded: true,
    });
  },

  saveAIConfig: async (config: AIConfig) => {
    await setSetting('ai_api_url', config.apiUrl);
    await setSetting('ai_api_key', config.apiKey);
    await setSetting('ai_model', config.model);
    set({ aiConfig: config });
  },

  setThemePreference: async (preference: ThemePreference) => {
    await setSetting('theme', preference);
    set({ theme: preference });
  },
}));
