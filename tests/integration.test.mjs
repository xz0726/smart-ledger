/**
 * 集成测试：规则引擎 → AI 降级 → 分类匹配 → 入库
 * 模拟完整记账流程（含多项切分），不含真实网络/数据库调用
 * 逻辑与 src/services/ruleEngine.ts 保持一致（镜像副本，改动需同步）
 */
import { describe, test, assert, assertEquals } from './run.mjs';

// ==================== 复制核心逻辑（与 ruleEngine.ts 同步） ====================

const CN_DIGITS = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const CN_SMALL_UNITS = { '十': 10, '百': 100, '千': 1000 };
const CN_BIG_UNITS = { '万': 10000, '亿': 100000000 };

function cnToNum(s) {
  let total = 0, section = 0, digit = 0, lastUnit = 0;
  for (const ch of s) {
    if (ch in CN_DIGITS) digit = CN_DIGITS[ch];
    else if (ch in CN_SMALL_UNITS) { section += (digit === 0 ? 1 : digit) * CN_SMALL_UNITS[ch]; digit = 0; lastUnit = CN_SMALL_UNITS[ch]; }
    else if (ch in CN_BIG_UNITS) { section += digit; total += (section === 0 ? 1 : section) * CN_BIG_UNITS[ch]; section = 0; digit = 0; lastUnit = CN_BIG_UNITS[ch]; }
    else return NaN;
  }
  let result = total + section + digit;
  if (digit > 0 && lastUnit >= 100 && s.length >= 2 && s[s.length - 2] !== '零') {
    result = total + section + digit * (lastUnit / 10);
  }
  return result;
}

const CN_CHARS = '[零〇一两二三四五六七八九十百千万亿]';
const CN_SINGLE = '[零〇一二三四五六七八九]';

const SCAN_RE = new RegExp([
  `(\\d{1,2}月\\d{1,2}[日号])`,                          // 1 date
  `(\\d+\\s*块\\s*\\d{1,2})`,                            // 2 decArb
  `(\\d+(?:\\.\\d{1,2})?\\s*[元块¥])`,                   // 3 arbUnit
  `((?:花了|消费了|消费|用了|用|花)\\s*\\d+(?:\\.\\d{1,2})?)`, // 4 verbArb
  `([￥¥]\\s*\\d+(?:\\.\\d{1,2})?)`,                     // 5 curArb
  `(\\d+(?:\\.\\d{1,2})?\\s*(?:块钱|rmb|RMB)?)`,         // 6 bareArb
  `(${CN_CHARS}+\\s*块\\s*${CN_SINGLE})`,                // 7 decCn
  `(${CN_CHARS}+\\s*点\\s*${CN_SINGLE})`,                // 8 decCnPoint
  `(${CN_CHARS}+\\s*[元块¥])`,                           // 9 cnUnit
  `((?:花了|消费了|消费|用了|用|花)\\s*${CN_CHARS}+)`,   // 10 verbCn
  `(${CN_CHARS}{2,})`,                                   // 11 bareCn
].join('|'), 'g');

const AMOUNT_RE = new RegExp([
  `\\d+\\s*块\\s*\\d{1,2}`,
  `\\d+(?:\\.\\d{1,2})?\\s*[元块¥]`,
  `(?:花了|消费了|消费|用了|用|花)\\s*\\d+(?:\\.\\d{1,2})?`,
  `[￥¥]\\s*\\d+(?:\\.\\d{1,2})?`,
  `\\d+(?:\\.\\d{1,2})?\\s*(?:块钱|rmb|RMB)?`,
  `${CN_CHARS}+\\s*块\\s*${CN_SINGLE}`,
  `${CN_CHARS}+\\s*点\\s*${CN_SINGLE}`,
  `${CN_CHARS}+\\s*[元块¥]`,
  `(?:花了|消费了|消费|用了|用|花)\\s*${CN_CHARS}+`,
  `${CN_CHARS}{2,}`,
].join('|'), 'g');

const MEASURE_WORDS = new Set([
  '个', '本', '件', '台', '只', '次', '张', '份', '杯', '盒', '双', '支', '瓶', '袋', '套', '餐', '颗', '场', '辆', '顶',
  '部', '页', '条', '位', '名', '道', '门', '节', '点', '分', '秒', '月', '日', '号',
]);

function isMeasureWord(input, index) {
  if (index >= input.length) return false;
  return MEASURE_WORDS.has(input[index]);
}

function numOf(text) {
  const m = /\d+(?:\.\d{1,2})?/.exec(text);
  return m ? parseFloat(m[0]) : 0;
}

function scanAmounts(input) {
  const tokens = [];
  SCAN_RE.lastIndex = 0; // 复用全局正则，先重置
  let m;
  while ((m = SCAN_RE.exec(input)) !== null) {
    const idx = m.index;
    const end = idx + m[0].length;
    // 命中第 k 个备选 = 第 k 个捕获组有值（exec 已自动推进 lastIndex）
    let branch = 0;
    for (let k = 1; k <= 11; k++) {
      if (m[k] !== undefined) { branch = k; break; }
    }
    let amount = null;

    if (branch === 1) {
      // date —— 不是金额，跳过
    } else if (branch === 2) { // decArb：3块5 → 3.5
      const parts = /(\d+)\s*块\s*(\d{1,2})/.exec(m[0]);
      const n2 = parts[2].length === 1 ? parseFloat(parts[2]) / 10 : parseFloat(parts[2]) / 100;
      amount = parseFloat(parts[1]) + n2;
    } else if (branch === 3) { // arbUnit
      amount = numOf(m[0]);
    } else if (branch === 4) { // verbArb
      amount = numOf(m[0]);
    } else if (branch === 5) { // curArb
      amount = numOf(m[0]);
    } else if (branch === 6) { // bareArb
      if (isMeasureWord(input, end)) continue;
      amount = numOf(m[0]);
    } else if (branch === 7) { // decCn：三块五 → 3.5
      const parts = m[0].split('块');
      amount = cnToNum(parts[0]) + cnToNum(parts[1]) / 10;
    } else if (branch === 8) { // decCnPoint：三点五 → 3.5
      const parts = m[0].split('点');
      amount = cnToNum(parts[0]) + cnToNum(parts[1]) / 10;
    } else if (branch === 9) { // cnUnit
      amount = cnToNum(m[0].replace(/[元块¥]$/, ''));
    } else if (branch === 10) { // verbCn
      const mm = new RegExp(`(?:花了|消费了|消费|用了|用|花)\\s*(${CN_CHARS}+)`).exec(m[0]);
      amount = mm ? cnToNum(mm[1]) : NaN;
    } else if (branch === 11) { // bareCn
      if (isMeasureWord(input, end)) continue;
      amount = cnToNum(m[0]);
    }

    if (amount === null || !isFinite(amount) || amount <= 0) continue;
    tokens.push({ start: idx, end, amount });
    if (m[0].length === 0) SCAN_RE.lastIndex = end + 1; // 零宽防御（当前分支均非零宽）
  }
  return tokens;
}

const categoryRules = [
  [['饭', '餐', '食', '吃', '外卖', '食堂', '饭店', '餐厅', '火锅', '烧烤', '奶茶', '咖啡', '饮料', '水果', '零食', '早餐', '午饭', '晚饭', '晚餐', '夜宵', '买菜', '超市', '菜市场', '米线', '面条', '饺子', '包子', '汉堡', '披萨', '快餐', '甜品', '蛋糕', '面包', '美团', '饿了么', '便利店'], '餐饮'],
  [['地铁', '公交', '打车', '滴滴', '出租车', '高铁', '火车', '机票', '飞机', '加油', '油费', '停车', '过路费', '骑行', '共享单车', '摩拜', '哈啰', '通勤', '车费', '车票', '路费', '打的', '的士', '网约车', '顺风车', '高速费', '公交卡', '地铁卡', '乘车', '坐车', '大巴', '客车', '自行车', '电动车', '洗车', '修车'], '交通'],
  [['衣服', '鞋子', '包包', '背包', '化妆品', '护肤品', '数码', '电脑', '耳机', '网购', '淘宝', '京东', '拼多多', '买了', '购买', '购物', '裤子', '裙子', '帽子', '首饰', '洗发水', '沐浴露', '日用品', '生活用品', '袜子', '内衣', '箱包', '手表', '眼镜', '香水', '面膜', '美妆', '彩妆', '纸巾', '洗衣液', '牙膏', '牙刷', '毛巾'], '购物'],
  [['电影', '游戏', 'KTV', '唱歌', '旅游', '旅行', '景点', '门票', '演出', '演唱会', '剧本杀', '密室', '会员', '视频会员', '音乐', '运动', '健身', '台球', '羽毛球', '篮球', '足球', '游泳', '滑雪', '露营', '游乐园', '迪士尼', '音乐节', '话剧', '脱口秀', '桌游', '钓鱼'], '娱乐'],
  [['房租', '房贷', '水电', '物业', '煤气', '天然气', '网费', '宽带', '维修', '装修', '家具', '家电', '水费', '电费', '燃气', '取暖', '暖气', '家政', '保洁'], '居住'],
  [['药', '医院', '挂号', '体检', '看病', '诊所', '牙医', '手术', '保险', '医保', '药店', '住院', '疫苗', '打针', '输液', '复诊', '理疗'], '医疗'],
  [['书', '课程', '培训', '考试', '学费', '报名', '文具', '考证', '网课', '教程', '学习', '图书', '书店', '教材', '教辅', '打印', '复印', '考试费', '报名费'], '学习'],
  [['话费', '流量', '充值', '宽带', '快递', '邮寄', '物流', '电话费', '手机费', '流量包'], '通讯'],
  [['工资', '奖金', '红包', '兼职', '退款', '报销', '利息', '理财', '收入', '赚了', '到账', '收款', '薪水', '薪酬', '打赏', '稿费', '返现', '补贴', '补助', '津贴', '分红', '中奖', '进账', '转入'], '收入'],
];

function extractDate(segment) {
  const today = new Date();
  if (segment.includes('昨天')) {
    const d = new Date(today); d.setDate(d.getDate() - 1); return formatDateStr(d);
  } else if (segment.includes('前天')) {
    const d = new Date(today); d.setDate(d.getDate() - 2); return formatDateStr(d);
  }
  const dm = segment.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (dm) {
    const month = parseInt(dm[1]).toString().padStart(2, '0');
    const day = parseInt(dm[2]).toString().padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  }
  return formatDateStr(today);
}

function parseSegment(segment, amount, customRules) {
  let category = '其他';
  let matched = false;
  if (customRules && customRules.length > 0) {
    const hit = customRules.find(r => segment.includes(r.keyword));
    if (hit) { category = hit.category; matched = true; }
  }
  if (!matched) {
    for (const [keywords, catName] of categoryRules) {
      if (keywords.some(kw => segment.includes(kw))) { category = catName; break; }
    }
  }
  let description = segment
    .replace(AMOUNT_RE, '')
    .replace(/今天|昨天|前天|这周|上周|本月|上个月/g, '')
    .replace(/[元块]\s*$/, '')
    .trim();
  if (!description || description.length < 2) description = segment;
  return { amount, category, description, date: extractDate(segment), rawInput: segment };
}

function formatDateStr(d) {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function parseWithRules(input, customRules) {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const tokens = scanAmounts(trimmed);
  if (tokens.length === 0) return [];
  const results = [];
  let prevEnd = 0;
  for (const token of tokens) {
    // 吸收金额后紧跟的单位字（verbArb/verbCn 等 token 不含单位时），保证段文本完整
    let segEnd = token.end;
    const after = trimmed.slice(segEnd, segEnd + 2);
    if (after.startsWith('块钱')) segEnd += 2;
    else if (trimmed[segEnd] === '元' || trimmed[segEnd] === '块' || trimmed[segEnd] === '¥') segEnd += 1;
    const segment = trimmed.slice(prevEnd, segEnd).trim();
    if (!segment) { prevEnd = segEnd; continue; }
    results.push(parseSegment(segment, token.amount, customRules));
    prevEnd = segEnd;
  }
  return results;
}

// ==================== Mock AI 解析 ====================

function mockAIParse(input, shouldSucceed = true) {
  if (!shouldSucceed || input.includes('神秘失败')) return null;
  const mockDB = {
    '今天在星巴克喝咖啡花了42元': { amount: 42, category: '餐饮', description: '星巴克咖啡' },
    '打车去机场150': { amount: 150, category: '交通', description: '去机场打车' },
    '淘宝买了件T恤89元': { amount: 89, category: '购物', description: 'T恤' },
    '收到工资15000': { amount: 15000, category: '收入', description: '工资' },
    '交物业费320': { amount: 320, category: '居住', description: '物业费' },
    '昨天医院挂号50': { amount: 50, category: '医疗', description: '挂号' },
    '车费12': { amount: 12, category: '交通', description: '车费' },
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

// 镜像 InputBar 的 loadAIConfig 判断：配置了 AI 才触发「其他」重分类
const AI_CONFIGURED = true;

/**
 * 规则引擎（多项）→ 未命中走 AI（单条）→ 「其他」条目配置了 AI 则重分类 → 逐条分类入库。
 * 单项输入返回 { success, record }；多项输入返回 { success, records }。
 */
function processExpense(input) {
  let parsed = parseWithRules(input);

  if (parsed.length === 0) {
    const ai = mockAIParse(input, true);
    if (!ai) return { success: false, error: '无法识别输入' };
    parsed = [ai];
  } else if (AI_CONFIGURED && parsed.some(i => i.category === '其他')) {
    // 规则命中但分类为「其他」→ AI 重分类（仅改分类；失败/识别不了 → 保持其他）
    parsed = parsed.map(item => {
      if (item.category !== '其他') return item;
      const ai = mockAIParse(item.rawInput || input, true);
      return ai && ai.category && ai.category !== '其他' ? { ...item, category: ai.category } : item;
    });
  }

  const records = [];
  for (const item of parsed) {
    if (item.amount <= 0) return { success: false, error: '金额无效' };
    const category = findCategory(item.category);
    if (!category) return { success: false, error: '未知分类' };
    records.push({
      success: true,
      record: {
        amount: item.amount,
        category_id: category.id,
        category_name: category.name,
        category_icon: category.icon,
        category_color: category.color,
        category_type: category.type,
        description: item.description,
        raw_input: item.rawInput || input,
        expense_date: item.date,
      },
    });
  }

  return records.length === 1 ? records[0] : { success: true, records };
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
    const result = processExpense('今天在星巴克喝咖啡花了42元');
    assert(result.success);
    assertEquals(result.record.amount, 42);
    assertEquals(result.record.category_name, '餐饮');
  });

  test('淘宝购物 → 规则命中', () => {
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

describe('完整流程：中文金额', () => {
  test('吃饭花了二十五 → 25', () => {
    const result = processExpense('吃饭花了二十五');
    assert(result.success);
    assertEquals(result.record.amount, 25);
    assertEquals(result.record.category_name, '餐饮');
  });
  test('工资两万 → 20000 收入', () => {
    const result = processExpense('收到工资两万');
    assert(result.success);
    assertEquals(result.record.amount, 20000);
    assertEquals(result.record.category_name, '收入');
  });
});

describe('完整流程：多项切分', () => {
  test('午饭35元 打车20块 → 2条记录', () => {
    const result = processExpense('午饭35元 打车20块');
    assert(result.success);
    assertEquals(result.records.length, 2);
    assertEquals(result.records[0].record.amount, 35);
    assertEquals(result.records[0].record.category_name, '餐饮');
    assertEquals(result.records[1].record.amount, 20);
    assertEquals(result.records[1].record.category_name, '交通');
    assertEquals(result.records[0].record.raw_input, '午饭35元');
    assertEquals(result.records[1].record.raw_input, '打车20块');
  });
  test('打球30买水5 → 2条', () => {
    const result = processExpense('打球30买水5');
    assert(result.success);
    assertEquals(result.records.length, 2);
    assertEquals(result.records[0].record.amount, 30);
    assertEquals(result.records[1].record.amount, 5);
  });
  test('工资8000打车20 → 收入+交通', () => {
    const result = processExpense('工资8000打车20');
    assert(result.success);
    assertEquals(result.records.length, 2);
    assertEquals(result.records[0].record.category_name, '收入');
    assertEquals(result.records[1].record.category_name, '交通');
  });
  test('7月15日吃饭花了88 → 单条不误切', () => {
    const result = processExpense('7月15日吃饭花了88');
    assert(result.success);
    assertEquals(result.record.amount, 88);
    assertEquals(result.record.expense_date, `${new Date().getFullYear()}-07-15`);
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
    const names = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '学习', '通讯', '收入', '其他'];
    names.forEach(name => {
      const cat = findCategory(name);
      assert(cat !== undefined, `${name} 应存在`);
      assertEquals(cat.name, name);
    });
  });
});

describe('完整流程：「其他」→ AI 重分类', () => {
  test('其他→AI 重分类成功：车费12', () => {
    const result = processExpense('车费12');
    assert(result.success);
    assertEquals(result.record.category_name, '交通');
    assertEquals(result.record.amount, 12); // 金额仍用规则引擎结果
  });

  test('AI 识别不了时保留其他', () => {
    const result = processExpense('神秘开支12'); // mock 返回 category 其他 → 保持
    assert(result.success);
    assertEquals(result.record.category_name, '其他');
  });

  test('AI 重分类失败 → 保持其他入账', () => {
    const result = processExpense('神秘失败12'); // mock 返回 null → 保持其他
    assert(result.success);
    assertEquals(result.record.category_name, '其他');
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
