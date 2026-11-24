import type { BillSource, ExpenseWithCategory } from '../../types';

export type TxnDirection = 'expense' | 'income' | 'neutral';

export type SkipReason =
  | 'income'
  | 'neutral'
  | 'closed'
  | 'full_refund'
  | 'refund'
  | 'refund_processed'
  | 'neutral_transfer'
  | 'invalid'
  | 'duplicate_exact'
  | 'duplicate_file';

export interface NormalizedBillTx {
  /** source + externalId，预览选择/去重时的稳定 key */
  uid: string;
  source: BillSource;
  externalId: string;
  /** YYYY-MM-DD HH:mm:ss（账单本地墙上时间） */
  time: string;
  /** YYYY-MM-DD */
  date: string;
  direction: TxnDirection;
  amountCents: number;
  merchant: string;
  item: string;
  description: string;
  /** 支付宝交易分类；微信为空字符串 */
  billCategory: string;
  status: string;
  paymentMethod: string;
  /** 原始行摘要，便于排查 */
  raw: string;
}

export interface SkippedRow {
  tx: NormalizedBillTx | null;
  reason: SkipReason;
  detail?: string;
}

export interface HeadlineInfo {
  totalRows?: number;
  expenseRows?: number;
  expenseCents?: number;
}

export interface ParseMeta {
  source: BillSource;
  fileName: string;
  totalRows: number;
  /** 原始 direction=expense 的行数（未过滤退款/关闭前） */
  rawExpenseRows: number;
  /** 原始 direction=expense 的金额合计（分） */
  rawExpenseCents: number;
  dateStart: string;
  dateEnd: string;
  headline: HeadlineInfo;
  warnings: string[];
}

export interface ParseResult {
  source: BillSource;
  fileName: string;
  meta: ParseMeta;
  /** 已过滤收入/关闭/退款/中性后的待导入支出 */
  transactions: NormalizedBillTx[];
  /** 退款行（含文件内已冲减的）；跨月冲减由页面层匹配 */
  refunds: NormalizedBillTx[];
  skipped: SkippedRow[];
}

export interface CrossMonthRefund {
  tx: NormalizedBillTx;
  target: ExpenseWithCategory;
  /** exact：支付宝原订单号命中；likely：商户/金额/日期唯一匹配；uncertain：需人工确认 */
  confidence: 'exact' | 'likely' | 'uncertain';
  alternatives: number;
}

export type CategoryConfidence = 'high' | 'low';

export interface ClassifiedBillTx extends NormalizedBillTx {
  categoryId: number;
  categoryName: string;
  confidence: CategoryConfidence;
}

export type DuplicateReason =
  | 'same_category'
  | 'similar_description'
  | 'uncertain_category'
  | 'same_amount_date';

export interface ExistingExpenseForDedupe {
  id: number;
  amount: number;
  category_id: number;
  category_name: string;
  category_type: 'expense' | 'income';
  description: string | null;
  raw_input: string | null;
  expense_date: string;
}

export interface DuplicateMatch {
  level: 'strong' | 'weak';
  reason: DuplicateReason;
  existing: ExistingExpenseForDedupe;
}

export interface DedupeResult {
  /** 已存在同来源同交易单号的 uid */
  exactUids: Set<string>;
  /** 同一文件内交易单号重复的 uid */
  fileDuplicateUids: Set<string>;
  matches: Map<string, DuplicateMatch>;
}

export const SOURCE_LABEL: Record<BillSource, string> = {
  wechat: '微信',
  alipay: '支付宝',
};

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  income: '收入',
  neutral: '不计收支',
  closed: '交易关闭',
  full_refund: '全额退款',
  refund: '退款（未匹配到原支出）',
  refund_processed: '该退款已冲减过',
  neutral_transfer: '中性交易（转账/理财/还款）',
  invalid: '金额或单号异常',
  duplicate_exact: '交易单号已存在',
  duplicate_file: '文件内重复',
};
