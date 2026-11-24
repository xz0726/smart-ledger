export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  type: 'expense' | 'income';
  is_default: number;
  parent_id: number | null;
}

export type BillSource = 'wechat' | 'alipay';

export interface Expense {
  id: number;
  amount: number;
  category_id: number;
  description: string | null;
  raw_input: string | null;
  expense_date: string; // YYYY-MM-DD
  created_at: string;
  /** 账单导入来源；手工记账为 null */
  source?: BillSource | null;
  /** 账单交易单号，用于精确去重 */
  external_id?: string | null;
  /** 导入批次 id，用于整批撤销 */
  import_batch_id?: string | null;
}

export interface ImportBatch {
  id: string;
  source: BillSource;
  file_name: string;
  total_rows: number;
  imported_count: number;
  skipped_count: number;
  /** 跨月退款冲减的原账目笔数 */
  adjusted_count?: number;
  created_at: string;
}

export interface ImportAdjustment {
  id: number;
  batch_id: string;
  expense_id: number;
  source: BillSource;
  refund_external_id: string;
  /** 被冲减账目的原始行 JSON，撤销时用于恢复金额/重建已删除账目 */
  snapshot: string;
  /** 冲减后的金额；null 表示原账目被全额退款删除 */
  new_amount: number | null;
  created_at: string;
}

export interface ExpenseWithCategory extends Expense {
  category_name: string;
  category_icon: string;
  category_color: string;
  category_type: 'expense' | 'income';
}

export interface Budget {
  id: number;
  category_id: number;
  amount: number;
  period: 'monthly' | 'weekly' | 'yearly';
  month: string; // YYYY-MM
}

export interface BudgetWithCategory extends Budget {
  category_name: string;
  category_icon: string;
  category_color: string;
  spent: number;
}

export interface StatsOverview {
  totalExpense: number;
  totalIncome: number;
  dailyAverage: number;
  monthOverMonth: number; // 环比百分比
  recordCount: number;
  hasPrevData: boolean; // 上月是否有支出数据（区分「环比 0%」与「无上月数据」）
}

export interface CategoryStats {
  category_id: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  total: number;
  percentage: number;
  count: number;
}

export interface DailyTrend {
  date: string;
  amount: number;
}

export interface AIConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

export interface ParsedExpense {
  amount: number;
  category: string;
  description: string;
  date: string;
  /** 该条记录对应的原始输入片段（规则引擎多项切分时为单个段，AI 路径不填） */
  rawInput?: string;
}

export interface CustomRule {
  id: number;
  keyword: string;
  category: string;
  created_at?: string;
}

export interface FixedItem {
  id: number;
  name: string;
  type: 'expense' | 'income';
  category_id: number;
  amount: number;
  frequency: 'daily' | 'workday' | 'weekly' | 'monthly';
  weekday: number | null;      // 0-6（周日=0），weekly 使用
  day_of_month: number | null; // 1-31，monthly 使用
  enabled: number;
  created_at: string;
}

export interface FixedItemWithCategory extends FixedItem {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

export interface QuickItem {
  id: number;
  name: string;
  category_id: number;
  amount: number;
  created_at: string;
}

export interface QuickItemWithCategory extends QuickItem {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

/** 通知捕获的支付类通知（待人工确认入账） */
export interface PendingCapture {
  id: number;
  source: 'alipay' | 'wechat';
  title: string;
  text: string;
  amount: number | null;
  direction: 'expense' | 'income';
  status: 'pending' | 'confirmed' | 'ignored';
  created_at: string;
}