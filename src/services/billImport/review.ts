import type {
  ClassifiedBillTx,
  DedupeResult,
  DuplicateMatch,
} from './types';

export type ReviewReason = 'uncategorized' | 'weak_duplicate';

/**
 * 是否需要人工看一眼分类。
 * 「其他」与低置信度取并集：自定义规则映射到「其他」时是 high；
 * 用户删掉「其他」分类后 fallback 到首个支出分类则是 low 但名字不是「其他」。
 */
export function isUncategorized(
  tx: Pick<ClassifiedBillTx, 'categoryName' | 'confidence'>,
): boolean {
  return tx.categoryName === '其他' || tx.confidence === 'low';
}

/** 只回答「为什么需要人工确认」，不判断可导入性；strong 归疑似重复 tab。 */
export function reviewReason(
  tx: Pick<ClassifiedBillTx, 'categoryName' | 'confidence'>,
  match?: Pick<DuplicateMatch, 'level'> | null,
): ReviewReason | null {
  if (match?.level === 'strong') return null;
  if (isUncategorized(tx)) return 'uncategorized';
  if (match?.level === 'weak') return 'weak_duplicate';
  return null;
}

/** 待确认 = 可导入（排除 exact / 文件内重复 / strong）且（未分类 或 弱疑似重复）。 */
export function selectReviewTxs(
  txs: readonly ClassifiedBillTx[],
  dupe: Pick<DedupeResult, 'exactUids' | 'fileDuplicateUids' | 'matches'>,
): ClassifiedBillTx[] {
  return txs.filter(tx => {
    if (dupe.exactUids.has(tx.uid) || dupe.fileDuplicateUids.has(tx.uid)) return false;
    return reviewReason(tx, dupe.matches.get(tx.uid)) !== null;
  });
}
