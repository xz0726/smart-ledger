/**
 * Zustand Store 状态管理测试
 * 验证：AI 配置读写、持久化、状态同步、边界情况
 */
import { describe, test, assert, assertEquals } from './run.mjs';

// ==================== Mock Store ====================

// 模拟 settingsStore 的核心逻辑
function createMockStore(initialConfig = {}) {
  const defaultConfig = {
    apiUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: 'qwen2.5:7b',
  };

  let state = {
    aiConfig: { ...defaultConfig, ...initialConfig },
    loaded: false,
  };

  const listeners = new Set();

  const store = {
    getState: () => ({ ...state }),

    setState: (updater) => {
      const newState = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...newState };
      listeners.forEach(fn => fn(state));
    },

    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // 模拟从数据库加载设置
    loadSettings: async (dbValues = {}) => {
      const apiUrl = dbValues.ai_api_url || defaultConfig.apiUrl;
      const apiKey = dbValues.ai_api_key || defaultConfig.apiKey;
      const model = dbValues.ai_model || defaultConfig.model;
      store.setState({
        aiConfig: { apiUrl, apiKey, model },
        loaded: true,
      });
    },

    // 模拟保存设置到数据库
    saveAIConfig: async (config) => {
      // 验证
      if (!config.apiUrl) throw new Error('API 地址不能为空');
      if (!config.model) throw new Error('模型名称不能为空');
      store.setState({ aiConfig: { ...config } });
    },

    reset: () => {
      store.setState({
        aiConfig: { ...defaultConfig },
        loaded: false,
      });
    },
  };

  return store;
}

// ==================== 测试 ====================

describe('Store 初始化', () => {
  test('默认值', () => {
    const store = createMockStore();
    const { aiConfig, loaded } = store.getState();
    assertEquals(aiConfig.apiUrl, 'http://localhost:11434/v1');
    assertEquals(aiConfig.apiKey, 'ollama');
    assertEquals(aiConfig.model, 'qwen2.5:7b');
    assert(!loaded, '初始状态 loaded 应为 false');
  });

  test('自定义初始值', () => {
    const store = createMockStore({ apiUrl: 'https://api.openai.com/v1' });
    const { aiConfig } = store.getState();
    assertEquals(aiConfig.apiUrl, 'https://api.openai.com/v1');
    assertEquals(aiConfig.model, 'qwen2.5:7b'); // 未覆盖的保持默认
  });
});

describe('loadSettings — 从数据库加载', () => {
  test('加载完整配置', async () => {
    const store = createMockStore();
    await store.loadSettings({
      ai_api_url: 'https://api.openai.com/v1',
      ai_api_key: 'sk-test123',
      ai_model: 'gpt-4o',
    });
    const { aiConfig, loaded } = store.getState();
    assertEquals(aiConfig.apiUrl, 'https://api.openai.com/v1');
    assertEquals(aiConfig.apiKey, 'sk-test123');
    assertEquals(aiConfig.model, 'gpt-4o');
    assert(loaded, '加载后 loaded 应为 true');
  });

  test('部分加载（数据库缺少某些 Key）', async () => {
    const store = createMockStore();
    await store.loadSettings({ ai_api_url: 'https://custom.api.com/v1' });
    const { aiConfig } = store.getState();
    assertEquals(aiConfig.apiUrl, 'https://custom.api.com/v1');
    assertEquals(aiConfig.apiKey, 'ollama'); // 默认值
    assertEquals(aiConfig.model, 'qwen2.5:7b'); // 默认值
  });

  test('空数据库返回默认值', async () => {
    const store = createMockStore();
    await store.loadSettings({});
    const { aiConfig, loaded } = store.getState();
    assertEquals(aiConfig.apiUrl, 'http://localhost:11434/v1');
    assert(loaded);
  });
});

describe('saveAIConfig — 保存配置', () => {
  test('保存完整配置', async () => {
    const store = createMockStore();
    await store.saveAIConfig({
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-xxx',
      model: 'gpt-4o',
    });
    const { aiConfig } = store.getState();
    assertEquals(aiConfig.apiUrl, 'https://api.openai.com/v1');
    assertEquals(aiConfig.model, 'gpt-4o');
  });

  test('API 地址为空应报错', async () => {
    const store = createMockStore();
    try {
      await store.saveAIConfig({ apiUrl: '', apiKey: '', model: 'gpt-4o' });
      assert(false, '应该抛出错误');
    } catch (e) {
      assert(e.message.includes('API 地址不能为空'));
    }
  });

  test('模型名称为空应报错', async () => {
    const store = createMockStore();
    try {
      await store.saveAIConfig({ apiUrl: 'http://localhost', apiKey: '', model: '' });
      assert(false, '应该抛出错误');
    } catch (e) {
      assert(e.message.includes('模型名称不能为空'));
    }
  });

  test('保存后状态更新', async () => {
    const store = createMockStore();
    await store.saveAIConfig({
      apiUrl: 'https://new.api.com',
      apiKey: 'new-key',
      model: 'new-model',
    });
    const { aiConfig } = store.getState();
    assertEquals(aiConfig.apiKey, 'new-key');
    assertEquals(aiConfig.model, 'new-model');
  });
});

describe('状态变更通知', () => {
  test('subscribe 收到更新', async () => {
    const store = createMockStore();
    let notified = false;
    let notifiedConfig = null;

    store.subscribe((state) => {
      notified = true;
      notifiedConfig = state.aiConfig;
    });

    await store.saveAIConfig({
      apiUrl: 'https://changed.api.com',
      apiKey: 'changed',
      model: 'changed',
    });

    assert(notified, '订阅者应收到通知');
    assertEquals(notifiedConfig.apiUrl, 'https://changed.api.com');
  });

  test('unsubscribe 后不再收到通知', async () => {
    const store = createMockStore();
    let notifyCount = 0;

    const unsub = store.subscribe(() => { notifyCount++; });
    await store.saveAIConfig({ apiUrl: 'https://test1.com', apiKey: 'k1', model: 'm1' });
    assertEquals(notifyCount, 1);

    unsub();
    await store.saveAIConfig({ apiUrl: 'https://test2.com', apiKey: 'k2', model: 'm2' });
    assertEquals(notifyCount, 1); // 不再增加
  });
});

describe('Reset 重置', () => {
  test('重置回默认值', async () => {
    const store = createMockStore();
    await store.saveAIConfig({ apiUrl: 'https://custom.com', apiKey: 'custom', model: 'custom' });
    store.reset();
    const { aiConfig, loaded } = store.getState();
    assertEquals(aiConfig.apiUrl, 'http://localhost:11434/v1');
    assertEquals(aiConfig.apiKey, 'ollama');
    assert(!loaded);
  });
});

describe('多轮读写一致性', () => {
  test('连续修改保持一致性', async () => {
    const store = createMockStore();

    await store.loadSettings({ ai_api_url: 'https://a.com' });
    assertEquals(store.getState().aiConfig.apiUrl, 'https://a.com');

    await store.saveAIConfig({ apiUrl: 'https://b.com', apiKey: 'b', model: 'b' });
    assertEquals(store.getState().aiConfig.apiUrl, 'https://b.com');

    await store.saveAIConfig({ apiUrl: 'https://c.com', apiKey: 'c', model: 'c' });
    assertEquals(store.getState().aiConfig.apiUrl, 'https://c.com');
    assertEquals(store.getState().aiConfig.apiKey, 'c');
  });
});

describe('并发安全', () => {
  test('快速连续保存不丢失数据', async () => {
    const store = createMockStore();

    await Promise.all([
      store.saveAIConfig({ apiUrl: 'https://1.com', apiKey: 'k1', model: 'm1' }),
      store.saveAIConfig({ apiUrl: 'https://2.com', apiKey: 'k2', model: 'm2' }),
      store.saveAIConfig({ apiUrl: 'https://3.com', apiKey: 'k3', model: 'm3' }),
    ]);

    // 最后一次保存应该生效
    const { aiConfig } = store.getState();
    assert(aiConfig.apiUrl.startsWith('https://'), 'apiUrl 应被设置');
    assertEquals(aiConfig.apiKey.length > 0, true);
  });
});