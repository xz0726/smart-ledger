export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  type: 'expense' | 'income';
  is_default: number;
  parent_id: number | null;
}

export interface Expense {
  id: number;
  amount: number;
  category_id: number;
  description: string | null;
  raw_input: string | null;
  expense_date: string; // YYYY-MM-DD
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
  period: 'monthly' | 'weekly';
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