import type { BillSource } from '../../types';
import { cellByHeader } from './csv';
import { normalizeDateTime } from './xlsx';
import type { HeadlineInfo, NormalizedBillTx, SkippedRow, TxnDirection } from './types';

const DIRECTION_ALIASES: Record<string, TxnDirection> = {
  '支出': 'expense',
  '收入': 'income',
  '不计收支': 'neutral',
  '/': 'neutral',
  '': 'neutral',
};

const WECHAT_NEUTRAL_TYPES = [
  '零钱充值',
  '零钱提现',
  '信用卡还款',
  '转账到银行卡',
];

const ALIPAY_NEUTRAL_CATEGORIES = [
  '投资理财',
  '信用借还',
  '账户存取',
];

const GENERIC_ITEMS = new Set([
  '订单付款',
  '收钱码收款',
  '扫码支付',
  '二维码支付',
  '二维码收款',
  '收款方备注:二维码收款',
  '转账备注:微信转账',
  '商品交易',
]);

const AMOUNT_RE = /^-?\d+(?:\.\d{1,2})?$/;
const WECHAT_REFUND_RE = /已退款[（(]?\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*[)）]?/;

export function normalizeDirection(raw: string): TxnDirection {
  return DIRECTION_ALIASES[(raw ?? '').trim()] ?? 'neutral';
}

/** 金额转整数分；无法解析返回 null */
export function parseAmountToCents(raw: string): number | null {
  const s = (raw ?? '').replace(/[¥￥,，\s元]/g, '');
  if (!s || !AMOUNT_RE.test(s)) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return Math.round(Math.abs(v) * 100);
}

/** 微信「已退款(¥8.78)」里的退款额（分）；无则 0 */
export function parseWechatRefundCents(status: string): number {
  const m = WECHAT_REFUND_RE.exec(status ?? '');
  if (!m) return 0;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

export function hashText(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function cleanCell(s: string): string {
  return (s ?? '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanPart(s: string): string {
  const v = cleanCell(s);
  return v === '/' || v === '-' ? '' : v;
}

export function buildDescription(merchantRaw: string, itemRaw: string, typeRaw: string): string {
  // 旧版 CSV 导出/导入按逗号裸切，描述里的半角逗号换成全角，避免破坏自家 CSV 格式
  const merchant = cleanPart(merchantRaw).replace(/,/g, '，');
  const item = cleanPart(itemRaw).replace(/,/g, '，');
  const type = cleanPart(typeRaw).replace(/,/g, '，');

  if (!merchant && !item) return type || '账单消费';
  if (!merchant) return item;
  if (!item) return merchant;

  if (GENERIC_ITEMS.has(item)) return merchant;
  if (item.includes(merchant) || merchant.includes(item)) {
    return item.length >= merchant.length ? item : merchant;
  }
  return `${merchant} · ${item}`;
}

export function isWechatRefundRow(tx: NormalizedBillTx): boolean {
  return tx.billCategory.includes('退款') || tx.item.startsWith('退款-');
}

export function isAlipayRefundRow(tx: NormalizedBillTx): boolean {
  return tx.billCategory === '退款'
    || tx.item.startsWith('退款-')
    || (tx.direction === 'neutral' && tx.status.includes('退款'));
}

function isNeutralTransfer(tx: NormalizedBillTx): boolean {
  if (tx.source === 'wechat') return WECHAT_NEUTRAL_TYPES.some(t => tx.billCategory.includes(t));
  return ALIPAY_NEUTRAL_CATEGORIES.some(c => tx.billCategory.includes(c));
}

export function transactionFromRow(
  source: BillSource,
  header: string[],
  row: string[],
  index: number,
): NormalizedBillTx {
  const timeRaw = cellByHeader(header, row, ['交易时间']);
  const time = normalizeDateTime(timeRaw);
  const amountCents = parseAmountToCents(cellByHeader(header, row, ['金额(元)', '金额'])) ?? 0;
  const merchant = cleanCell(cellByHeader(header, row, ['交易对方']));
  const item = cleanCell(cellByHeader(header, row, ['商品说明', '商品']));
  const billCategory = cleanCell(cellByHeader(header, row, ['交易分类', '交易类型']));
  const status = cleanCell(cellByHeader(header, row, ['交易状态', '当前状态']));
  const paymentMethod = cleanCell(cellByHeader(header, row, ['收/付款方式', '支付方式']));
  const direction = normalizeDirection(cellByHeader(header, row, ['收/支']));
  const orderRaw = cellByHeader(header, row, ['交易订单号', '交易单号']).replace(/\s+/g, '');
  const externalId = orderRaw || `hash-${hashText(`${source}|${timeRaw}|${amountCents}|${merchant}|${item}|${index}`)}`;
  const description = buildDescription(merchant, item, billCategory);
  const raw = `[${source === 'wechat' ? '微信' : '支付宝'}] ${timeRaw} ${merchant} ${item} ${cellByHeader(header, row, ['金额(元)', '金额'])}`.trim();

  return {
    uid: `${source}:${externalId}`,
    source,
    externalId,
    time,
    date: time.slice(0, 10),
    direction,
    amountCents,
    merchant,
    item,
    description,
    billCategory,
    status,
    paymentMethod,
    raw,
  };
}

export function filterTransactions(
  source: BillSource,
  transactions: NormalizedBillTx[],
): { kept: NormalizedBillTx[]; skipped: SkippedRow[]; refunds: NormalizedBillTx[] } {
  const kept: NormalizedBillTx[] = [];
  const skipped: SkippedRow[] = [];
  const refunds: NormalizedBillTx[] = [];

  // 支付宝退款行：订单号形如「原订单号_INP... / _M... / _000A...」
  const refundByBase = new Map<string, number>();
  if (source === 'alipay') {
    for (const tx of transactions) {
      if (!isAlipayRefundRow(tx)) continue;
      const base = tx.externalId.split('_')[0];
      refundByBase.set(base, (refundByBase.get(base) ?? 0) + tx.amountCents);
    }
  }

  for (const tx of transactions) {
    if (!tx.time || !tx.date || tx.amountCents <= 0) {
      skipped.push({ tx, reason: 'invalid' });
      continue;
    }

    if (source === 'wechat' && isWechatRefundRow(tx)) {
      refunds.push(tx);
      continue;
    }
    if (source === 'alipay' && isAlipayRefundRow(tx)) {
      refunds.push(tx);
      continue;
    }

    if (tx.direction === 'income') {
      skipped.push({ tx, reason: 'income' });
      continue;
    }
    if (tx.direction === 'neutral') {
      skipped.push({ tx, reason: 'neutral' });
      continue;
    }

    if (isNeutralTransfer(tx)) {
      skipped.push({ tx, reason: 'neutral_transfer' });
      continue;
    }

    if (source === 'alipay' && tx.status.includes('交易关闭')) {
      skipped.push({ tx, reason: 'closed' });
      continue;
    }

    if (source === 'wechat' && tx.status.includes('已全额退款')) {
      skipped.push({ tx, reason: 'full_refund' });
      continue;
    }

    let netCents = tx.amountCents;
    if (source === 'wechat') {
      netCents -= parseWechatRefundCents(tx.status);
    } else {
      netCents -= refundByBase.get(tx.externalId) ?? 0;
    }

    if (netCents <= 0) {
      skipped.push({ tx, reason: 'full_refund' });
      continue;
    }

    kept.push(netCents === tx.amountCents ? tx : { ...tx, amountCents: netCents });
  }

  return { kept, skipped, refunds };
}

/** 从说明头里提取「共 N 笔记录 / 支出 X 笔 Y 元」 */
export function extractHeadline(rows: string[][], headerIndex: number): HeadlineInfo {
  const text = rows.slice(0, headerIndex).map(r => r.join(' ')).join('\n');
  const total = /共\s*(\d+)\s*笔记录/.exec(text);
  const expense = /支出[：:]\s*(\d+)\s*笔\s*([\d.]+)\s*元/.exec(text);
  const info: HeadlineInfo = {};
  if (total) info.totalRows = parseInt(total[1], 10);
  if (expense) {
    info.expenseRows = parseInt(expense[1], 10);
    info.expenseCents = Math.round(Number(expense[2]) * 100);
  }
  return info;
}
