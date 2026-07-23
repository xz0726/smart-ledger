import { create } from 'zustand';
import type { AIConfig } from '../types';
import { getSetting, setSetting } from '../services/db';

interface SettingsState {
  aiConfig: AIConfig;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  saveAIConfig: (config: AIConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  aiConfig: {
    apiUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: 'qwen2.5:7b',
  },
  loaded: false,

  loadSettings: async () => {
    const apiUrl = await getSetting('ai_api_url');
    const apiKey = await getSetting('ai_api_key');
    const model = await getSetting('ai_model');
    set({
      aiConfig: {
        apiUrl: apiUrl || 'http://localhost:11434/v1',
        apiKey: apiKey || 'ollama',
        model: model || 'qwen2.5:7b',
      },
      loaded: true,
    });
  },

  saveAIConfig: async (config: AIConfig) => {
    await setSetting('ai_api_url', config.apiUrl);
    await setSetting('ai_api_key', config.apiKey);
    await setSetting('ai_model', config.model);
    set({ aiConfig: config });
  },
}));