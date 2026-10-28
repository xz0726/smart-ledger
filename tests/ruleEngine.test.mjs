/**
 * 规则引擎完整测试 — 覆盖所有分类、中文金额、多项切分、自定义规则和边界情况
 * 逻辑与 src/services/ruleEngine.ts 保持一致（TS 无法在 node 直接导入，此为镜像副本，
 * 修改引擎时必须同步更新本文件）
 */
import { describe, test, assertEquals, assert } from './run.mjs';

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
    const d = new Date(today); d.setDate(d.getDate() - 1); return formatDate(d);
  } else if (segment.includes('前天')) {
    const d = new Date(today); d.setDate(d.getDate() - 2); return formatDate(d);
  }
  const dm = segment.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (dm) {
    const month = parseInt(dm[1]).toString().padStart(2, '0');
    const day = parseInt(dm[2]).toString().padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  }
  return formatDate(today);
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

function formatDate(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
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

// ==================== 测试用例 ====================

describe('金额提取（阿拉伯数字）', () => {
  test('X元', () => assertEquals(parseWithRules('午饭35元')[0].amount, 35));
  test('X块', () => assertEquals(parseWithRules('打车20块')[0].amount, 20));
  test('X¥', () => assertEquals(parseWithRules('咖啡28¥')[0].amount, 28));
  test('花了X', () => assertEquals(parseWithRules('花了35')[0].amount, 35));
  test('¥X', () => assertEquals(parseWithRules('¥128.50')[0].amount, 128.5));
  test('带小数', () => assertEquals(parseWithRules('超市128.5元')[0].amount, 128.5));
  test('X块Y小数', () => assertEquals(parseWithRules('三块五')[0].amount, 3.5));
  test('X块15小数', () => assertEquals(parseWithRules('3块15')[0].amount, 3.15));
  test('午饭花了25元', () => {
    const r = parseWithRules('午饭花了25元');
    assertEquals(r.length, 1);
    assertEquals(r[0].amount, 25);
    assertEquals(r[0].category, '餐饮');
    assertEquals(r[0].rawInput, '午饭花了25元');
  });
  test('无金额返回空数组', () => assert(parseWithRules('随便记一下').length === 0));
  test('空字符串返回空数组', () => assert(parseWithRules('').length === 0));
  test('负数被提取为正数', () => assertEquals(parseWithRules('-50元')[0].amount, 50));
});

describe('金额提取（中文数字）', () => {
  test('二十五', () => assertEquals(parseWithRules('吃饭花了二十五元')[0].amount, 25));
  test('一百零五', () => assertEquals(parseWithRules('买书花了一百零五元')[0].amount, 105));
  test('十五块', () => assertEquals(parseWithRules('打车十五块')[0].amount, 15));
  test('两万', () => assertEquals(parseWithRules('收到工资两万')[0].amount, 20000));
  test('三千', () => assertEquals(parseWithRules('房租三千')[0].amount, 3000));
  test('口语一百五', () => assertEquals(parseWithRules('买药一百五')[0].amount, 150));
  test('口语三千五', () => assertEquals(parseWithRules('加油三千五')[0].amount, 3500));
  test('三块五', () => assertEquals(parseWithRules('买水果三块五')[0].amount, 3.5));
  test('三点五', () => assertEquals(parseWithRules('奶茶三点五')[0].amount, 3.5));
});

describe('多项切分', () => {
  test('打球30买水5 → 2条', () => {
    const r = parseWithRules('打球30买水5');
    assertEquals(r.length, 2);
    assertEquals(r[0].amount, 30);
    assertEquals(r[1].amount, 5);
  });
  test('带空格两项', () => {
    const r = parseWithRules('午饭35元 打车20块');
    assertEquals(r.length, 2);
    assertEquals(r[0].amount, 35);
    assertEquals(r[0].category, '餐饮');
    assertEquals(r[1].amount, 20);
    assertEquals(r[1].category, '交通');
  });
  test('收入+支出混合', () => {
    const r = parseWithRules('工资8000打车20');
    assertEquals(r.length, 2);
    assertEquals(r[0].category, '收入');
    assertEquals(r[1].category, '交通');
  });
  test('rawInput 是分段文本', () => {
    const r = parseWithRules('午饭35元 打车20块');
    assertEquals(r[0].rawInput, '午饭35元');
    assertEquals(r[1].rawInput, '打车20块');
  });
  test('日期不被误切分', () => {
    const r = parseWithRules('7月15日吃饭花了88元');
    assertEquals(r.length, 1);
    assertEquals(r[0].amount, 88);
    assertEquals(r[0].date, `${new Date().getFullYear()}-07-15`);
  });
  test('日期后接多项', () => {
    const r = parseWithRules('7月15日吃饭花了88 买菜30元');
    assertEquals(r.length, 2);
    assertEquals(r[0].amount, 88);
    assertEquals(r[1].amount, 30);
  });
  test('小数是一个整体不分段', () => {
    assertEquals(parseWithRules('超市128.5元').length, 1);
  });
  test('量词守卫：买了3个不切3', () => {
    const r = parseWithRules('买了3个苹果花了88元');
    assertEquals(r.length, 1);
    assertEquals(r[0].amount, 88);
  });
  test('多项中文金额', () => {
    const r = parseWithRules('打车花了二十 买水三块');
    assertEquals(r.length, 2);
    assertEquals(r[0].amount, 20);
    assertEquals(r[1].amount, 3);
  });
  test('verbArb 段文本吸收单位字', () => {
    const r = parseWithRules('午饭花了35元 打车花了20元');
    assertEquals(r.length, 2);
    assertEquals(r[0].rawInput, '午饭花了35元');
    assertEquals(r[1].rawInput, '打车花了20元');
  });
  test('块钱 双字吸收', () => {
    const r = parseWithRules('打车花了200块钱');
    assertEquals(r.length, 1);
    assertEquals(r[0].amount, 200);
    assertEquals(r[0].rawInput, '打车花了200块钱');
  });
});

describe('餐饮分类', () => {
  test('午饭', () => assertEquals(parseWithRules('午饭花了35元')[0].category, '餐饮'));
  test('外卖', () => assertEquals(parseWithRules('外卖42元')[0].category, '餐饮'));
  test('奶茶', () => assertEquals(parseWithRules('奶茶18元')[0].category, '餐饮'));
  test('火锅', () => assertEquals(parseWithRules('火锅298元')[0].category, '餐饮'));
  test('买菜', () => assertEquals(parseWithRules('超市买菜花了128.5')[0].category, '餐饮'));
  test('早餐', () => assertEquals(parseWithRules('早餐15元')[0].category, '餐饮'));
  test('美团', () => assertEquals(parseWithRules('美团30')[0].category, '餐饮'));
});

describe('交通分类', () => {
  test('地铁', () => assertEquals(parseWithRules('今天地铁通勤6块')[0].category, '交通'));
  test('打车', () => assertEquals(parseWithRules('打车去公司35元')[0].category, '交通'));
  test('加油', () => assertEquals(parseWithRules('昨天加油200')[0].category, '交通'));
  test('高铁', () => assertEquals(parseWithRules('高铁票550元')[0].category, '交通'));
  test('停车', () => assertEquals(parseWithRules('停车费20元')[0].category, '交通'));
  test('车费', () => assertEquals(parseWithRules('车费12')[0].category, '交通'));
  test('洗车', () => assertEquals(parseWithRules('洗车35')[0].category, '交通'));
  test('网约车', () => assertEquals(parseWithRules('网约车30元')[0].category, '交通'));
});

describe('购物分类', () => {
  test('买衣服', () => assertEquals(parseWithRules('买了件衣服299')[0].category, '购物'));
  test('网购', () => assertEquals(parseWithRules('网购耳机299')[0].category, '购物'));
  test('淘宝', () => assertEquals(parseWithRules('淘宝买了个手机壳39')[0].category, '购物'));
  test('洗发水', () => assertEquals(parseWithRules('买洗发水45')[0].category, '购物'));
  test('日用品', () => assertEquals(parseWithRules('买日用品85元')[0].category, '购物'));
  test('背包', () => assertEquals(parseWithRules('买了个背包199')[0].category, '购物'));
});

describe('娱乐分类', () => {
  test('电影', () => assertEquals(parseWithRules('电影票80元')[0].category, '娱乐'));
  test('KTV', () => assertEquals(parseWithRules('KTV唱歌280')[0].category, '娱乐'));
  test('健身', () => assertEquals(parseWithRules('健身房会员卡2000')[0].category, '娱乐'));
  test('视频会员', () => assertEquals(parseWithRules('视频会员续费30')[0].category, '娱乐'));
});

describe('居住分类', () => {
  test('房租', () => assertEquals(parseWithRules('交房租1500')[0].category, '居住'));
  test('水电', () => assertEquals(parseWithRules('水电费300')[0].category, '居住'));
  test('网费', () => assertEquals(parseWithRules('交网费100')[0].category, '居住'));
  test('宽带', () => assertEquals(parseWithRules('宽带续费200')[0].category, '居住'));
});

describe('医疗分类', () => {
  test('看病', () => assertEquals(parseWithRules('医院挂号50')[0].category, '医疗'));
  test('买药', () => assertEquals(parseWithRules('买药花了120')[0].category, '医疗'));
  test('体检', () => assertEquals(parseWithRules('体检费800元')[0].category, '医疗'));
});

describe('学习分类', () => {
  test('买书', () => assertEquals(parseWithRules('买书花了68块')[0].category, '学习'));
  test('课程', () => assertEquals(parseWithRules('网课费用199')[0].category, '学习'));
  test('文具', () => assertEquals(parseWithRules('买文具25元')[0].category, '学习'));
});

describe('通讯分类', () => {
  test('话费', () => assertEquals(parseWithRules('话费充值100')[0].category, '通讯'));
  test('快递', () => assertEquals(parseWithRules('快递费15')[0].category, '通讯'));
  test('手机充值', () => assertEquals(parseWithRules('手机充值50元')[0].category, '通讯'));
});

describe('收入分类', () => {
  test('工资', () => assertEquals(parseWithRules('收到工资8000')[0].category, '收入'));
  test('红包', () => assertEquals(parseWithRules('红包收入200')[0].category, '收入'));
  test('报销', () => assertEquals(parseWithRules('报销差旅费500')[0].category, '收入'));
  test('退款', () => assertEquals(parseWithRules('退款到账299')[0].category, '收入'));
});

describe('其他分类（无关键词匹配）', () => {
  test('纯金额无关键词', () => assertEquals(parseWithRules('¥128.50')[0].category, '其他'));
  test('花了XX无关键词', () => assertEquals(parseWithRules('花了35')[0].category, '其他'));
});

describe('自定义规则', () => {
  const rules = [{ id: 1, keyword: '台球', category: '娱乐' }];
  test('自定义规则覆盖默认归类', () => {
    const r = parseWithRules('打台球50元', rules);
    assertEquals(r[0].category, '娱乐');
  });
  test('无自定义规则时默认娱乐', () => {
    assertEquals(parseWithRules('打台球50元')[0].category, '娱乐');
  });
  test('多个自定义规则按顺序优先', () => {
    const r = parseWithRules('台球50元', [{ id: 1, keyword: '台球', category: '娱乐' }, { id: 2, keyword: '台', category: '学习' }]);
    assertEquals(r[0].category, '娱乐');
  });
});

describe('日期识别', () => {
  test('默认今天', () => assertEquals(parseWithRules('午饭35元')[0].date, formatDate(new Date())));
  test('昨天', () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    assertEquals(parseWithRules('昨天午饭35元')[0].date, formatDate(d));
  });
  test('前天', () => {
    const d = new Date(); d.setDate(d.getDate() - 2);
    assertEquals(parseWithRules('前天买药120')[0].date, formatDate(d));
  });
  test('指定日期', () => assertEquals(parseWithRules('7月15日吃饭花了88')[0].date, `${new Date().getFullYear()}-07-15`));
});

describe('描述提取', () => {
  test('提取有意义描述', () => {
    const result = parseWithRules('午饭花了35元')[0];
    assert(result.description.includes('午饭'), '描述应包含"午饭"');
  });
  test('无描述时用原文', () => assertEquals(parseWithRules('¥128.50')[0].description, '¥128.50'));
  test('中文金额从描述中剥离', () => {
    const result = parseWithRules('吃饭花了二十五元')[0];
    assert(result.description.includes('吃饭'), '描述应包含"吃饭"');
    assert(!result.description.includes('二十五'), '描述不应含中文金额');
  });
});

describe('优先级（先匹配到的分类优先）', () => {
  test('吃饭→餐饮（非购物）', () => assertEquals(parseWithRules('超市买菜128元')[0].category, '餐饮'));
  test('药品→医疗（非购物）', () => assertEquals(parseWithRules('买药120元')[0].category, '医疗'));
  test('充值→通讯（非娱乐）', () => assertEquals(parseWithRules('话费充值100')[0].category, '通讯'));
  test('红包→收入（非购物）', () => assertEquals(parseWithRules('红包收入200')[0].category, '收入'));
});
