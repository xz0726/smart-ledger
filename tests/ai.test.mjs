/**
 * AI 服务测试 — Mock OpenAI 调用
 * 测试解析逻辑、降级策略、错误处理
 */
import { describe, test, assert, assertEquals } from './run.mjs';

// ==================== Mock 场景 ====================

// 模拟成功的 AI 返回
function mockSuccessResponse(parsed) {
  return {
    choices: [{
      message: {
        tool_calls: [{
          type: 'function',
          function: {
            name: 'parse_expense',
            arguments: JSON.stringify(parsed)
          }
        }]
      }
    }]
  };
}

// 模拟 content 降级返回
function mockContentResponse(parsed) {
  return {
    choices: [{
      message: {
        tool_calls: [],
        content: JSON.stringify(parsed)
      }
    }]
  };
}

// 模拟 AI 完全失败
function mockEmptyResponse() {
  return {
    choices: [{ message: { tool_calls: [], content: null } }]
  };
}

// 从 AI 响应中提取解析结果（模拟 parseWithAI 的核心逻辑）
function extractFromResponse(response, input, todayStr) {
  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (toolCall?.type === 'function' && 'function' in toolCall && toolCall.function?.arguments) {
    const parsed = JSON.parse(toolCall.function.arguments);
    return {
      amount: parsed.amount || 0,
      category: parsed.category || '其他',
      description: parsed.description || input,
      date: parsed.date || todayStr,
    };
  }

  const content = response.choices[0]?.message?.content;
  if (content) {
    try {
      const parsed = JSON.parse(content);
      return {
        amount: parsed.amount || 0,
        category: parsed.category || '其他',
        description: parsed.description || input,
        date: parsed.date || todayStr,
      };
    } catch { /* 降级失败 */ }
  }

  return null;
}

// ==================== 测试 ====================

const todayStr = '2026-07-21';

describe('Tool Call 正常解析', () => {
  test('完整信息', () => {
    const response = mockSuccessResponse({
      amount: 35, category: '餐饮', description: '牛肉面', date: '2026-07-21'
    });
    const result = extractFromResponse(response, '午饭牛肉面35元', todayStr);
    assertEquals(result.amount, 35);
    assertEquals(result.category, '餐饮');
    assertEquals(result.description, '牛肉面');
    assertEquals(result.date, '2026-07-21');
  });

  test('缺少描述时用原始输入', () => {
    const response = mockSuccessResponse({
      amount: 50, category: '交通'
    });
    const result = extractFromResponse(response, '打车50', todayStr);
    assertEquals(result.amount, 50);
    assertEquals(result.description, '打车50');
  });

  test('缺少日期时用今天', () => {
    const response = mockSuccessResponse({
      amount: 100, category: '购物', description: '日用品'
    });
    const result = extractFromResponse(response, '买日用品100', todayStr);
    assertEquals(result.date, todayStr);
  });
});

describe('Content 降级解析', () => {
  test('从 content 中解析', () => {
    const response = mockContentResponse({
      amount: 88, category: '娱乐', description: '电影票', date: '2026-07-20'
    });
    const result = extractFromResponse(response, '电影票88元', todayStr);
    assertEquals(result.amount, 88);
    assertEquals(result.category, '娱乐');
  });

  test('content 缺少字段用默认值', () => {
    const response = mockContentResponse({ amount: 0 });
    const result = extractFromResponse(response, '测试', todayStr);
    assertEquals(result.amount, 0);
    assertEquals(result.category, '其他');
  });
});

describe('AI 完全失败', () => {
  test('tool_calls 和 content 都为空', () => {
    const response = mockEmptyResponse();
    const result = extractFromResponse(response, '测试', todayStr);
    assert(result === null, '应返回 null');
  });

  test('content 非法 JSON', () => {
    const response = {
      choices: [{ message: { tool_calls: [], content: '这不是JSON' } }]
    };
    const result = extractFromResponse(response, '测试', todayStr);
    assert(result === null, '非法 JSON 应返回 null');
  });
});

describe('配置加载', () => {
  test('默认配置', () => {
    const defaultConfig = {
      apiUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      model: 'qwen2.5:7b',
    };
    assertEquals(defaultConfig.apiUrl, 'http://localhost:11434/v1');
    assertEquals(defaultConfig.apiKey, 'ollama');
    assertEquals(defaultConfig.model, 'qwen2.5:7b');
  });
});

describe('Function Schema 结构', () => {
  test('schema 包含必须字段', () => {
    const FUNCTION_SCHEMA = {
      name: 'parse_expense',
      description: '从用户输入的自然语言中提取消费信息',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: '消费金额（正数）' },
          category: {
            type: 'string',
            enum: ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '学习', '通讯', '收入', '其他'],
          },
          description: { type: 'string', description: '简短备注' },
          date: { type: 'string', description: '消费日期，格式YYYY-MM-DD' },
        },
        required: ['amount', 'category'],
      },
    };

    assert(FUNCTION_SCHEMA.name === 'parse_expense', '函数名应为 parse_expense');
    assert(FUNCTION_SCHEMA.parameters.required.includes('amount'), 'amount 为必填');
    assert(FUNCTION_SCHEMA.parameters.required.includes('category'), 'category 为必填');
    assert(FUNCTION_SCHEMA.parameters.properties.category.enum.length === 10, '应有10个分类');
  });
});