import type { ExpenseWithCategory } from '../../types';
import { dayDiff, longestCommonSubstring, normalizeForMatch } from './dedupe';
import type { NormalizedBillTx } from './types';

/** 支付宝退款单号形如 原订单号_INP... / _M...；WeChat 无原单号 */
export function refundBaseExternalId(tx: NormalizedBillTx): string {
  return tx.source === 'alipay' ? tx.externalId.split('_')[0] : '';
}

/** 退款是否已在当前文件里冲减过（原单也在本文件） */
export function isRefundInFile(refund: NormalizedBillTx, kept: NormalizedBillTx[]): boolean {
  if (refund.source === 'alipay') {
    const base = refundBaseExternalId(refund);
    return !!base && kept.some(tx => tx.externalId === base);
  }

  // 微信：部分退款的原单会以「已退款(¥X)」保留在 kept 里并按净额入账
  const merchant = normalizeForMatch(refund.merchant);
  if (!merchant) return false;
  return kept.some(tx => {
    if (!tx.status.includes('已退款') && !tx.status.includes('全额退款')) return false;
    if (dayDiff(tx.date, refund.date) > 3) return false;
    const m = /已退款[（(]?\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)/.exec(tx.status);
    if (m) {
      const refundedCents = Math.round(Number(m[1]) * 100);
      if (Number.isFinite(refundedCents) && Math.abs(refundedCents - refund.amountCents) > 1) return false;
    }
    const targetMerchant = normalizeForMatch(tx.merchant);
    if (!targetMerchant) return false;
    return targetMerchant.includes(merchant)
      || merchant.includes(targetMerchant)
      || longestCommonSubstring(targetMerchant, merchant) >= 3;
  });
}

export interface RefundTargetPick {
  target: ExpenseWithCategory;
  confidence: 'likely' | 'uncertain';
  alternatives: number;
  score: number;
}

/**
 * 给退款行找原支出：金额不能小于退款额、日期在退款之前（最多 180 天），
 * 主要靠商户/描述相似度，金额相同和日期近加分。
 */
export function scoreRefundTarget(refund: NormalizedBillTx, target: ExpenseWithCategory): number {
  if (target.category_type !== 'expense') return 0;
  const targetCents = Math.round(target.amount * 100);
  if (targetCents < refund.amountCents - 1) return 0;

  if (target.expense_date > refund.date) return 0;
  const diff = dayDiff(target.expense_date, refund.date);
  if (!Number.isFinite(diff) || diff > 180) return 0;

  const refundMerchant = normalizeForMatch(refund.merchant);
  const refundDesc = normalizeForMatch(refund.description);
  const targetText = normalizeForMatch(`${target.description ?? ''} ${target.raw_input ?? ''}`);
  if (!targetText) return 0;

  let score = 0;
  let semantic = 0;

  if (refundMerchant.length >= 2 && targetText.includes(refundMerchant)) semantic = Math.max(semantic, 60);
  if (refundDesc.length >= 2 && targetText.includes(refundDesc)) semantic = Math.max(semantic, 50);

  if (refundMerchant.length >= 2) {
    const lcs = longestCommonSubstring(targetText, refundMerchant);
    if (lcs >= 4) semantic = Math.max(semantic, 40);
    else if (lcs >= 3) semantic = Math.max(semantic, 25);
  }

  // 商户/描述完全对不上时不猜
  if (semantic === 0) return 0;
  score += semantic;

  if (targetCents === refund.amountCents) score += 15;
  else score += 5;

  if (diff <= 1) score += 20;
  else if (diff <= 7) score += 15;
  else if (diff <= 30) score += 10;
  else if (diff <= 90) score += 5;
  else score += 2;

  if (target.category_name === refund.billCategory) score += 5;

  return score;
}

export function pickRefundTarget(
  refund: NormalizedBillTx,
  candidates: ExpenseWithCategory[],
): RefundTargetPick | null {
  const scored = candidates
    .map(target => ({ target, score: scoreRefundTarget(refund, target) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || b.target.expense_date.localeCompare(a.target.expense_date));

  if (scored.length === 0) return null;
  const top = scored[0];
  if (top.score < 30) return null;

  const alternatives = scored.filter(x => x.score >= top.score - 10).length;
  const second = scored[1]?.score ?? 0;
  const confident = top.score >= 55 && (scored.length === 1 || top.score - second >= 15);
  return {
    target: top.target,
    confidence: confident ? 'likely' : 'uncertain',
    alternatives,
    score: top.score,
  };
}
