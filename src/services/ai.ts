import OpenAI from 'openai';
import type { ParsedExpense, AIConfig } from '../types';
import { getSetting } from './db';

const FUNCTION_SCHEMA = {
  name: 'parse_expense',
  description: '从用户输入的自然语言中提取消费信息',
  parameters: {
    type: 'object' as const,
    properties: {
      amount: {
        type: 'number',
        description: '消费金额（正数），如果是收入则为正数',
      },
      category: {
        type: 'string',
        enum: ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '学习', '通讯', '收入', '其他'],
        description: '消费分类',
      },
      description: {
        type: 'string',
        description: '简短备注，提取关键物品或事件',
      },
      date: {
        type: 'string',
        description: '消费日期，格式YYYY-MM-DD，默认今天',
      },
    },
    required: ['amount', 'category'],
  },
};

/**
 * 从本地数据库加载 AI 配置
 */
export async function loadAIConfig(): Promise<AIConfig> {
  const apiUrl = await getSetting('ai_api_url');
  const apiKey = await getSetting('ai_api_key');
  const model = await getSetting('ai_model');

  return {
    apiUrl: apiUrl || 'http://localhost:11434/v1',
    apiKey: apiKey || 'ollama',
    model: model || 'qwen2.5:7b',
  };
}

/**
 * 调用 AI API 解析自然语言消费输入
 */
export async function parseWithAI(input: string, config?: AIConfig): Promise<ParsedExpense> {
  const cfg = config || await loadAIConfig();

  const client = new OpenAI({
    baseURL: cfg.apiUrl,
    apiKey: cfg.apiKey || 'ollama',
    timeout: 10000,
  });

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

  const response = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      {
        role: 'system',
        content: `你是一个消费记账助手。从用户输入中提取消费金额、分类、描述和日期。
今天的日期是 ${todayStr}。如果用户没有指定日期，默认使用今天。
分类只能是：餐饮、交通、购物、娱乐、居住、医疗、学习、通讯、收入、其他。
金额必须是正数。`,
      },
      {
        role: 'user',
        content: input,
      },
    ],
    tools: [
      {
        type: 'function',
        function: FUNCTION_SCHEMA,
      },
    ],
    tool_choice: { type: 'function', function: { name: 'parse_expense' } },
    temperature: 0.1,
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (toolCall && toolCall.type === 'function' && 'function' in toolCall && toolCall.function?.arguments) {
    const parsed = JSON.parse(toolCall.function.arguments) as ParsedExpense;
    return {
      amount: parsed.amount || 0,
      category: parsed.category || '其他',
      description: parsed.description || input,
      date: parsed.date || todayStr,
    };
  }

  // 降级：尝试从 content 中解析
  const content = response.choices[0]?.message?.content;
  if (content) {
    try {
      const parsed = JSON.parse(content) as ParsedExpense;
      return {
        amount: parsed.amount || 0,
        category: parsed.category || '其他',
        description: parsed.description || input,
        date: parsed.date || todayStr,
      };
    } catch {
      // 无法解析
    }
  }

  throw new Error('AI 无法解析该输入');
}

/**
 * 测试 AI 连接是否正常
 */
export async function testConnection(config: AIConfig): Promise<boolean> {
  try {
    const client = new OpenAI({
      baseURL: config.apiUrl,
      apiKey: config.apiKey || 'ollama',
      timeout: 8000,
    });

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
      max_tokens: 50,
    });

    return !!response.choices[0]?.message?.content;
  } catch {
    return false;
  }
}