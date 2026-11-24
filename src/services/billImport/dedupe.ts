import type {
  ClassifiedBillTx,
  DedupeResult,
  DuplicateMatch,
  ExistingExpenseForDedupe,
} from './types';

const NOISE_RE = /订单付款|收钱码收款|扫码支付|商品交易|二维码支付|二维码收款|收款方备注|转账备注|微信转账|退款-/g;
const PUNCT_RE = /[\s\-_·:：,，.。()（）\[\]【】¥￥/]/g;

export function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(NOISE_RE, '').replace(PUNCT_RE, '');
}

export function dayDiff(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.MAX_SAFE_INTEGER;
  return Math.round(Math.abs(ta - tb) / 86400000);
}

export function longestCommonSubstring(a: string, b: string): number {
  if (!a || !b) return 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

function isSimilarDescription(tx: ClassifiedBillTx, existing: ExistingExpenseForDedupe): boolean {
  const merchant = normalizeForMatch(tx.merchant);
  const desc = normalizeForMatch(tx.description);
  const existingText = normalizeForMatch(`${existing.description ?? ''} ${existing.raw_input ?? ''}`);
  if (!existingText) return false;

  if (merchant.length >= 2 && existingText.includes(merchant)) return true;
  if (desc.length >= 2 && (existingText.includes(desc) || desc.includes(existingText))) return true;
  if (existingText.length >= 2 && merchant.includes(existingText)) return true;
  return merchant.length >= 2 && longestCommonSubstring(existingText, merchant) >= 4;
}

function sameCategory(tx: ClassifiedBillTx, existing: ExistingExpenseForDedupe): boolean {
  return existing.category_id === tx.categoryId || existing.category_name === tx.categoryName;
}

function isUncertain(tx: ClassifiedBillTx, existing: ExistingExpenseForDedupe): boolean {
  return tx.confidence === 'low' || tx.categoryName === '其他' || existing.category_name === '其他';
}

export interface DedupeOptions {
  externalIds: Set<string>;
  existing: ExistingExpenseForDedupe[];
}

export function dedupeTransactions(
  transactions: ClassifiedBillTx[],
  opts: DedupeOptions,
): DedupeResult {
  const exactUids = new Set<string>();
  const fileDuplicateUids = new Set<string>();
  const matches = new Map<string, DuplicateMatch>();
  const seenExternal = new Set<string>();

  const buckets = new Map<number, ExistingExpenseForDedupe[]>();
  for (const e of opts.existing) {
    if (e.category_type !== 'expense') continue;
    const cents = Math.round(e.amount * 100);
    const list = buckets.get(cents);
    if (list) list.push(e);
    else buckets.set(cents, [e]);
  }

  for (const tx of transactions) {
    if (seenExternal.has(tx.externalId)) {
      fileDuplicateUids.add(tx.uid);
      continue;
    }
    seenExternal.add(tx.externalId);

    if (opts.externalIds.has(tx.externalId)) {
      exactUids.add(tx.uid);
      continue;
    }

    const candidates = (buckets.get(tx.amountCents) ?? [])
      .filter(e => dayDiff(e.expense_date, tx.date) <= 1);

    let strong: { existing: ExistingExpenseForDedupe; reason: DuplicateMatch['reason']; score: number } | null = null;
    let weak: ExistingExpenseForDedupe | null = null;

    for (const existing of candidates) {
      const cat = sameCategory(tx, existing);
      const desc = isSimilarDescription(tx, existing);
      const uncertain = isUncertain(tx, existing);
      if (cat || desc || uncertain) {
        const reason: DuplicateMatch['reason'] = cat ? 'same_category' : desc ? 'similar_description' : 'uncertain_category';
        const score = (cat ? 4 : 0) + (desc ? 3 : 0) + (uncertain ? 1 : 0);
        if (!strong || score > strong.score) strong = { existing, reason, score };
      } else if (!weak) {
        weak = existing;
      }
    }

    if (strong) {
      matches.set(tx.uid, { level: 'strong', reason: strong.reason, existing: strong.existing });
    } else if (weak) {
      matches.set(tx.uid, { level: 'weak', reason: 'same_amount_date', existing: weak });
    }
  }

  return { exactUids, fileDuplicateUids, matches };
}
