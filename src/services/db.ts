import * as SQLite from 'expo-sqlite';
import type { Category, Expense, ExpenseWithCategory, Budget, BudgetWithCategory, StatsOverview, CategoryStats, DailyTrend } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    try {
      db = SQLite.openDatabaseSync('smartledger.db');
      migrate(db);
      seedCategories(db);
    } catch (e) {
      console.error('Failed to open database:', e);
      throw e;
    }
  }
  return db;
}

// ===================== 建表迁移 =====================

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      icon        TEXT DEFAULT '📦',
      color       TEXT DEFAULT '#6366f1',
      type        TEXT DEFAULT 'expense',
      is_default  INTEGER DEFAULT 1,
      parent_id   INTEGER REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      amount      REAL NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      description TEXT,
      raw_input   TEXT,
      expense_date TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id),
      amount      REAL NOT NULL,
      period      TEXT DEFAULT 'monthly',
      month       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
  `);
}

// ===================== 种子分类 =====================

async function seedCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  // 清理重复：保留每个名称中 id 最小的那条
  db.runSync(
    `DELETE FROM categories WHERE id NOT IN (
      SELECT MIN(id) FROM categories GROUP BY name
    ) AND is_default = 1`
  );

  const defaults = [
    ['🍔', '餐饮', '#f97316', 'expense'],
    ['🚇', '交通', '#3b82f6', 'expense'],
    ['🛒', '购物', '#ec4899', 'expense'],
    ['🎮', '娱乐', '#8b5cf6', 'expense'],
    ['🏠', '居住', '#14b8a6', 'expense'],
    ['💊', '医疗', '#ef4444', 'expense'],
    ['📚', '学习', '#06b6d4', 'expense'],
    ['💬', '通讯', '#6366f1', 'expense'],
    ['💰', '收入', '#22c55e', 'income'],
    ['✏️', '其他', '#64748b', 'expense'],
  ];

  for (const [icon, name, color, type] of defaults) {
    db.runSync(
      'INSERT OR IGNORE INTO categories (icon, name, color, type, is_default) VALUES (?, ?, ?, ?, 1)',
      [icon, name, color, type]
    );
  }
}

// ===================== 消费记录 CRUD =====================

export async function addExpense(
  amount: number,
  categoryId: number,
  expenseDate: string,
  description?: string,
  rawInput?: string
): Promise<number> {
  const database = getDb();
  const result = database.runSync(
    'INSERT INTO expenses (amount, category_id, description, raw_input, expense_date) VALUES (?, ?, ?, ?, ?)',
    [amount, categoryId, description || null, rawInput || null, expenseDate]
  );
  return result.lastInsertRowId;
}

export async function getExpenses(params: {
  month?: string;
  categoryId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: ExpenseWithCategory[]; total: number }> {
  const database = getDb();
  const { month, categoryId, search, page = 1, pageSize = 50 } = params;

  let where = 'WHERE 1=1';
  const values: any[] = [];

  if (month) {
    where += ' AND e.expense_date LIKE ?';
    values.push(`${month}%`);
  }
  if (categoryId) {
    where += ' AND e.category_id = ?';
    values.push(categoryId);
  }
  if (search) {
    where += ' AND (e.description LIKE ? OR e.raw_input LIKE ?)';
    values.push(`%${search}%`, `%${search}%`);
  }

  const countResult = database.getFirstSync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM expenses e ${where}`,
    values
  );
  const total = countResult?.cnt || 0;

  const offset = (page - 1) * pageSize;
  const rows = database.getAllSync<ExpenseWithCategory>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
     FROM expenses e
     LEFT JOIN categories c ON e.category_id = c.id
     ${where}
     ORDER BY e.expense_date DESC, e.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset]
  );

  return { data: rows, total };
}

export async function deleteExpense(id: number): Promise<void> {
  const database = getDb();
  database.runSync('DELETE FROM expenses WHERE id = ?', [id]);
}

export async function updateExpense(
  id: number,
  updates: { amount?: number; categoryId?: number; description?: string; expenseDate?: string }
): Promise<void> {
  const database = getDb();
  const set: string[] = [];
  const values: any[] = [];

  if (updates.amount !== undefined) { set.push('amount = ?'); values.push(updates.amount); }
  if (updates.categoryId !== undefined) { set.push('category_id = ?'); values.push(updates.categoryId); }
  if (updates.description !== undefined) { set.push('description = ?'); values.push(updates.description); }
  if (updates.expenseDate !== undefined) { set.push('expense_date = ?'); values.push(updates.expenseDate); }

  if (set.length === 0) return;
  values.push(id);
  database.runSync(`UPDATE expenses SET ${set.join(', ')} WHERE id = ?`, values);
}

// ===================== 分类管理 =====================

export async function getCategories(type?: 'expense' | 'income'): Promise<Category[]> {
  const database = getDb();
  let sql = 'SELECT * FROM categories';
  const values: string[] = [];
  if (type) {
    sql += ' WHERE type = ?';
    values.push(type);
  }
  sql += ' ORDER BY is_default DESC, id ASC';
  return database.getAllSync<Category>(sql, values);
}

export async function getCategoryByName(name: string): Promise<Category | null> {
  const database = getDb();
  return database.getFirstSync<Category>(
    'SELECT * FROM categories WHERE name = ? LIMIT 1',
    [name]
  );
}

export async function addCategory(name: string, icon: string, color: string, type: 'expense' | 'income'): Promise<number> {
  const database = getDb();
  const result = database.runSync(
    'INSERT INTO categories (name, icon, color, type, is_default) VALUES (?, ?, ?, ?, 0)',
    [name, icon, color, type]
  );
  return result.lastInsertRowId;
}

export async function deleteCategory(id: number): Promise<void> {
  const database = getDb();
  // 只允许删除自定义分类（is_default=0）
  database.runSync(
    'DELETE FROM categories WHERE id = ? AND is_default = 0',
    [id]
  );
}

// ===================== 预算管理 =====================

export async function getBudgets(month: string): Promise<BudgetWithCategory[]> {
  const database = getDb();
  return database.getAllSync<BudgetWithCategory>(
    `SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
            COALESCE(SUM(e.amount), 0) as spent
     FROM budgets b
     LEFT JOIN categories c ON b.category_id = c.id
     LEFT JOIN expenses e ON e.category_id = b.category_id AND e.expense_date LIKE ?
     WHERE b.month = ?
     GROUP BY b.id
     ORDER BY spent DESC`,
    [`${month}%`, month]
  );
}

export async function setBudget(categoryId: number, amount: number, month: string, period: 'monthly' | 'weekly' = 'monthly'): Promise<void> {
  const database = getDb();
  const existing = database.getFirstSync<{ id: number }>(
    'SELECT id FROM budgets WHERE category_id = ? AND month = ?',
    [categoryId, month]
  );
  if (existing) {
    database.runSync(
      'UPDATE budgets SET amount = ?, period = ? WHERE id = ?',
      [amount, period, existing.id]
    );
  } else {
    database.runSync(
      'INSERT INTO budgets (category_id, amount, period, month) VALUES (?, ?, ?, ?)',
      [categoryId, amount, period, month]
    );
  }
}

export async function deleteBudget(categoryId: number, month: string): Promise<void> {
  const database = getDb();
  database.runSync(
    'DELETE FROM budgets WHERE category_id = ? AND month = ?',
    [categoryId, month]
  );
}

// ===================== 统计查询 =====================

export async function getStatsOverview(month: string, prevMonth: string): Promise<StatsOverview> {
  const database = getDb();

  const current = database.getFirstSync<{ total: number; cnt: number }>(
    `SELECT COALESCE(SUM(e.amount), 0) as total, COUNT(*) as cnt
     FROM expenses e JOIN categories c ON e.category_id = c.id
     WHERE e.expense_date LIKE ? AND c.type = 'expense'`,
    [`${month}%`]
  );

  const currentIncome = database.getFirstSync<{ total: number }>(
    `SELECT COALESCE(SUM(e.amount), 0) as total
     FROM expenses e JOIN categories c ON e.category_id = c.id
     WHERE e.expense_date LIKE ? AND c.type = 'income'`,
    [`${month}%`]
  );

  const previous = database.getFirstSync<{ total: number }>(
    `SELECT COALESCE(SUM(e.amount), 0) as total
     FROM expenses e JOIN categories c ON e.category_id = c.id
     WHERE e.expense_date LIKE ? AND c.type = 'expense'`,
    [`${prevMonth}%`]
  );

  const total = current?.total || 0;
  const cnt = current?.cnt || 0;
  const prevTotal = previous?.total || 0;
  const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();

  return {
    totalExpense: total,
    totalIncome: currentIncome?.total || 0,
    dailyAverage: cnt > 0 ? total / daysInMonth : 0,
    monthOverMonth: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0,
    recordCount: cnt,
  };
}

export async function getCategoryStats(month: string): Promise<CategoryStats[]> {
  const database = getDb();
  const stats = database.getAllSync<CategoryStats>(
    `SELECT c.id as category_id, c.name as category_name, c.icon as category_icon, c.color as category_color,
            COALESCE(SUM(e.amount), 0) as total, COUNT(e.id) as count
     FROM categories c
     LEFT JOIN expenses e ON e.category_id = c.id AND e.expense_date LIKE ?
     WHERE c.type = 'expense'
     GROUP BY c.id
     ORDER BY total DESC`,
    [`${month}%`]
  );

  const grandTotal = stats.reduce((sum, s) => sum + s.total, 0);
  return stats.map(s => ({
    ...s,
    percentage: grandTotal > 0 ? (s.total / grandTotal) * 100 : 0,
  }));
}

export async function getDailyTrend(month: string): Promise<DailyTrend[]> {
  const database = getDb();
  const rows = database.getAllSync<DailyTrend>(
    `SELECT e.expense_date as date, COALESCE(SUM(e.amount), 0) as amount
     FROM expenses e JOIN categories c ON e.category_id = c.id
     WHERE e.expense_date LIKE ? AND c.type = 'expense'
     GROUP BY e.expense_date
     ORDER BY e.expense_date ASC`,
    [`${month}%`]
  );
  return rows;
}

// ===================== 设置管理 =====================

export async function getSetting(key: string): Promise<string | null> {
  const database = getDb();
  const row = database.getFirstSync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = getDb();
  database.runSync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

// ===================== 备份恢复 =====================

export interface BackupData {
  version: string;
  exportedAt: string;
  categories: Category[];
  expenses: Expense[];
  budgets: Budget[];
  settings: { key: string; value: string }[];
}

export async function exportAllData(): Promise<BackupData> {
  const database = getDb();

  const categories = database.getAllSync<Category>('SELECT * FROM categories');
  const expenses = database.getAllSync<Expense>('SELECT * FROM expenses ORDER BY expense_date DESC');
  const budgets = database.getAllSync<Budget>('SELECT * FROM budgets');
  const settings = database.getAllSync<{ key: string; value: string }>('SELECT * FROM settings');

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    categories,
    expenses,
    budgets,
    settings,
  };
}

export async function importAllData(data: BackupData): Promise<{ imported: number; skipped: number }> {
  const database = getDb();

  // 导入设置
  for (const s of data.settings || []) {
    database.runSync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [s.key, s.value]
    );
  }

  // 导入分类（跳过已存在的默认分类）
  const existingCategories = database.getAllSync<Category>('SELECT * FROM categories');
  const existingNames = new Set(existingCategories.map(c => c.name));
  let imported = 0;
  let skipped = 0;

  for (const cat of data.categories || []) {
    if (existingNames.has(cat.name)) {
      skipped++;
      continue;
    }
    database.runSync(
      'INSERT INTO categories (name, icon, color, type, is_default) VALUES (?, ?, ?, ?, 0)',
      [cat.name, cat.icon, cat.color, cat.type]
    );
    existingNames.add(cat.name);
    imported++;
  }

  // 导入消费记录
  for (const exp of data.expenses || []) {
    database.runSync(
      'INSERT INTO expenses (amount, category_id, description, raw_input, expense_date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [exp.amount, exp.category_id, exp.description, exp.raw_input, exp.expense_date, exp.created_at]
    );
    imported++;
  }

  // 导入预算
  for (const b of data.budgets || []) {
    database.runSync(
      'INSERT OR REPLACE INTO budgets (category_id, amount, period, month) VALUES (?, ?, ?, ?)',
      [b.category_id, b.amount, b.period, b.month]
    );
  }

  return { imported, skipped };
}