import type { ParsedExpense, CustomRule } from '../types';

/**
 * 规则引擎：用正则和关键词从自然语言中提取消费信息（可含多条记录）
 * 返回数组；空数组表示规则无法匹配，需要降级到 AI 或手动输入
 *
 * 支持：
 * - 金额：阿拉伯数字（X元/块/¥、花了X、¥X、裸数字、X块Y）与中文数字（二十五、一百零五、三块五、三点五）
 * - 一次输入多项：「打球30买水5」→ 2 条记录，每个金额 token 是一个分段边界
 * - 自定义规则：keyword → category，优先于内置关键词
 */
export function parseWithRules(input: string, customRules?: CustomRule[]): ParsedExpense[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const tokens = scanAmounts(trimmed);
  if (tokens.length === 0) return [];

  const results: ParsedExpense[] = [];
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

// ===================== 中文数字转换 =====================

const CN_DIGITS: Record<string, number> = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const CN_SMALL_UNITS: Record<string, number> = { '十': 10, '百': 100, '千': 1000 };
const CN_BIG_UNITS: Record<string, number> = { '万': 10000, '亿': 100000000 };

/**
 * 中文数字 → number。
 * 支持 零〇一二两三四五六七八九十百千万亿（万/亿分段累加），以及口语省略：
 * 一百五→150、三千五→3500、一万二→12000。
 */
export function cnToNum(s: string): number {
  let total = 0, section = 0, digit = 0;
  let lastUnit = 0;
  for (const ch of s) {
    if (ch in CN_DIGITS) { digit = CN_DIGITS[ch]; }
    else if (ch in CN_SMALL_UNITS) {
      section += (digit === 0 ? 1 : digit) * CN_SMALL_UNITS[ch];
      digit = 0; lastUnit = CN_SMALL_UNITS[ch];
    }
    else if (ch in CN_BIG_UNITS) {
      section += digit;
      total += (section === 0 ? 1 : section) * CN_BIG_UNITS[ch];
      section = 0; digit = 0; lastUnit = CN_BIG_UNITS[ch];
    }
    else return NaN;
  }
  let result = total + section + digit;
  // 口语省略：单位后紧跟单个数字时按该单位的十分之一进位（一百五=150、一万二=12000）
  if (digit > 0 && lastUnit >= 100 && s.length >= 2 && s[s.length - 2] !== '零') {
    result = total + section + digit * (lastUnit / 10);
  }
  return result;
}

// ===================== 金额 token 扫描 =====================

const CN_CHARS = '[零〇一两二三四五六七八九十百千万亿]';
const CN_SINGLE = '[零〇一二三四五六七八九]';

/**
 * 单个扫描正则，每个备选一个捕获组（组号 = 分支序号）。
 * 顺序关键：日期备选最前，否则裸数字分支会先吞掉「7月15日」。
 * 注意：不用命名分组 / matchAll，只用 exec + 编号组，保证 Hermes 兼容。
 */
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

/** 描述清洗用：同上正则去掉日期分支 */
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

/** 裸数字后紧跟量词 → 是计数而非金额，跳过（「买了3个苹果花了88元」不切 3） */
const MEASURE_WORDS = new Set([
  '个', '本', '件', '台', '只', '次', '张', '份', '杯', '盒', '双', '支', '瓶', '袋', '套', '餐', '颗', '场', '辆', '顶',
  '部', '页', '条', '位', '名', '道', '门', '节', '点', '分', '秒', '月', '日', '号',
]);

interface AmountToken { start: number; end: number; amount: number }

function isMeasureWord(input: string, index: number): boolean {
  if (index >= input.length) return false;
  return MEASURE_WORDS.has(input[index]);
}

function numOf(text: string): number {
  const m = /\d+(?:\.\d{1,2})?/.exec(text);
  return m ? parseFloat(m[0]) : 0;
}

function scanAmounts(input: string): AmountToken[] {
  const tokens: AmountToken[] = [];
  SCAN_RE.lastIndex = 0; // 复用全局正则，先重置
  let m: RegExpExecArray | null;
  while ((m = SCAN_RE.exec(input)) !== null) {
    const idx = m.index;
    const end = idx + m[0].length;
    // 命中第 k 个备选 = 第 k 个捕获组有值（exec 已自动推进 lastIndex）
    let branch = 0;
    for (let k = 1; k <= 11; k++) {
      if (m[k] !== undefined) { branch = k; break; }
    }
    let amount: number | null = null;

    if (branch === 1) {
      // date —— 不是金额，跳过
    } else if (branch === 2) { // decArb：3块5 → 3.5
      const parts = /(\d+)\s*块\s*(\d{1,2})/.exec(m[0])!;
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

// ===================== 段解析 =====================

const categoryRules: [string[], string][] = [
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

function extractDate(segment: string): string {
  const today = new Date();

  if (segment.includes('昨天')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  } else if (segment.includes('前天')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    return formatDate(d);
  }

  const dateMatch = segment.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]).toString().padStart(2, '0');
    const day = parseInt(dateMatch[2]).toString().padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  }

  return formatDate(today);
}

function parseSegment(segment: string, amount: number, customRules?: CustomRule[]): ParsedExpense {
  // 分类：自定义规则优先，其次内置关键词，默认「其他」
  let category = '其他';
  let matched = false;
  if (customRules && customRules.length > 0) {
    const hit = customRules.find(r => segment.includes(r.keyword));
    if (hit) { category = hit.category; matched = true; }
  }
  if (!matched) {
    for (const [keywords, catName] of categoryRules) {
      if (keywords.some(kw => segment.includes(kw))) {
        category = catName;
        break;
      }
    }
  }

  // 描述：剥离金额 token 和常见日期词
  let description = segment
    .replace(AMOUNT_RE, '')
    .replace(/今天|昨天|前天|这周|上周|本月|上个月/g, '')
    .replace(/[元块]\s*$/, '')
    .trim();

  if (!description || description.length < 2) {
    description = segment;
  }

  return { amount, category, description, date: extractDate(segment), rawInput: segment };
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}
