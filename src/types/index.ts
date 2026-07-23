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
}