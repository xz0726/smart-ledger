/**
 * 支付类通知文本解析器（纯本地，不上传）。
 * 把支付宝 / 微信通知的标题+正文解析为方向与金额；解析不出金额也返回原文（待确认列表里人工补）。
 * Hermes 约束：编号捕获组 + RegExp.exec，禁命名捕获组 / matchAll。
 */
export interface PaymentParseResult {
  source: 'alipay' | 'wechat';
  direction: 'expense' | 'income';
  amount: number | null;
  raw: string;
  /** 退款等不入账的文本（直接跳过捕获） */
  refunded: boolean;
}

const INCOME_WORDS = ['收款', '到账', '入账', '收钱', '收到付款'];
const EXPENSE_WORDS = ['付款', '支付成功', '支付', '扣款', '消费'];
const REFUND_WORDS = ['退款', '退回', '退钱'];

/** 货币上下文锚定的金额：要求 ¥/￥ 前缀或「元」后缀，避免把日期/序号当金额 */
const AMOUNT_RE = /(?:[¥￥]|金额\s*|RMB\s*)(\d+(?:\.\d{1,2})?)(?!\d)|(\d+(?:\.\d{1,2})?)\s*元/g;

/** 支付关键词（与原生层过滤一致，双保险） */
const PAYMENT_WORDS = ['支付', '付款', '收款', '到账', '扣款', '交易'];

export function isPaymentNotification(title?: string, text?: string): boolean {
  const full = `${title ?? ''} ${text ?? ''}`;
  return PAYMENT_WORDS.some(w => full.includes(w));
}

export function parsePaymentText(source: 'alipay' | 'wechat', title: string | null | undefined, text: string | null | undefined): PaymentParseResult {
  const raw = `${title ?? ''} ${text ?? ''}`.trim();
  const refunded = REFUND_WORDS.some(w => raw.includes(w));

  // 方向：收入词优先级高于支出词（「收款到账」不含「付款」歧义；「微信支付」是品牌词不算方向）
  let direction: 'expense' | 'income' = 'expense';
  if (INCOME_WORDS.some(w => raw.includes(w))) direction = 'income';
  else if (EXPENSE_WORDS.some(w => raw.includes(w))) direction = 'expense';
  else if (raw.includes('转账')) direction = 'expense';

  let amount: number | null = null;
  // exec 循环取第一个合法金额（排除 0 与异常大数）
  let m: RegExpExecArray | null;
  AMOUNT_RE.lastIndex = 0;
  while ((m = AMOUNT_RE.exec(raw)) !== null) {
    const v = parseFloat(m[1] || m[2]);
    if (!isNaN(v) && v > 0 && v < 100000000) { amount = v; break; }
  }

  return { source, direction, amount, raw, refunded };
}
