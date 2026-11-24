import type { Category, CustomRule } from '../../types';
import { matchCategory, matchCustomRule } from '../ruleEngine';
import type { CategoryConfidence, ClassifiedBillTx, NormalizedBillTx } from './types';

const ALIPAY_CATEGORY_MAP: Record<string, string> = {
  '餐饮美食': '餐饮',
  '交通出行': '交通',
  '日用百货': '购物',
  '服饰装扮': '购物',
  '数码电器': '购物',
  '美妆个护': '购物',
  '家居家装': '居住',
  '运动户外': '娱乐',
  '文化休闲': '娱乐',
  '酒店旅游': '娱乐',
  '医疗健康': '医疗',
  '教育培训': '学习',
  '通讯缴费': '通讯',
  '居住物业': '居住',
  '商业服务': '其他',
  '生活服务': '其他',
  '公益捐赠': '其他',
  '转账红包': '其他',
  '其他': '其他',
};

/**
 * 微信商户/商品补充关键词。支付宝分类映射不到具体分类时也会用。
 * 匹配时取「命中的最长关键词」，避免「美团单车」被「美团」抢到餐饮。
 */
const MERCHANT_RULES: Array<[string, string]> = [
  // 餐饮
  ['肯德基', '餐饮'], ['麦当劳', '餐饮'], ['汉堡王', '餐饮'], ['必胜客', '餐饮'],
  ['星巴克', '餐饮'], ['瑞幸', '餐饮'], ['luckin', '餐饮'], ['蜜雪', '餐饮'],
  ['喜茶', '餐饮'], ['奈雪', '餐饮'], ['茶百道', '餐饮'], ['霸王茶姬', '餐饮'],
  ['古茗', '餐饮'], ['库迪', '餐饮'], ['咖啡', '餐饮'], ['麻辣烫', '餐饮'],
  ['米线', '餐饮'], ['面馆', '餐饮'], ['面条', '餐饮'], ['米粉', '餐饮'],
  ['螺蛳粉', '餐饮'], ['饺子', '餐饮'], ['包子', '餐饮'], ['快餐', '餐饮'],
  ['便当', '餐饮'], ['炸鸡', '餐饮'], ['烤肉', '餐饮'], ['寿司', '餐饮'],
  ['潮汕甜汤', '餐饮'], ['甜汤', '餐饮'], ['糖水', '餐饮'], ['小吃', '餐饮'],
  ['烧烤', '餐饮'], ['火锅', '餐饮'], ['外卖', '餐饮'], ['早餐', '餐饮'],
  ['面包', '餐饮'], ['盒马', '餐饮'], ['叮咚', '餐饮'], ['朴朴', '餐饮'],
  ['便利店', '餐饮'], ['罗森', '餐饮'], ['全家', '餐饮'], ['7-11', '餐饮'],
  ['便利蜂', '餐饮'], ['超市', '餐饮'], ['水果', '餐饮'], ['零食', '餐饮'],
  ['奶茶', '餐饮'], ['淘宝闪购', '餐饮'], ['美团外卖', '餐饮'], ['饿了么', '餐饮'],
  ['美团', '餐饮'],

  // 交通
  ['地铁', '交通'], ['公交', '交通'], ['滴滴', '交通'], ['高德', '交通'],
  ['曹操', '交通'], ['T3出行', '交通'], ['出租车', '交通'], ['铁路', '交通'],
  ['12306', '交通'], ['高铁', '交通'], ['火车', '交通'], ['机票', '交通'],
  ['航空', '交通'], ['加油', '交通'], ['充电', '交通'], ['停车', '交通'],
  ['高速', '交通'], ['ETC', '交通'], ['共享单车', '交通'], ['哈啰', '交通'],
  ['青桔', '交通'], ['美团单车', '交通'], ['随申行', '交通'], ['万桩', '交通'],

  // 医疗
  ['医院', '医疗'], ['门诊', '医疗'], ['药房', '医疗'], ['药店', '医疗'],
  ['诊所', '医疗'], ['体检', '医疗'], ['口腔', '医疗'], ['牙科', '医疗'],
  ['医疗', '医疗'], ['医保', '医疗'],

  // 购物
  ['淘宝', '购物'], ['天猫', '购物'], ['京东', '购物'], ['拼多多', '购物'],
  ['得物', '购物'], ['唯品会', '购物'], ['小红书', '购物'], ['抖音电商', '购物'],
  ['商城', '购物'], ['百货', '购物'], ['服饰', '购物'], ['优衣库', '购物'],
  ['无印良品', '购物'], ['名创优品', '购物'], ['MINISO', '购物'], ['屈臣氏', '购物'],
  ['数码', '购物'], ['电器', '购物'], ['美团金融', '其他'],

  // 娱乐
  ['电影', '娱乐'], ['影院', '娱乐'], ['游戏', '娱乐'], ['KTV', '娱乐'],
  ['演出', '娱乐'], ['门票', '娱乐'], ['旅游', '娱乐'], ['酒店', '娱乐'],
  ['携程', '娱乐'], ['飞猪', '娱乐'], ['同程', '娱乐'], ['迪士尼', '娱乐'],
  ['乐园', '娱乐'], ['健身', '娱乐'], ['游泳', '娱乐'], ['球馆', '娱乐'],
  ['剧本杀', '娱乐'], ['密室', '娱乐'], ['泡泡玛特', '娱乐'], ['POP MART', '娱乐'],
  ['盲盒', '娱乐'], ['游娃娃', '娱乐'],

  // 学习
  ['书店', '学习'], ['图书', '学习'], ['课程', '学习'], ['培训', '学习'],
  ['教育', '学习'], ['学校', '学习'], ['考试', '学习'], ['文具', '学习'],

  // 通讯
  ['中国移动', '通讯'], ['中国联通', '通讯'], ['中国电信', '通讯'],
  ['话费', '通讯'], ['流量', '通讯'], ['电话费', '通讯'], ['手机费', '通讯'],

  // 居住
  ['房租', '居住'], ['物业', '居住'], ['水电', '居住'], ['燃气', '居住'],
  ['宽带', '居住'], ['维修', '居住'], ['装修', '居住'], ['家具', '居住'],
  ['家电', '居住'],
];

interface Resolved {
  name: string;
  id: number;
}

function buildLookup(categories: Category[]): {
  byName: Map<string, Category>;
  fallback: Resolved;
  incomeNames: string[];
} {
  const byName = new Map<string, Category>();
  for (const c of categories) {
    if (!byName.has(c.name)) byName.set(c.name, c);
  }
  const expenseCats = categories.filter(c => c.type === 'expense');
  const fallbackCat = byName.get('其他')?.type === 'expense'
    ? byName.get('其他')!
    : expenseCats[0];
  if (!fallbackCat) throw new Error('没有可用的支出分类，请先在分类管理中添加');
  return {
    byName,
    fallback: { name: fallbackCat.name, id: fallbackCat.id },
    incomeNames: categories.filter(c => c.type === 'income').map(c => c.name),
  };
}

function resolveExpense(name: string, byName: Map<string, Category>, fallback: Resolved): Resolved {
  const c = byName.get(name);
  if (c && c.type === 'expense') return { name: c.name, id: c.id };
  return fallback;
}

function matchMerchant(text: string): { keyword: string; category: string } | null {
  let best: { keyword: string; category: string } | null = null;
  for (const [kw, category] of MERCHANT_RULES) {
    if (!text.includes(kw)) continue;
    if (!best || kw.length > best.keyword.length) best = { keyword: kw, category };
  }
  return best;
}

function classifyOne(
  tx: NormalizedBillTx,
  byName: Map<string, Category>,
  fallback: Resolved,
  customRules: CustomRule[],
  incomeNames: string[],
): { resolved: Resolved; confidence: CategoryConfidence } {
  // 只拿商户/商品做关键词匹配；交易分类单独走支付宝映射，
  // 避免「教育培训」这类分类字误触发「教育」关键词。
  const text = `${tx.merchant} ${tx.item}`.trim();
  const exclude = { excludeCategories: incomeNames };

  // 1. 用户自定义关键词
  const custom = matchCustomRule(text, customRules, exclude);
  if (custom) {
    const resolved = resolveExpense(custom, byName, fallback);
    if (resolved.name !== fallback.name || custom === fallback.name) {
      return { resolved, confidence: 'high' };
    }
  }

  const merchant = matchMerchant(text);

  // 2. 明确的商户关键词（>=3 字）优先于支付宝分类：
  //    支付宝偶尔会把「麻辣烫面」标成教育培训，长商户词更可信。
  if (merchant && (tx.source === 'wechat' || merchant.keyword.length >= 3)) {
    const c = byName.get(merchant.category);
    if (c && c.type === 'expense') return { resolved: { name: c.name, id: c.id }, confidence: 'high' };
  }

  // 3. 支付宝交易分类映射（映射到具体分类时优先；映射为「其他」则继续看商户）
  if (tx.source === 'alipay') {
    const mapped = ALIPAY_CATEGORY_MAP[tx.billCategory];
    if (mapped && mapped !== '其他') {
      const c = byName.get(mapped);
      if (c && c.type === 'expense') return { resolved: { name: c.name, id: c.id }, confidence: 'high' };
    }
  }

  // 4. 其余商户/商品关键词
  if (merchant) {
    const c = byName.get(merchant.category);
    if (c && c.type === 'expense') return { resolved: { name: c.name, id: c.id }, confidence: 'high' };
  }

  // 5. 内置自然语言关键词（排除收入分类）
  const builtin = matchCategory(text, undefined, exclude);
  if (builtin.matched) {
    const resolved = resolveExpense(builtin.category, byName, fallback);
    return { resolved, confidence: 'high' };
  }

  return { resolved: fallback, confidence: 'low' };
}

export function classifyTransactions(
  transactions: NormalizedBillTx[],
  categories: Category[],
  customRules: CustomRule[],
): ClassifiedBillTx[] {
  const { byName, fallback, incomeNames } = buildLookup(categories);
  return transactions.map(tx => {
    const { resolved, confidence } = classifyOne(tx, byName, fallback, customRules, incomeNames);
    return {
      ...tx,
      categoryId: resolved.id,
      categoryName: resolved.name,
      confidence,
    };
  });
}
