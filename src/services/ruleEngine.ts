import type { ParsedExpense } from '../types';

/**
 * 规则引擎：用正则和关键词从自然语言中提取消费信息
 * 返回 null 表示规则无法匹配，需要降级到 AI 或手动输入
 */
export function parseWithRules(input: string): ParsedExpense | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 提取金额：匹配 "X元"、"X块"、"X¥"、纯数字
  const amountPatterns = [
    /(\d+(?:\.\d{1,2})?)\s*[元块¥]/,
    /[花了消费]\s*(\d+(?:\.\d{1,2})?)/,
    /(\d+(?:\.\d{1,2})?)\s*(?:块钱|rmb|RMB)?/,
    /[￥¥]\s*(\d+(?:\.\d{1,2})?)/,
  ];

  let amount: number | null = null;
  for (const pattern of amountPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      amount = parseFloat(match[1]);
      break;
    }
  }

  if (amount === null || amount <= 0) return null;

  // 提取分类：关键词匹配
  const categoryRules: [string[], string][] = [
    [['饭', '餐', '食', '吃', '外卖', '食堂', '饭店', '餐厅', '火锅', '烧烤', '奶茶', '咖啡', '饮料', '水果', '零食', '早餐', '午饭', '午饭', '晚饭', '晚餐', '夜宵', '买菜', '超市', '菜市场'], '餐饮'],
    [['地铁', '公交', '打车', '滴滴', '出租车', '高铁', '火车', '机票', '飞机', '加油', '油费', '停车', '过路费', '骑行', '共享单车', '摩拜', '哈啰', '通勤'], '交通'],
    [['衣服', '鞋子', '包包', '背包', '化妆品', '护肤品', '数码', '电脑', '耳机', '网购', '淘宝', '京东', '拼多多', '买了', '购买', '购物', '裤子', '裙子', '帽子', '首饰', '洗发水', '沐浴露', '日用品', '生活用品'], '购物'],
    [['电影', '游戏', 'KTV', '唱歌', '旅游', '旅行', '景点', '门票', '演出', '演唱会', '剧本杀', '密室', '会员', '视频会员', '音乐', '运动', '健身'], '娱乐'],
    [['房租', '房贷', '水电', '物业', '煤气', '天然气', '网费', '宽带', '维修', '装修', '家具', '家电'], '居住'],
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

  // 提取描述：去掉金额和常见词后的剩余文字
  let description = trimmed
    .replace(/[￥¥]\s*\d+(?:\.\d{1,2})?/, '')
    .replace(/\d+(?:\.\d{1,2})?\s*[元块¥]/, '')
    .replace(/[花了消费]\s*\d+(?:\.\d{1,2})?/, '')
    .replace(/今天|昨天|前天|这周|上周|本月|上个月/g, '')
    .trim();

  if (!description || description.length < 2) {
    description = trimmed;
  }

  // 提取日期
  const today = new Date();
  let date = formatDate(today);

  if (trimmed.includes('昨天')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    date = formatDate(d);
  } else if (trimmed.includes('前天')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    date = formatDate(d);
  }

  // 匹配具体日期：如 "7月15日"、"7.15"
  const dateMatch = trimmed.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]).toString().padStart(2, '0');
    const day = parseInt(dateMatch[2]).toString().padStart(2, '0');
    date = `${today.getFullYear()}-${month}-${day}`;
  }

  return { amount, category, description, date };
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}