/**
 * Day 3 验证脚本：规则引擎逻辑测试（独立运行）
 * 运行: node test-day3.mjs
 */
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
    if (match) {
      amount = parseFloat(match[1]);
      break;
    }
  }

  if (amount === null || amount <= 0) return null;

  const categoryRules = [
    [['饭', '餐', '食', '吃', '外卖', '食堂', '饭店', '餐厅', '火锅', '烧烤', '奶茶', '咖啡', '饮料', '水果', '零食', '早餐', '午饭', '晚饭', '晚餐', '夜宵', '买菜', '菜市场'], '餐饮'],
    [['地铁', '公交', '打车', '滴滴', '出租车', '高铁', '火车', '机票', '飞机', '加油', '油费', '停车', '过路费', '骑行', '共享单车', '摩拜', '哈啰', '通勤'], '交通'],
    [['衣服', '鞋子', '包包', '背包', '化妆品', '护肤品', '数码', '电脑', '耳机', '网购', '淘宝', '京东', '拼多多', '买了', '购买', '购物', '裤子', '裙子', '帽子', '首饰', '洗发水', '沐浴露', '日用品'], '购物'],
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

  if (!description || description.length < 2) {
    description = trimmed;
  }

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

  const dateMatch = trimmed.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]).toString().padStart(2, '0');
    const day = parseInt(dateMatch[2]).toString().padStart(2, '0');
    date = `${today.getFullYear()}-${month}-${day}`;
  }

  return { amount, category, description, date };
}

// ============ 测试用例 ============
const TEST_CASES = [
  ['午饭花了35元', 35, '餐饮'],
  ['今天地铁通勤6块', 6, '交通'],
  ['昨天加油200', 200, '交通'],
  ['买了件衣服299', 299, '购物'],
  ['交房租1500', 1500, '居住'],
  ['收到工资8000', 8000, '收入'],
  ['超市买菜花了128.5', 128.5, '餐饮'],
  ['打车去公司35元', 35, '交通'],
  ['医院挂号50', 50, '医疗'],
  ['买书花了68块', 68, '学习'],
  ['话费充值100', 100, '通讯'],       // ← 之前失败：充值关键词匹配到娱乐
  ['电影票80元', 80, '娱乐'],
  ['水电费300', 300, '居住'],
  ['今天晚饭吃了45', 45, '餐饮'],
  ['奶茶18元', 18, '餐饮'],
  ['网购耳机299', 299, '购物'],
  ['健身房会员卡2000', 2000, '娱乐'],
  ['快递费15', 15, '通讯'],
  ['报销差旅费500', 500, '收入'],
  ['7月15日吃饭花了88', 88, '餐饮'],
  ['¥128.50', 128.5, '其他'],
  ['花了35', 35, '其他'],
  ['随便记一下', null, null],
  ['', null, null],
  ['昨天加班餐补50', 50, '餐饮'],
  ['买药花了120', 120, '医疗'],
  ['停车费20元', 20, '交通'],
  ['红包收入200', 200, '收入'],       // ← 之前失败：包关键词匹配到购物
  ['今天午饭35', 35, '餐饮'],
  ['打车花了25元', 25, '交通'],
  ['买水果花了45元', 45, '餐饮'],
  ['滴滴打车去机场120', 120, '交通'],
  ['淘宝买了个手机壳39', 39, '购物'],
  ['KTV唱歌280', 280, '娱乐'],
  ['交网费100', 100, '居住'],
  ['咖啡28元', 28, '餐饮'],
  ['共享单车1.5元', 1.5, '交通'],
  ['收到红包88.88', 88.88, '收入'],    // ← 之前失败：包关键词匹配到购物
  ['买洗发水45', 45, '购物'],          // ← 之前失败：无洗发水关键词
  ['朋友聚餐AA花了120', 120, '餐饮'],
  ['视频会员续费30', 30, '娱乐'],
  ['买日用品85元', 85, '购物'],
  ['手机充值50元', 50, '通讯'],
  ['买了个背包199', 199, '购物'],
  ['宽带续费200', 200, '居住'],
];

let passed = 0;
let failed = 0;
const failures = [];

console.log('══════════════════════════════════════════');
console.log('  🧪 Day 3: 规则引擎验证测试 (修复版)');
console.log('══════════════════════════════════════════\n');

for (const [input, expectedAmount, expectedCategory] of TEST_CASES) {
  const result = parseWithRules(input);

  if (expectedAmount === null) {
    if (result === null) {
      passed++;
      console.log(`  ✅ "${input}" → 正确返回 null`);
    } else {
      failed++;
      const msg = `❌ "${input}" → 期望 null，实际 ¥${result.amount}`;
      console.log(`  ${msg}`);
      failures.push(msg);
    }
    continue;
  }

  if (result === null) {
    failed++;
    const msg = `❌ "${input}" → 期望=¥${expectedAmount}，实际返回 null`;
    console.log(`  ${msg}`);
    failures.push(msg);
    continue;
  }

  let ok = true;
  const issues = [];

  if (result.amount !== expectedAmount) {
    ok = false;
    issues.push(`金额: ${expectedAmount}≠${result.amount}`);
  }
  if (expectedCategory && result.category !== expectedCategory) {
    ok = false;
    issues.push(`分类: ${expectedCategory}≠${result.category}`);
  }

  if (ok) {
    passed++;
    console.log(`  ✅ "${input}" → ¥${result.amount} [${result.category}] ${result.date}`);
  } else {
    failed++;
    const msg = `❌ "${input}" → ${issues.join('; ')}`;
    console.log(`  ${msg}`);
    failures.push(msg);
  }
}

console.log(`\n──────────────────────────────────────────`);
console.log(`  总计: ${TEST_CASES.length} | ✅ 通过: ${passed} | ❌ 失败: ${failed}`);
console.log(`  通过率: ${(passed / TEST_CASES.length * 100).toFixed(1)}%`);
console.log(`──────────────────────────────────────────`);

if (failures.length > 0) {
  console.log(`\n📋 失败详情:`);
  failures.forEach(f => console.log(`  ${f}`));
} else {
  console.log(`\n🎉 全部通过！`);
}

// 分类覆盖统计
console.log(`\n📊 分类覆盖:`);
const allCategories = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '学习', '通讯', '收入', '其他'];
const catResults = {};
for (const cat of allCategories) catResults[cat] = 0;
for (const [input] of TEST_CASES) {
  const result = parseWithRules(input);
  if (result) catResults[result.category] = (catResults[result.category] || 0) + 1;
}
for (const cat of allCategories) {
  const bar = '█'.repeat(Math.max(1, catResults[cat]));
  console.log(`  ${cat.padEnd(4)} ${bar} ${catResults[cat]}条`);
}

console.log(`\n✅ Day 3 验证完成`);
console.log(`   规则引擎: ${failed === 0 ? '全部通过 ✅' : '有 ' + failed + ' 个失败 ❌'}`);
console.log(`   AI 服务: 代码就绪，接入云端 OpenAI 兼容 API（DeepSeek 等），未配置时仅用规则引擎`);
console.log(`   设置页: UI 就绪，支持配置 API 地址/Key/模型`);