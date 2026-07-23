/**
 * 规则引擎完整测试 — 覆盖所有分类和边界情况
 * 逻辑与 src/services/ruleEngine.ts 保持一致
 */
import { describe, test, assertEquals, assert } from './run.mjs';

function formatDate(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
  for (const pattern of amountPatterns) {
    const match = trimmed.match(pattern);
    if (match) { amount = parseFloat(match[1]); break; }
  }

  if (amount === null || amount <= 0) return null;

  const categoryRules = [
    [['饭', '餐', '食', '吃', '外卖', '食堂', '饭店', '餐厅', '火锅', '烧烤', '奶茶', '咖啡', '饮料', '水果', '零食', '早餐', '午饭', '晚饭', '晚餐', '夜宵', '买菜', '菜市场'], '餐饮'],
    [['地铁', '公交', '打车', '滴滴', '出租车', '高铁', '火车', '机票', '飞机', '加油', '油费', '停车', '过路费', '骑行', '共享单车', '摩拜', '哈啰', '通勤'], '交通'],
    [['衣服', '鞋子', '包包', '背包', '化妆品', '护肤品', '数码', '电脑', '耳机', '网购', '淘宝', '京东', '拼多多', '买了', '购买', '购物', '裤子', '裙子', '帽子', '首饰', '洗发水', '沐浴露', '日用品', '生活用品'], '购物'],
    [['电影', '游戏', 'KTV', '唱歌', '旅游', '旅行', '景点', '门票', '演出', '演唱会', '剧本杀', '密室', '会员', '视频会员', '音乐', '运动', '健身'], '娱乐'],
    [['房租', '房贷', '水电', '物业', '煤气', '天然气', '网费', '维修', '装修', '家具', '家电', '宽带'], '居住'],
    [['药', '医院', '挂号', '体检', '看病', '诊所', '牙医', '手术', '保险', '医保'], '医疗'],
    [['书', '课程', '培训', '考试', '学费', '报名', '文具', '考证', '网课', '教程', '学习'], '学习'],
    [['话费', '流量', '充值', '宽带', '快递', '邮寄', '物流'], '通讯'],
    [['工资', '奖金', '红包', '兼职', '退款', '报销', '利息', '理财', '收入', '赚了', '到账', '收款'], '收入'],
  ];

  let category = '其他';
  for (const [keywords, catName] of categoryRules) {
    if (keywords.some(kw => trimmed.includes(kw))) {
      category = catName;
      break;
    }
  }

  let description = trimmed
    .replace(/[￥¥]\s*\d+(?:\.\d{1,2})?/, '')
    .replace(/\d+(?:\.\d{1,2})?\s*[元块¥]/, '')
    .replace(/[花了消费]\s*\d+(?:\.\d{1,2})?/, '')
    .replace(/今天|昨天|前天|这周|上周|本月|上个月/g, '')
    .trim();

  if (!description || description.length < 2) description = trimmed;

  const today = new Date();
  let date = formatDate(today);

  if (trimmed.includes('昨天')) {
    const d = new Date(today); d.setDate(d.getDate() - 1); date = formatDate(d);
  } else if (trimmed.includes('前天')) {
    const d = new Date(today); d.setDate(d.getDate() - 2); date = formatDate(d);
  }

  const dateMatch = trimmed.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]).toString().padStart(2, '0');
    const day = parseInt(dateMatch[2]).toString().padStart(2, '0');
    date = `${today.getFullYear()}-${month}-${day}`;
  }

  return { amount, category, description, date };
}

// ==================== 测试用例 ====================

describe('金额提取', () => {
  test('X元', () => assertEquals(parseWithRules('午饭35元').amount, 35));
  test('X块', () => assertEquals(parseWithRules('打车20块').amount, 20));
  test('X¥', () => assertEquals(parseWithRules('咖啡28¥').amount, 28));
  test('花了X', () => assertEquals(parseWithRules('花了35').amount, 35));
  test('¥X', () => assertEquals(parseWithRules('¥128.50').amount, 128.5));
  test('带小数', () => assertEquals(parseWithRules('超市128.5元').amount, 128.5));
  test('无金额返回null', () => assert(parseWithRules('随便记一下') === null));
  test('空字符串返回null', () => assert(parseWithRules('') === null));
  test('负数被提取为正数', () => {
    // 规则引擎目前不处理负号，提取 50 作为正数金额
    // 负号场景（退款/报销）应由上层业务逻辑处理
    const result = parseWithRules('-50元');
    assertEquals(result.amount, 50);
  });
});

describe('餐饮分类', () => {
  test('午饭', () => assertEquals(parseWithRules('午饭花了35元').category, '餐饮'));
  test('外卖', () => assertEquals(parseWithRules('外卖42元').category, '餐饮'));
  test('奶茶', () => assertEquals(parseWithRules('奶茶18元').category, '餐饮'));
  test('火锅', () => assertEquals(parseWithRules('火锅298元').category, '餐饮'));
  test('买菜', () => assertEquals(parseWithRules('超市买菜花了128.5').category, '餐饮'));
  test('早餐', () => assertEquals(parseWithRules('早餐15元').category, '餐饮'));
});

describe('交通分类', () => {
  test('地铁', () => assertEquals(parseWithRules('今天地铁通勤6块').category, '交通'));
  test('打车', () => assertEquals(parseWithRules('打车去公司35元').category, '交通'));
  test('加油', () => assertEquals(parseWithRules('昨天加油200').category, '交通'));
  test('高铁', () => assertEquals(parseWithRules('高铁票550元').category, '交通'));
  test('停车', () => assertEquals(parseWithRules('停车费20元').category, '交通'));
});

describe('购物分类', () => {
  test('买衣服', () => assertEquals(parseWithRules('买了件衣服299').category, '购物'));
  test('网购', () => assertEquals(parseWithRules('网购耳机299').category, '购物'));
  test('淘宝', () => assertEquals(parseWithRules('淘宝买了个手机壳39').category, '购物'));
  test('洗发水', () => assertEquals(parseWithRules('买洗发水45').category, '购物'));
  test('日用品', () => assertEquals(parseWithRules('买日用品85元').category, '购物'));
  test('背包', () => assertEquals(parseWithRules('买了个背包199').category, '购物'));
});

describe('娱乐分类', () => {
  test('电影', () => assertEquals(parseWithRules('电影票80元').category, '娱乐'));
  test('KTV', () => assertEquals(parseWithRules('KTV唱歌280').category, '娱乐'));
  test('健身', () => assertEquals(parseWithRules('健身房会员卡2000').category, '娱乐'));
  test('视频会员', () => assertEquals(parseWithRules('视频会员续费30').category, '娱乐'));
});

describe('居住分类', () => {
  test('房租', () => assertEquals(parseWithRules('交房租1500').category, '居住'));
  test('水电', () => assertEquals(parseWithRules('水电费300').category, '居住'));
  test('网费', () => assertEquals(parseWithRules('交网费100').category, '居住'));
  test('宽带', () => assertEquals(parseWithRules('宽带续费200').category, '居住'));
});

describe('医疗分类', () => {
  test('看病', () => assertEquals(parseWithRules('医院挂号50').category, '医疗'));
  test('买药', () => assertEquals(parseWithRules('买药花了120').category, '医疗'));
  test('体检', () => assertEquals(parseWithRules('体检费800元').category, '医疗'));
});

describe('学习分类', () => {
  test('买书', () => assertEquals(parseWithRules('买书花了68块').category, '学习'));
  test('课程', () => assertEquals(parseWithRules('网课费用199').category, '学习'));
  test('文具', () => assertEquals(parseWithRules('买文具25元').category, '学习'));
});

describe('通讯分类', () => {
  test('话费', () => assertEquals(parseWithRules('话费充值100').category, '通讯'));
  test('快递', () => assertEquals(parseWithRules('快递费15').category, '通讯'));
  test('手机充值', () => assertEquals(parseWithRules('手机充值50元').category, '通讯'));
});

describe('收入分类', () => {
  test('工资', () => assertEquals(parseWithRules('收到工资8000').category, '收入'));
  test('红包', () => assertEquals(parseWithRules('红包收入200').category, '收入'));
  test('报销', () => assertEquals(parseWithRules('报销差旅费500').category, '收入'));
  test('退款', () => assertEquals(parseWithRules('退款到账299').category, '收入'));
});

describe('其他分类（无关键词匹配）', () => {
  test('纯金额无关键词', () => assertEquals(parseWithRules('¥128.50').category, '其他'));
  test('花了XX无关键词', () => assertEquals(parseWithRules('花了35').category, '其他'));
});

describe('日期识别', () => {
  test('默认今天', () => {
    const result = parseWithRules('午饭35元');
    assertEquals(result.date, formatDate(new Date()));
  });
  test('昨天', () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    assertEquals(parseWithRules('昨天午饭35元').date, formatDate(d));
  });
  test('前天', () => {
    const d = new Date(); d.setDate(d.getDate() - 2);
    assertEquals(parseWithRules('前天买药120').date, formatDate(d));
  });
  test('指定日期', () => {
    const result = parseWithRules('7月15日吃饭花了88');
    assertEquals(result.date, `${new Date().getFullYear()}-07-15`);
  });
});

describe('描述提取', () => {
  test('提取有意义描述', () => {
    const result = parseWithRules('午饭花了35元');
    assert(result.description.includes('午饭'), '描述应包含"午饭"');
  });
  test('无描述时用原文', () => {
    const result = parseWithRules('¥128.50');
    assertEquals(result.description, '¥128.50');
  });
});

describe('优先级（先匹配到的分类优先）', () => {
  test('吃饭→餐饮（非购物）', () => assertEquals(parseWithRules('超市买菜128元').category, '餐饮'));
  test('药品→医疗（非购物）', () => assertEquals(parseWithRules('买药120元').category, '医疗'));
  test('充值→通讯（非娱乐）', () => assertEquals(parseWithRules('话费充值100').category, '通讯'));
  test('红包→收入（非购物）', () => assertEquals(parseWithRules('红包收入200').category, '收入'));
});