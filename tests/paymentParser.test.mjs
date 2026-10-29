/**
 * 支付通知解析器测试（paymentParser.ts 的纯 JS 镜像）
 * 用例覆盖：支付宝付款/收款、微信支付、无金额通知、退款跳过、噪音过滤、金额边界
 */
import { describe, test, assertEquals, assert } from './run.mjs';

// ===== 镜像（与 src/services/paymentParser.ts 保持同步）=====

const INCOME_WORDS = ['收款', '到账', '入账', '收钱', '收到付款'];
const EXPENSE_WORDS = ['付款', '支付成功', '支付', '扣款', '消费'];
const REFUND_WORDS = ['退款', '退回', '退钱'];
const AMOUNT_RE = /(?:[¥￥]|金额\s*|RMB\s*)(\d+(?:\.\d{1,2})?)(?!\d)|(\d+(?:\.\d{1,2})?)\s*元/g;
const PAYMENT_WORDS = ['支付', '付款', '收款', '到账', '扣款', '交易'];

function isPaymentNotification(title, text) {
  const full = `${title ?? ''} ${text ?? ''}`;
  return PAYMENT_WORDS.some(w => full.includes(w));
}

function parsePaymentText(source, title, text) {
  const raw = `${title ?? ''} ${text ?? ''}`.trim();
  const refunded = REFUND_WORDS.some(w => raw.includes(w));
  let direction = 'expense';
  if (INCOME_WORDS.some(w => raw.includes(w))) direction = 'income';
  else if (EXPENSE_WORDS.some(w => raw.includes(w))) direction = 'expense';
  else if (raw.includes('转账')) direction = 'expense';
  let amount = null;
  let m;
  AMOUNT_RE.lastIndex = 0;
  while ((m = AMOUNT_RE.exec(raw)) !== null) {
    const v = parseFloat(m[1] || m[2]);
    if (!isNaN(v) && v > 0 && v < 100000000) { amount = v; break; }
  }
  return { source, direction, amount, raw, refunded };
}

// ===== 用例 =====

describe('支付通知关键词过滤', () => {
  test('支付类通知命中', () => {
    assert(isPaymentNotification('支付宝', '成功付款¥35.00'));
    assert(isPaymentNotification('微信支付', '微信支付凭证'));
    assert(isPaymentNotification(null, '收款到账 88元'));
  });
  test('噪音通知不命中（验证码/私聊/快递）', () => {
    assert(!isPaymentNotification('系统', '您的验证码是 123456'));
    assert(!isPaymentNotification('妈妈', '今晚回家吃饭吗'));
    assert(!isPaymentNotification('快递', '您的包裹已到驿站'));
  });
});

describe('金额提取', () => {
  test('¥ 前缀', () => {
    assertEquals(parsePaymentText('alipay', '支付宝', '成功付款¥35.00').amount, 35.0);
  });
  test('全角￥', () => {
    assertEquals(parsePaymentText('alipay', null, '已支付￥12.5').amount, 12.5);
  });
  test('「金额」后缀', () => {
    assertEquals(parsePaymentText('alipay', null, '支付成功 金额 128').amount, 128);
  });
  test('「元」后缀', () => {
    assertEquals(parsePaymentText('wechat', null, '收款 88元 已到账').amount, 88);
  });
  test('无货币上下文的数字不误判（日期/年份）', () => {
    assertEquals(parsePaymentText('alipay', null, '支付宝通知 2026年10月29日 交易成功').amount, null);
  });
  test('整数金额', () => {
    assertEquals(parsePaymentText('wechat', null, '已支付 ¥200').amount, 200);
  });
});

describe('方向判定', () => {
  test('付款 → expense', () => {
    assertEquals(parsePaymentText('alipay', '支付宝', '成功付款¥35.00').direction, 'expense');
  });
  test('收款到账 → income', () => {
    assertEquals(parsePaymentText('wechat', null, '收款到账 88元').direction, 'income');
  });
  test('收入词优先（收款文案不因「支付」品牌词判成支出）', () => {
    assertEquals(parsePaymentText('wechat', '微信支付', '收款¥50.00 已到账').direction, 'income');
  });
});

describe('退款与噪音', () => {
  test('退款标记 refunded，调用方跳过', () => {
    const r = parsePaymentText('alipay', null, '退款¥35.00 已退回');
    assert(r.refunded);
  });
  test('无金额通知也返回原文（列表里人工补）', () => {
    const r = parsePaymentText('wechat', '微信支付', '微信支付凭证');
    assertEquals(r.amount, null);
    assertEquals(r.raw, '微信支付 微信支付凭证');
    assertEquals(r.direction, 'expense');
  });
});
