import OpenAI from 'openai';
import type { ParsedExpense, AIConfig } from '../types';
import { getSetting, getCategories } from './db';

/** 兜底分类名：数据库为空或读取失败时使用（与 seedCategories 的 10 个默认分类一致） */
const DEFAULT_CATEGORY_NAMES = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '学习', '通讯', '收入', '其他'];

/** 系统提示：要求模型只输出 JSON（兼容不支持 function calling / 强制 tool_choice 的推理模型，如 DeepSeek Thinking）。分类列表动态取自数据库 */
function buildSystemPrompt(todayStr: string, categoryNames: string[]): string {
  return `你是一个消费记账助手。从用户输入中提取消费金额、分类、描述和日期。
今天的日期是 ${todayStr}。如果用户没有指定日期，默认使用今天。
分类只能是：${categoryNames.join('、')}。
金额必须是正数。
只回复一个 JSON 对象，不要包含任何其他文字、解释或代码块标记，格式：
{"amount": 金额, "category": "分类", "description": "简短备注", "date": "YYYY-MM-DD"}`;
}

/** 从 AI 回复中提取 JSON 对象：容忍 markdown 代码块与前后说明文字 */
function extractJSON(text: string): Record<string, any> | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* 尝试提取对象块 */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* 无法解析 */ }
  }
  return null;
}

/**
 * 从本地数据库加载 AI 配置
 */
export async function loadAIConfig(): Promise<AIConfig> {
  const apiUrl = await getSetting('ai_api_url');
  const apiKey = await getSetting('ai_api_key');
  const model = await getSetting('ai_model');

  return {
    apiUrl: apiUrl || '',
    apiKey: apiKey || '',
    model: model || '',
  };
}

/**
 * 构造 OpenAI 客户端。
 * apiKey 为空时用占位符：设置页标注「API Key（可选）」，SDK 对空 key 会在构造时抛
 * 「Missing credentials」（同步抛错、不发请求），导致 AI 看似未调用。换成非空占位符后
 * 请求真正发出，需要校验 key 的服务端会返回 401，由调用方如实处理。
 */
function buildClient(cfg: AIConfig, timeout: number): OpenAI {
  return new OpenAI({
    baseURL: cfg.apiUrl,
    apiKey: cfg.apiKey || 'sk-placeholder',
    timeout,
  });
}

/**
 * 调用 AI API 解析自然语言消费输入
 */
export async function parseWithAI(input: string, config?: AIConfig): Promise<ParsedExpense> {
  const cfg = config || await loadAIConfig();

  // API 地址留空即 AI 未启用：快速失败，避免无谓等待和网络请求
  if (!cfg.apiUrl || !cfg.apiUrl.trim()) {
    throw new Error('未配置 AI 服务');
  }

  const client = buildClient(cfg, 10000);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

  // 分类列表动态取自数据库（新增/删除分类后 AI 提示词自动反映）；读取失败或为空时兜底默认 10 个
  let names: string[] = [];
  try { names = [...new Set((await getCategories()).map(c => c.name))]; } catch { names = []; }

  const response = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: 'system', content: buildSystemPrompt(todayStr, names.length ? names : DEFAULT_CATEGORY_NAMES) },
      { role: 'user', content: input },
    ],
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || '';
  const parsed = extractJSON(content);
  if (!parsed) throw new Error('AI 无法解析该输入');

  return {
    amount: parsed.amount || 0,
    category: parsed.category || '其他',
    description: parsed.description || input,
    date: parsed.date || todayStr,
  };
}

/**
 * 测试 AI 连接是否正常
 */
export async function testConnection(config: AIConfig): Promise<boolean> {
  if (!config.apiUrl || !config.apiUrl.trim()) return false;
  try {
    const client = buildClient(config, 8000);

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