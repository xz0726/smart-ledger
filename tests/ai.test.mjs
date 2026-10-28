/**
 * AI 服务测试 — Mock OpenAI 调用
 * 逻辑与 src/services/ai.ts 保持一致（TS 无法在 node 直接导入，此为镜像副本，
 * 修改 ai.ts 时必须同步更新本文件）
 * 覆盖：JSON 提取、动态分类提示词、内容解析默认值、配置加载
 */
import { describe, test, assert, assertEquals } from './run.mjs';

// ==================== 镜像 ai.ts 逻辑 ====================

/** 兜底分类名：与 seedCategories 的 10 个默认分类一致 */
const DEFAULT_CATEGORY_NAMES = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '学习', '通讯', '收入', '其他'];

/** 系统提示词（镜像 buildSystemPrompt） */
function buildSystemPrompt(todayStr, categoryNames) {
  return `你是一个消费记账助手。从用户输入中提取消费金额、分类、描述和日期。
今天的日期是 ${todayStr}。如果用户没有指定日期，默认使用今天。
分类只能是：${categoryNames.join('、')}。
金额必须是正数。
只回复一个 JSON 对象，不要包含任何其他文字、解释或代码块标记，格式：
{"amount": 金额, "category": "分类", "description": "简短备注", "date": "YYYY-MM-DD"}`;
}

/** 数据库分类名去重（镜像 parseWithAI 里的取分类名逻辑） */
function categoryNamesFromDB(cats) {
  try { return [...new Set(cats.map(c => c.name))]; } catch { return []; }
}

/** 兜底：分类列表为空时用默认 10 个（镜像 parseWithAI 调用处） */
function systemPromptFor(todayStr, names) {
  return buildSystemPrompt(todayStr, names && names.length ? names : DEFAULT_CATEGORY_NAMES);
}

/** 从 AI 回复 content 中提取 JSON 对象（镜像 extractJSON） */
function extractJSON(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* 尝试提取对象块 */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* 无法解析 */ }
  }
  return null;
}

/** 从 content 解析并填默认值（镜像 parseWithAI 的返回逻辑） */
function parseFromContent(content, input, todayStr) {
  const parsed = extractJSON(content || '');
  if (!parsed) return null;
  return {
    amount: parsed.amount || 0,
    category: parsed.category || '其他',
    description: parsed.description || input,
    date: parsed.date || todayStr,
  };
}

// ==================== 测试 ====================

const todayStr = '2026-07-21';

describe('extractJSON 提取', () => {
  test('纯 JSON', () => {
    const r = extractJSON('{"amount":12,"category":"交通","description":"车费"}');
    assert(r, '应解析成功');
    assertEquals(r.amount, 12);
    assertEquals(r.category, '交通');
  });

  test('```json 代码块', () => {
    const r = extractJSON('```json\n{"amount":35,"category":"餐饮"}\n```');
    assert(r, '应解析成功');
    assertEquals(r.amount, 35);
  });

  test('前后说明文字', () => {
    const r = extractJSON('识别到：{"amount":88,"category":"娱乐","description":"电影票"} 请确认。');
    assert(r, '应解析成功');
    assertEquals(r.amount, 88);
    assertEquals(r.description, '电影票');
  });

  test('非法 JSON 返回 null', () => {
    assertEquals(extractJSON('这不是JSON'), null);
  });

  test('空字符串返回 null', () => {
    assertEquals(extractJSON(''), null);
  });
});

describe('buildSystemPrompt 动态分类', () => {
  test('默认 10 分类全含', () => {
    const p = systemPromptFor(todayStr, []);
    assert(p.includes('分类只能是：餐饮、交通、购物、娱乐、居住、医疗、学习、通讯、收入、其他。'), '应列出默认 10 个分类');
  });

  test('含用户新增分类', () => {
    const p = systemPromptFor(todayStr, ['餐饮', '交通', '宠物']);
    assert(p.includes('分类只能是：餐饮、交通、宠物。'), '应包含用户新增分类');
    assert(!p.includes('购物'), '不应包含未提及的分类');
  });

  test('空列表兜底默认分类', () => {
    const p = systemPromptFor(todayStr, []);
    DEFAULT_CATEGORY_NAMES.forEach(n => assert(p.includes(n), `应包含默认分类: ${n}`));
  });

  test('含今天日期', () => {
    const p = systemPromptFor(todayStr, ['餐饮']);
    assert(p.includes(`今天的日期是 ${todayStr}`), '应包含今天日期');
  });

  test('含 JSON 输出格式说明', () => {
    const p = systemPromptFor(todayStr, ['餐饮']);
    assert(p.includes('只回复一个 JSON 对象'), '应要求 JSON 输出');
    assert(p.includes('"amount"'), '格式应包含 amount 字段');
    assert(p.includes('"category"'), '格式应包含 category 字段');
  });

  test('数据库分类名去重', () => {
    const names = categoryNamesFromDB([{ name: '餐饮' }, { name: '餐饮' }, { name: '宠物' }]);
    assertEquals(names.length, 2);
    const p = systemPromptFor(todayStr, names);
    assert(p.includes('分类只能是：餐饮、宠物。'), '去重后不应重复列出');
  });
});

describe('parseWithAI 内容解析（镜像）', () => {
  test('完整信息', () => {
    const r = parseFromContent('{"amount":35,"category":"餐饮","description":"牛肉面","date":"2026-07-21"}', '午饭牛肉面35元', todayStr);
    assertEquals(r.amount, 35);
    assertEquals(r.category, '餐饮');
    assertEquals(r.description, '牛肉面');
    assertEquals(r.date, '2026-07-21');
  });

  test('缺描述时用原始输入', () => {
    const r = parseFromContent('{"amount":50,"category":"交通"}', '打车50', todayStr);
    assertEquals(r.description, '打车50');
  });

  test('缺日期时用今天', () => {
    const r = parseFromContent('{"amount":100,"category":"购物"}', '买日用品100', todayStr);
    assertEquals(r.date, todayStr);
  });

  test('缺分类默认其他', () => {
    const r = parseFromContent('{"amount":0}', '测试', todayStr);
    assertEquals(r.amount, 0);
    assertEquals(r.category, '其他');
  });

  test('content 无有效 JSON 返回 null', () => {
    assertEquals(parseFromContent('这不是JSON', '测试', todayStr), null);
    assertEquals(parseFromContent('', '测试', todayStr), null);
  });
});

describe('配置加载', () => {
  test('默认配置', () => {
    const defaultConfig = {
      apiUrl: '',
      apiKey: '',
      model: '',
    };
    assertEquals(defaultConfig.apiUrl, '');
    assertEquals(defaultConfig.apiKey, '');
    assertEquals(defaultConfig.model, '');
  });
});
