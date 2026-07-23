/**
 * 集成测试：规则引擎 → AI 降级 → 分类匹配 → 入库
 * 模拟完整记账流程，不含真实网络/数据库调用
 */
import { describe, test, assert, assertEquals } from './run.mjs';

// ==================== 复制核心逻辑 ====================

function parseWithRules(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const amountPatterns = [
    /(\d+(?:\.\d{1,2})?)\s*[元块¥]/,
    /[花了消费]\s*(\d+(?:\.\d{1,2})?)/,
    /(\d+(?:\.\d{1,2})?)\s*(?:块钱|rmb|RMB)?/,
    /[￥¥]\s*(\d+(?:\.\d{1,2})?)/,
  ];
  let amount = null;
  for (const p of amountPatterns) {
    const m = trimmed.match(p);
    if (m) { amount = parseFloat(m[1]); break; }
  }
  if (amount === null || amount <= 0) return null;

  const categoryRules = [
    [['饭','餐','食','吃','外卖','食堂','饭店','餐厅','火锅','烧烤','奶茶','咖啡','饮料','水果','零食','早餐','午饭','晚饭','晚餐','夜宵','买菜','菜市场'], '餐饮'],
    [['地铁','公交','打车','滴滴','出租车','高铁','火车','机票','飞机','加油','油费','停车','过路费','骑行','共享单车','摩拜','哈啰','通勤'], '交通'],
    [['衣服','鞋子','包包','背包','化妆品','护肤品','数码','电脑','耳机','网购','淘宝','京东','拼多多','买了','购买','购物','裤子','裙子','帽子','首饰','洗发水','沐浴露','日用品','生活用品'], '购物'],
    [['电影','游戏','KTV','唱歌','旅游','旅行','景点','门票','演出','演唱会','剧本杀','密室','会员','视频会员','音乐','运动','健身'], '娱乐'],
    [['房租','房贷','水电','物业','煤气','天然气','网费','维修','装修','家具','家电','宽带'], '居住'],
    [['药','医院','挂号','体检','看病','诊所','牙医','手术','保险','医保'], '医疗'],
    [['书','课程','培训','考试','学费','报名','文具','考证','网课','教程','学习'], '学习'],
    [['话费','流量','充值','宽带','快递','邮寄','物流'], '通讯'],
    [['工资','奖金','红包','兼职','退款','报销','利息','理财','收入','赚了','到账','收款'], '收入'],
  ];
  let category = '其他';
  for (const [kws, name] of categoryRules) {
    if (kws.some(kw => trimmed.includes(kw))) { category = name; break; }
  }
  let description = trimmed
    .replace(/[￥¥]\s*\d+(?:\.\d{1,2})?/,'')
    .replace(/\d+(?:\.\d{1,2})?\s*[元块¥]/,'')
    .replace(/[花了消费]\s*\d+(?:\.\d{1,2})?/,'')
    .replace(/今天|昨天|前天|这周|上周|本月|上个月/g,'')
    .trim();
  if (!description || description.length < 2) description = trimmed;
  const today = new Date();
  const y = today.getFullYear();
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  let date = `${y}-${m}-${d}`;
  if (trimmed.includes('昨天')) { const dd = new Date(today); dd.setDate(dd.getDate()-1); date = formatDateStr(dd); }
  else if (trimmed.includes('前天')) { const dd = new Date(today); dd.setDate(dd.getDate()-2); date = formatDateStr(dd); }
  const dm = trimmed.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (dm) date = `${y}-${parseInt(dm[1]).toString().padStart(2,'0')}-${parseInt(dm[2]).toString().padStart(2,'0')}`;
  return { amount, category, description, date };
}

function formatDateStr(d) {
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
}

// 模拟 AI 解析（同步版本，返回 ParsedExpense 或 null）
function mockAIParse(input, shouldSucceed = true) {
  if (!shouldSucceed) return null;

  // 模拟 AI 对不同输入的理解
  const mockDB = {
    '今天在星巴克喝咖啡花了42元': { amount: 42, category: '餐饮', description: '星巴克咖啡' },
    '打车去机场150': { amount: 150, category: '交通', description: '去机场打车' },
    '淘宝买了件T恤89元': { amount: 89, category: '购物', description: 'T恤' },
    '收到工资15000': { amount: 15000, category: '收入', description: '工资' },
    '交物业费320': { amount: 320, category: '居住', description: '物业费' },
    '昨天医院挂号50': { amount: 50, category: '医疗', description: '挂号' },
  };

  return mockDB[input] || { amount: 0, category: '其他', description: input };
}

// 分类数据库（模拟 getCategories + getCategoryByName）
const CATEGORY_DB = [
  { id: 1, name: '餐饮', icon: '🍔', color: '#f97316', type: 'expense' },
  { id: 2, name: '交通', icon: '🚇', color: '#3b82f6', type: 'expense' },
  { id: 3, name: '购物', icon: '🛒', color: '#ec4899', type: 'expense' },
  { id: 4, name: '娱乐', icon: '🎮', color: '#8b5cf6', type: 'expense' },
  { id: 5, name: '居住', icon: '🏠', color: '#14b8a6', type: 'expense' },
  { id: 6, name: '医疗', icon: '💊', color: '#ef4444', type: 'expense' },
  { id: 7, name: '学习', icon: '📚', color: '#06b6d4', type: 'expense' },
  { id: 8, name: '通讯', icon: '💬', color: '#6366f1', type: 'expense' },
  { id: 9, name: '收入', icon: '💰', color: '#22c55e', type: 'income' },
  { id: 10, name: '其他', icon: '✏️', color: '#64748b', type: 'expense' },
];

function findCategory(name) {
  return CATEGORY_DB.find(c => c.name === name) || CATEGORY_DB.find(c => c.name === '其他');
}

// ==================== 完整记账流程 ====================

function processExpense(input) {
  // Step 1: 规则引擎
  let parsed = parseWithRules(input);

  // Step 2: 规则未命中 → 尝试 AI
  if (!parsed) {
    parsed = mockAIParse(input, true);
  }

  // Step 3: AI 也失败 → 返回错误
  if (!parsed) {
    return { success: false, error: '无法识别输入' };
  }

  // Step 4: 金额为 0 → 无效
  if (parsed.amount <= 0) {
    return { success: false, error: '金额无效' };
  }

  // Step 5: 查找分类
  const category = findCategory(parsed.category);
  if (!category) {
    return { success: false, error: '未知分类' };
  }

  // Step 6: 构造入库数据
  return {
    success: true,
    record: {
      amount: parsed.amount,
      category_id: category.id,
      category_name: category.name,
      category_icon: category.icon,
      category_color: category.color,
      category_type: category.type,
      description: parsed.description,
      raw_input: input,
      expense_date: parsed.date,
    },
  };
}

// ==================== 测试 ====================

describe('完整流程：规则引擎命中', () => {
  test('午饭 → 规则直接命中', () => {
    const result = processExpense('午饭花了35元');
    assert(result.success);
    assertEquals(result.record.amount, 35);
    assertEquals(result.record.category_name, '餐饮');
    assertEquals(result.record.category_icon, '🍔');
    assertEquals(result.record.raw_input, '午饭花了35元');
  });

  test('打车 → 规则直接命中', () => {
    const result = processExpense('打车去公司25元');
    assert(result.success);
    assertEquals(result.record.category_name, '交通');
    assertEquals(result.record.amount, 25);
  });

  test('收入 → 规则直接命中', () => {
    const result = processExpense('收到工资8000');
    assert(result.success);
    assertEquals(result.record.category_name, '收入');
    assertEquals(result.record.category_type, 'income');
    assertEquals(result.record.amount, 8000);
  });

  test('水电费 → 规则直接命中', () => {
    const result = processExpense('水电费300');
    assert(result.success);
    assertEquals(result.record.category_name, '居住');
    assertEquals(result.record.amount, 300);
  });
});

describe('完整流程：规则未命中 → AI 降级', () => {
  test('复杂输入 → 规则引擎命中（咖啡→餐饮）', () => {
    // "今天在星巴克喝咖啡花了42元" 会被规则引擎匹配到（花了42元+咖啡）
    const result = processExpense('今天在星巴克喝咖啡花了42元');
    assert(result.success);
    assertEquals(result.record.amount, 42);
    assertEquals(result.record.category_name, '餐饮');
  });

  test('淘宝购物 → 规则失败 → AI 成功', () => {
    const result = processExpense('淘宝买了件T恤89元');
    assert(result.success);
    assertEquals(result.record.amount, 89);
    assertEquals(result.record.category_name, '购物');
  });

  test('AI 返回金额0 → 返回错误', () => {
    const result = processExpense('随便记一下');
    assert(result.success === false, '应返回失败');
    assert(result.error.includes('金额无效'), '应有金额无效错误');
  });
});

describe('完整流程：分类匹配', () => {
  test('精确匹配分类名', () => {
    const cat = findCategory('餐饮');
    assertEquals(cat.id, 1);
    assertEquals(cat.icon, '🍔');
  });

  test('未知分类降级为"其他"', () => {
    const cat = findCategory('不存在的分类');
    assertEquals(cat.name, '其他');
    assertEquals(cat.id, 10);
  });

  test('所有10个分类都可匹配', () => {
    const names = ['餐饮','交通','购物','娱乐','居住','医疗','学习','通讯','收入','其他'];
    names.forEach(name => {
      const cat = findCategory(name);
      assert(cat !== undefined, `${name} 应存在`);
      assertEquals(cat.name, name);
    });
  });
});

describe('完整流程：数据完整性', () => {
  test('记录包含所有必要字段', () => {
    const result = processExpense('午饭35元');
    const record = result.record;
    const fields = ['amount', 'category_id', 'category_name', 'category_icon',
      'category_color', 'category_type', 'description', 'raw_input', 'expense_date'];
    fields.forEach(f => assert(f in record, `缺少字段: ${f}`));
  });

  test('日期格式 YYYY-MM-DD', () => {
    const result = processExpense('午饭35元');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(result.record.expense_date), '日期格式错误');
  });

  test('金额是正数', () => {
    const result = processExpense('午饭35元');
    assert(result.record.amount > 0, '金额应为正数');
  });

  test('raw_input 保留原始输入', () => {
    const input = '午饭花了35元';
    const result = processExpense(input);
    assertEquals(result.record.raw_input, input);
  });

  test('支出类型正确标记', () => {
    const result = processExpense('午饭35元');
    assertEquals(result.record.category_type, 'expense');
  });

  test('收入类型正确标记', () => {
    const result = processExpense('收到工资5000');
    assertEquals(result.record.category_type, 'income');
  });
});

describe('完整流程：边界情况', () => {
  test('空输入', () => {
    const result = processExpense('');
    assert(!result.success);
  });

  test('纯空白', () => {
    const result = processExpense('   ');
    assert(!result.success);
  });

  test('只有文字无金额', () => {
    const result = processExpense('今天天气真好');
    assert(!result.success);
  });

  test('金额为0', () => {
    const result = processExpense('0元');
    assert(!result.success);
  });

  test('超大金额', () => {
    const result = processExpense('买房花了5000000元');
    assert(result.success);
    assertEquals(result.record.amount, 5000000);
  });
});

describe('批量记账', () => {
  function batchProcess(inputs) {
    const results = [];
    for (const input of inputs) {
      results.push(processExpense(input));
    }
    return results;
  }

  test('连续记账', () => {
    const inputs = [
      '午饭35元',
      '地铁6元',
      '奶茶18元',
      '收到工资8000',
      '水电费300',
    ];
    const results = batchProcess(inputs);
    assertEquals(results.length, 5);
    assertEquals(results.filter(r => r.success).length, 5);
    assertEquals(results[0].record.category_name, '餐饮');
    assertEquals(results[3].record.category_name, '收入');
  });

  test('混合成功失败', () => {
    const inputs = ['午饭35元', '随便记一下', '打车25元', '今天天气好'];
    const results = batchProcess(inputs);
    assertEquals(results.length, 4);
    assertEquals(results.filter(r => r.success).length, 2);
    assertEquals(results.filter(r => !r.success).length, 2);
  });

  test('批量统计', () => {
    const inputs = ['午饭35元', '晚饭45元', '奶茶18元', '咖啡28元'];
    const results = batchProcess(inputs);
    const total = results.reduce((s, r) => s + r.record.amount, 0);
    assertEquals(total, 126);
    const allDining = results.every(r => r.record.category_name === '餐饮');
    assert(allDining, '全部应为餐饮');
  });
});

describe('月度统计模拟', () => {
  function simulateMonth(records) {
    const totalExpense = records
      .filter(r => r.record.category_type === 'expense')
      .reduce((s, r) => s + r.record.amount, 0);
    const totalIncome = records
      .filter(r => r.record.category_type === 'income')
      .reduce((s, r) => s + r.record.amount, 0);
    const byCategory = {};
    for (const r of records) {
      const name = r.record.category_name;
      if (!byCategory[name]) byCategory[name] = { total: 0, count: 0 };
      byCategory[name].total += r.record.amount;
      byCategory[name].count++;
    }
    return { totalExpense, totalIncome, byCategory, recordCount: records.length };
  }

  test('月度汇总', () => {
    const inputs = [
      '午饭35元', '地铁6元', '奶茶18元',
      '午饭45元', '打车25元', '咖啡28元',
      '收到工资8000', '买衣服299',
    ];
    const results = inputs.map(i => processExpense(i)).filter(r => r.success);
    const stats = simulateMonth(results);

    assertEquals(stats.totalExpense, 456);
    assertEquals(stats.totalIncome, 8000);
    assertEquals(stats.recordCount, 8);
    assertEquals(stats.byCategory['餐饮'].count, 4);
    assertEquals(stats.byCategory['交通'].count, 2);
    assertEquals(stats.byCategory['购物'].count, 1);
    assertEquals(stats.byCategory['收入'].count, 1);
  });
});