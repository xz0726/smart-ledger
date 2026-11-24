import * as SQLite from 'expo-sqlite';
import type { Category, Expense, ExpenseWithCategory, Budget, BudgetWithCategory, StatsOverview, CategoryStats, DailyTrend, CustomRule, FixedItem, FixedItemWithCategory, QuickItemWithCategory, PendingCapture, BillSource, ImportBatch, ImportAdjustment } from '../types';
import { isCurrentMonth } from '../utils/format';

const FIXED_PREFIX = '[固定]';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    try {
      db = SQLite.openDatabaseSync('smartledger.db');
      migrate(db);
      seedCategories(db);
      if (__DEV__) seedDemoData(db);
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

    CREATE TABLE IF NOT EXISTS custom_rules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword    TEXT NOT NULL UNIQUE,
      category   TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS fixed_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'expense',
      category_id  INTEGER REFERENCES categories(id),
      amount       REAL NOT NULL,
      frequency    TEXT NOT NULL DEFAULT 'monthly',
      weekday      INTEGER,
      day_of_month INTEGER,
      enabled      INTEGER DEFAULT 1,
      created_at   TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS quick_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      amount      REAL NOT NULL,
      created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

    CREATE TABLE IF NOT EXISTS pending_captures (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source      TEXT NOT NULL,
      title       TEXT DEFAULT '',
      text        TEXT DEFAULT '',
      amount      REAL,
      direction   TEXT NOT NULL DEFAULT 'expense',
      status      TEXT NOT NULL DEFAULT 'pending',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id             TEXT PRIMARY KEY,
      source         TEXT NOT NULL,
      file_name      TEXT NOT NULL,
      total_rows     INTEGER NOT NULL,
      imported_count INTEGER NOT NULL,
      skipped_count  INTEGER NOT NULL,
      adjusted_count INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS import_adjustments (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id           TEXT NOT NULL,
      expense_id         INTEGER NOT NULL,
      source             TEXT NOT NULL,
      refund_external_id TEXT NOT NULL,
      snapshot           TEXT NOT NULL,
      new_amount         REAL,
      created_at         TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 账单导入字段：老库没有版本表，按列存在性补 ALTER
  const cols = db.getAllSync<{ name: string }>('PRAGMA table_info(expenses)');
  const names = new Set(cols.map(c => c.name));
  if (!names.has('source')) db.execSync('ALTER TABLE expenses ADD COLUMN source TEXT');
  if (!names.has('external_id')) db.execSync('ALTER TABLE expenses ADD COLUMN external_id TEXT');
  if (!names.has('import_batch_id')) db.execSync('ALTER TABLE expenses ADD COLUMN import_batch_id TEXT');
  db.execSync('CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_external ON expenses(source, external_id) WHERE external_id IS NOT NULL');
  db.execSync('CREATE INDEX IF NOT EXISTS idx_expenses_import_batch ON expenses(import_batch_id)');

  const batchCols = db.getAllSync<{ name: string }>('PRAGMA table_info(import_batches)');
  if (!batchCols.some(c => c.name === 'adjusted_count')) {
    db.execSync('ALTER TABLE import_batches ADD COLUMN adjusted_count INTEGER NOT NULL DEFAULT 0');
  }
  db.execSync('CREATE UNIQUE INDEX IF NOT EXISTS idx_import_adjustments_refund ON import_adjustments(source, refund_external_id)');
  db.execSync('CREATE INDEX IF NOT EXISTS idx_import_adjustments_batch ON import_adjustments(batch_id)');
  db.execSync('CREATE INDEX IF NOT EXISTS idx_import_adjustments_expense ON import_adjustments(expense_id)');
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

// ===================== 演示数据种子（仅 __DEV__） =====================

const DEMO_SEED_KEY = 'demo_seed_v1';

// 临时覆盖开关：true 时每次启动清空业务表并重新注入演示数据（无线调试用，看完记得关回 false）
const DEMO_SEED_FORCE = true;

/**
 * 无线调试用演示数据：仅 __DEV__（Expo Go / 开发包）执行，生产 APK 不进入。
 * 幂等守卫：settings 里已有 demo_seed_v1 标记，或账本已有任何账单 → 跳过（绝不混入真实数据）。
 * 只写业务表，不碰 ai_api_url / ai_api_key / ai_model 等 AI 配置键。
 */
function seedDemoData(db: SQLite.SQLiteDatabase): void {
  try {
    const marked = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [DEMO_SEED_KEY]);
    if (marked && !DEMO_SEED_FORCE) return;
    const cnt = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM expenses')?.cnt || 0;
    db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [DEMO_SEED_KEY, '1']);
    if (cnt > 0 && !DEMO_SEED_FORCE) return; // 已有真实数据：只落标记，不再注入

    const catId = (name: string): number =>
      db.getFirstSync<{ id: number }>('SELECT id FROM categories WHERE name = ?', [name])?.id ?? 0;
    const food = catId('餐饮'), transport = catId('交通'), shopping = catId('购物'),
      fun = catId('娱乐'), housing = catId('居住'), medical = catId('医疗'),
      study = catId('学习'), telecom = catId('通讯'), income = catId('收入'), other = catId('其他');

    const p = (n: number) => n.toString().padStart(2, '0');
    const now = new Date();
    const monthDate = (day: number) => Math.min(day, now.getDate()); // 不写未来日期
    const day = (offsetDaysAgo: number) => {
      const d = new Date(); d.setDate(d.getDate() - offsetDaysAgo);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const md = (dayOfMonth: number) => `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(monthDate(dayOfMonth))}`;
    const prev = new Date(); prev.setMonth(prev.getMonth() - 1);
    const pd = (dayOfMonth: number) => `${prev.getFullYear()}-${p(prev.getMonth() + 1)}-${p(dayOfMonth)}`;
    const ts = (date: string) => `${date} 12:00:00`;
    const add = (amount: number, categoryId: number, date: string, desc: string, raw?: string) =>
      db.runSync('INSERT INTO expenses (amount, category_id, description, raw_input, expense_date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [amount, categoryId, desc, raw ?? desc, date, ts(date)]);

    db.withTransactionSync(() => {
      if (DEMO_SEED_FORCE) {
        // 覆盖模式：清空业务表与非默认分类，从干净状态注入（settings 全保留，含 AI 配置）
        db.runSync('DELETE FROM expenses');
        db.runSync('DELETE FROM budgets');
        db.runSync('DELETE FROM fixed_items');
        db.runSync('DELETE FROM quick_items');
        db.runSync('DELETE FROM custom_rules');
        db.runSync('DELETE FROM categories WHERE is_default = 0');
        db.runSync("DELETE FROM sqlite_sequence WHERE name IN ('expenses','budgets','fixed_items','quick_items','custom_rules','categories')");
      }
      // 上月（供环比）
      add(1680, housing, pd(1), '房租');
      add(620, food, pd(3), '上月餐费');
      add(260, shopping, pd(8), '上月购物');
      add(95, fun, pd(15), '上月娱乐');
      add(8800, income, pd(10), '上月工资');

      // 本月：跨天分布（趋势图）+ 今天（麻辣烫/地铁）
      add(12, food, md(1), '早餐豆浆油条');
      add(28, food, md(2), '午餐黄焖鸡');
      add(4, transport, md(2), '地铁通勤');
      add(35, food, md(3), '晚餐外卖');
      add(199, shopping, md(3), '卫衣');
      add(45, study, md(4), '技术书籍');
      add(16, food, md(5), '瑞幸咖啡', '瑞幸 16元');
      add(9.9, fun, md(6), '视频会员');
      add(58, medical, md(7), '感冒药');
      add(32, food, md(8), '火锅');
      add(6, transport, md(9), '公交');
      add(129, shopping, md(10), '运动鞋垫');
      add(22, food, md(11), '面馆');
      add(30, telecom, md(12), '话费充值');
      add(18, food, md(13), '奶茶');
      add(76, fun, md(14), '电影票');
      add(14, food, md(15), '煎饼果子');
      add(240, shopping, md(16), '日用品囤货');
      add(5, transport, md(17), '共享单车');
      add(42, food, md(18), '烧烤');
      add(88, study, md(19), '网课');
      add(26, food, md(20), '寿司');
      add(12, transport, md(21), '打车');
      add(36, food, day(1), '午餐拌饭');
      add(120, income, day(2), '稿费');
      add(23.5, food, day(0), '晚餐麻辣烫');
      add(3.5, transport, day(0), '地铁');
      add(8800, income, md(10), '工资');

      // 预算：购物超支（红）、餐饮预警线上（进度条演示）
      db.runSync('INSERT INTO budgets (category_id, amount, period, month) VALUES (?, ?, ?, ?)', [shopping, 300, 'monthly', `${now.getFullYear()}-${p(now.getMonth() + 1)}`]);
      db.runSync('INSERT INTO budgets (category_id, amount, period, month) VALUES (?, ?, ?, ?)', [food, 800, 'monthly', `${now.getFullYear()}-${p(now.getMonth() + 1)}`]);

      // 固定收支：房租每月 1 日（syncFixedItems 启动时自动补生成当月账单）
      db.runSync('INSERT INTO fixed_items (name, type, category_id, amount, frequency, weekday, day_of_month) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['房租', 'expense', housing, 1800, 'monthly', null, 1]);

      // 快捷记账
      db.runSync('INSERT INTO quick_items (name, category_id, amount) VALUES (?, ?, ?)', ['早餐', food, 8]);
      db.runSync('INSERT INTO quick_items (name, category_id, amount) VALUES (?, ?, ?)', ['地铁', transport, 4]);
      db.runSync('INSERT INTO quick_items (name, category_id, amount) VALUES (?, ?, ?)', ['咖啡', other, 15]);

      // 自定义关键词规则
      db.runSync('INSERT OR REPLACE INTO custom_rules (keyword, category) VALUES (?, ?)', ['瑞幸', '餐饮']);
    });
  } catch (e) {
    console.error('seedDemoData failed:', e);
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

// ===================== 账单导入 =====================

export interface ImportedExpenseInput {
  amount: number;
  categoryId: number;
  expenseDate: string;
  description: string;
  rawInput: string;
  source: BillSource;
  externalId: string;
  importBatchId: string;
}

export interface ImportBatchInput {
  id: string;
  source: BillSource;
  fileName: string;
  totalRows: number;
  skippedCount: number;
}

export interface RefundAdjustmentInput {
  source: BillSource;
  refundExternalId: string;
  expenseId: number;
  amountCents: number;
}

/** 批量写入账单导入记录；唯一索引保证重复单号被忽略 */
export async function insertImportedExpenses(
  rows: ImportedExpenseInput[],
  batch: ImportBatchInput,
  refunds: RefundAdjustmentInput[] = [],
): Promise<{ inserted: number; skipped: number; adjusted: number }> {
  const database = getDb();
  let inserted = 0;
  let adjusted = 0;

  database.withTransactionSync(() => {
    const sql = `INSERT OR IGNORE INTO expenses
      (amount, category_id, description, raw_input, expense_date, source, external_id, import_batch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const stmt = rows.length > 500 ? database.prepareSync(sql) : null;
    try {
      for (const r of rows) {
        const params = [
          r.amount,
          r.categoryId,
          r.description || null,
          r.rawInput || null,
          r.expenseDate,
          r.source,
          r.externalId,
          r.importBatchId,
        ];
        const result = stmt ? stmt.executeSync(params) : database.runSync(sql, params);
        if (result.changes > 0) inserted++;
      }
    } finally {
      stmt?.finalizeSync();
    }

    // 跨月退款：冲减原支出；同一退款单号只处理一次
    for (const rf of refunds) {
      if (rf.amountCents <= 0) continue;
      const processed = database.getFirstSync<{ id: number }>(
        'SELECT id FROM import_adjustments WHERE source = ? AND refund_external_id = ? LIMIT 1',
        [rf.source, rf.refundExternalId],
      );
      if (processed) continue;

      const row = database.getFirstSync<Expense & { category_type: string | null }>(
        `SELECT e.*, c.type as category_type
         FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
         WHERE e.id = ?`,
        [rf.expenseId],
      );
      if (!row || row.category_type !== 'expense') continue;

      const newCents = Math.round(row.amount * 100) - rf.amountCents;
      const snapshot = JSON.stringify(row);
      let newAmount: number | null = null;

      if (newCents <= 0) {
        database.runSync('DELETE FROM expenses WHERE id = ?', [row.id]);
      } else {
        newAmount = newCents / 100;
        database.runSync('UPDATE expenses SET amount = ? WHERE id = ?', [newAmount, row.id]);
      }

      database.runSync(
        `INSERT INTO import_adjustments
          (batch_id, expense_id, source, refund_external_id, snapshot, new_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [batch.id, row.id, rf.source, rf.refundExternalId, snapshot, newAmount],
      );
      adjusted++;
    }

    if (inserted > 0 || adjusted > 0) {
      const skippedCount = Math.max(0, batch.totalRows - inserted - adjusted);
      database.runSync(
        `INSERT OR REPLACE INTO import_batches
          (id, source, file_name, total_rows, imported_count, skipped_count, adjusted_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [batch.id, batch.source, batch.fileName, batch.totalRows, inserted, skippedCount, adjusted],
      );
    }
  });

  return { inserted, skipped: rows.length - inserted, adjusted };
}

/** 该来源全部已导入交易单号（不限日期，避免用户改日期后漏判） */
export async function getImportedExternalIds(source: BillSource): Promise<Set<string>> {
  const database = getDb();
  const rows = database.getAllSync<{ external_id: string }>(
    'SELECT external_id FROM expenses WHERE source = ? AND external_id IS NOT NULL',
    [source],
  );
  const ids = new Set(rows.map(r => r.external_id));

  // 全额退款时原账目会被删除；快照里的 external_id 仍算「已处理」，避免重新导入原账单时又建一条
  const deleted = database.getAllSync<{ snapshot: string }>(
    'SELECT snapshot FROM import_adjustments WHERE source = ? AND new_amount IS NULL',
    [source],
  );
  for (const row of deleted) {
    try {
      const snap = JSON.parse(row.snapshot) as Expense;
      if (snap.external_id) ids.add(snap.external_id);
    } catch {
      // 快照损坏时忽略
    }
  }
  return ids;
}

/** 按来源 + 交易单号找已有账目（支付宝跨月退款原单） */
export async function findExpenseByExternalId(source: BillSource, externalId: string): Promise<ExpenseWithCategory | null> {
  return getDb().getFirstSync<ExpenseWithCategory>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
     FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.source = ? AND e.external_id = ?
     LIMIT 1`,
    [source, externalId],
  );
}

export interface RefundCandidateQuery {
  source: BillSource;
  /** 退款日期 YYYY-MM-DD */
  date: string;
  amountCents: number;
  days?: number;
}

/** 找可能的原支出：金额不小于退款额、发生在退款之前、同渠道或手工账 */
export async function findRefundCandidates(q: RefundCandidateQuery): Promise<ExpenseWithCategory[]> {
  const days = q.days ?? 180;
  const d = new Date(`${q.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  const start = d.toISOString().slice(0, 10);
  return getDb().getAllSync<ExpenseWithCategory>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
     FROM expenses e JOIN categories c ON e.category_id = c.id
     WHERE c.type = 'expense'
       AND e.expense_date <= ?
       AND e.expense_date >= ?
       AND ROUND(e.amount * 100) >= ?
       AND (e.source = ? OR e.source IS NULL)
     ORDER BY e.expense_date DESC
     LIMIT 40`,
    [q.date, start, q.amountCents - 1, q.source],
  );
}

/** 该来源已处理过的退款单号（防止同一退款重复冲减） */
export async function getProcessedRefundIds(source: BillSource): Promise<Set<string>> {
  const rows = getDb().getAllSync<{ refund_external_id: string }>(
    'SELECT refund_external_id FROM import_adjustments WHERE source = ?',
    [source],
  );
  return new Set(rows.map(r => r.refund_external_id));
}

/** 日期范围内的已有账目（含分类类型），供模糊去重比对 */
export async function getExpensesInRange(startDate: string, endDate: string): Promise<ExpenseWithCategory[]> {
  return getDb().getAllSync<ExpenseWithCategory>(
    `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
     FROM expenses e
     LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.expense_date BETWEEN ? AND ?
     ORDER BY e.expense_date ASC`,
    [startDate, endDate],
  );
}

export async function getImportBatches(limit = 10): Promise<ImportBatch[]> {
  return getDb().getAllSync<ImportBatch>(
    'SELECT * FROM import_batches ORDER BY created_at DESC, id DESC LIMIT ?',
    [limit],
  );
}

/** 撤销整批导入：恢复被冲减的原账目，再删除本批次账目与批次记录 */
export async function undoImportBatch(id: string): Promise<number> {
  const database = getDb();
  let deleted = 0;
  database.withTransactionSync(() => {
    // 先按倒序恢复本批次造成的跨月退款冲减
    const adjustments = database.getAllSync<ImportAdjustment>(
      'SELECT * FROM import_adjustments WHERE batch_id = ? ORDER BY id DESC',
      [id],
    );
    for (const adj of adjustments) {
      let snap: Expense;
      try {
        snap = JSON.parse(adj.snapshot) as Expense;
      } catch {
        continue;
      }
      if (adj.new_amount === null) {
        database.runSync(
          `INSERT OR IGNORE INTO expenses
            (id, amount, category_id, description, raw_input, expense_date, created_at, source, external_id, import_batch_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            snap.id, snap.amount, snap.category_id, snap.description, snap.raw_input,
            snap.expense_date, snap.created_at, snap.source ?? null, snap.external_id ?? null,
            snap.import_batch_id ?? null,
          ],
        );
      } else {
        database.runSync('UPDATE expenses SET amount = ? WHERE id = ?', [snap.amount, adj.expense_id]);
      }
    }

    // 本批次账目若被其他批次的退款冲减过，直接丢弃这些冲减记录（账目本身即将删除）
    database.runSync(
      'DELETE FROM import_adjustments WHERE expense_id IN (SELECT id FROM expenses WHERE import_batch_id = ?)',
      [id],
    );
    database.runSync('DELETE FROM import_adjustments WHERE batch_id = ?', [id]);

    const row = database.getFirstSync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM expenses WHERE import_batch_id = ?',
      [id],
    );
    deleted = row?.cnt ?? 0;
    database.runSync('DELETE FROM expenses WHERE import_batch_id = ?', [id]);
    database.runSync('DELETE FROM import_batches WHERE id = ?', [id]);
  });
  return deleted;
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

/** 有账单记录的月份列表（YYYY-MM，升序），供月份选择器打点 */
export async function getExpenseMonths(): Promise<string[]> {
  const rows = getDb().getAllSync<{ month: string }>(
    `SELECT DISTINCT substr(expense_date, 1, 7) AS month
       FROM expenses
      WHERE expense_date LIKE '____-__-__'
      ORDER BY month ASC`
  );
  return rows.map(r => r.month);
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

/** 统计某分类关联的数据量（账单/预算/固定收支），用于删除分类前的处置决策 */
export async function getCategoryDataCounts(categoryId: number): Promise<{ expenses: number; budgets: number; fixedItems: number }> {
  const database = getDb();
  const cnt = (sql: string) => database.getFirstSync<{ cnt: number }>(sql, [categoryId])?.cnt || 0;
  return {
    expenses: cnt('SELECT COUNT(*) as cnt FROM expenses WHERE category_id = ?'),
    budgets: cnt('SELECT COUNT(*) as cnt FROM budgets WHERE category_id = ?'),
    fixedItems: cnt('SELECT COUNT(*) as cnt FROM fixed_items WHERE category_id = ?'),
  };
}

/**
 * 删除分类并处置关联数据（事务保证原子性）：
 * - transferTargetId 非空 → 该分类全部账单改挂目标分类；null → 连带删除账单
 * - 预算恒删除、固定收支恒停用（enabled=0，保留配置但不再自动生成）
 */
export async function deleteCategoryWithData(categoryId: number, transferTargetId: number | null): Promise<void> {
  const database = getDb();
  database.withTransactionSync(() => {
    if (transferTargetId) {
      database.runSync('UPDATE expenses SET category_id = ? WHERE category_id = ?', [transferTargetId, categoryId]);
    } else {
      database.runSync('DELETE FROM expenses WHERE category_id = ?', [categoryId]);
    }
    database.runSync('DELETE FROM budgets WHERE category_id = ?', [categoryId]);
    database.runSync('UPDATE fixed_items SET enabled = 0 WHERE category_id = ?', [categoryId]);
    database.runSync('DELETE FROM quick_items WHERE category_id = ?', [categoryId]);
    database.runSync('DELETE FROM categories WHERE id = ? AND is_default = 0', [categoryId]);
  });
}

// ===================== 自定义规则 =====================

export async function getCustomRules(): Promise<CustomRule[]> {
  return getDb().getAllSync<CustomRule>('SELECT * FROM custom_rules ORDER BY id DESC');
}

export async function addCustomRule(keyword: string, category: string): Promise<void> {
  getDb().runSync(
    'INSERT OR REPLACE INTO custom_rules (keyword, category) VALUES (?, ?)',
    [keyword, category]
  );
}

export async function deleteCustomRule(id: number): Promise<void> {
  getDb().runSync('DELETE FROM custom_rules WHERE id = ?', [id]);
}

/** 删除某分类名下的全部自定义关键词（分类删除时清理用） */
export async function deleteCustomRulesByCategory(category: string): Promise<void> {
  getDb().runSync('DELETE FROM custom_rules WHERE category = ?', [category]);
}

// ===================== 固定收支 =====================

export async function getFixedItems(opts?: { enabled?: boolean }): Promise<FixedItem[]> {
  let where = '';
  const values: any[] = [];
  if (opts?.enabled !== undefined) {
    where = ' WHERE enabled = ?';
    values.push(opts.enabled ? 1 : 0);
  }
  return getDb().getAllSync<FixedItem>(`SELECT * FROM fixed_items${where} ORDER BY id ASC`, values);
}

export async function getFixedItemsWithCategory(opts?: { enabled?: boolean }): Promise<FixedItemWithCategory[]> {
  let where = '';
  const values: any[] = [];
  if (opts?.enabled !== undefined) {
    where = ' WHERE fi.enabled = ?';
    values.push(opts.enabled ? 1 : 0);
  }
  return getDb().getAllSync<FixedItemWithCategory>(
    `SELECT fi.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM fixed_items fi LEFT JOIN categories c ON fi.category_id = c.id
     ${where}
     ORDER BY fi.id ASC`,
    values
  );
}

export async function addFixedItem(data: {
  name: string;
  type: 'expense' | 'income';
  category_id: number;
  amount: number;
  frequency: FixedItem['frequency'];
  weekday?: number | null;
  day_of_month?: number | null;
}): Promise<number> {
  const result = getDb().runSync(
    'INSERT INTO fixed_items (name, type, category_id, amount, frequency, weekday, day_of_month) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [data.name, data.type, data.category_id, data.amount, data.frequency, data.weekday ?? null, data.day_of_month ?? null]
  );
  return result.lastInsertRowId;
}

export async function updateFixedItem(id: number, updates: Partial<{
  name: string;
  type: 'expense' | 'income';
  category_id: number;
  amount: number;
  frequency: FixedItem['frequency'];
  weekday: number | null;
  day_of_month: number | null;
  enabled: number;
}>): Promise<void> {
  const set: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { set.push('name = ?'); values.push(updates.name); }
  if (updates.type !== undefined) { set.push('type = ?'); values.push(updates.type); }
  if (updates.category_id !== undefined) { set.push('category_id = ?'); values.push(updates.category_id); }
  if (updates.amount !== undefined) { set.push('amount = ?'); values.push(updates.amount); }
  if (updates.frequency !== undefined) { set.push('frequency = ?'); values.push(updates.frequency); }
  if (updates.weekday !== undefined) { set.push('weekday = ?'); values.push(updates.weekday); }
  if (updates.day_of_month !== undefined) { set.push('day_of_month = ?'); values.push(updates.day_of_month); }
  if (updates.enabled !== undefined) { set.push('enabled = ?'); values.push(updates.enabled); }
  if (set.length === 0) return;
  values.push(id);
  getDb().runSync(`UPDATE fixed_items SET ${set.join(', ')} WHERE id = ?`, values);
}

export async function deleteFixedItem(id: number): Promise<void> {
  getDb().runSync('DELETE FROM fixed_items WHERE id = ?', [id]);
}

// ===================== 快捷记账 =====================

export async function getQuickItemsWithCategory(): Promise<QuickItemWithCategory[]> {
  return getDb().getAllSync<QuickItemWithCategory>(
    `SELECT qi.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM quick_items qi LEFT JOIN categories c ON qi.category_id = c.id
     ORDER BY qi.id ASC`
  );
}

export async function addQuickItem(name: string, categoryId: number, amount: number): Promise<number> {
  const result = getDb().runSync(
    'INSERT INTO quick_items (name, category_id, amount) VALUES (?, ?, ?)',
    [name, categoryId, amount]
  );
  return result.lastInsertRowId;
}

export async function deleteQuickItem(id: number): Promise<void> {
  getDb().runSync('DELETE FROM quick_items WHERE id = ?', [id]);
}

export async function getExpenseByRawInput(rawInput: string): Promise<Expense | null> {
  return getDb().getFirstSync<Expense>(
    'SELECT * FROM expenses WHERE raw_input = ? LIMIT 1',
    [rawInput]
  );
}

export async function getCategoryById(id: number): Promise<Category | null> {
  return getDb().getFirstSync<Category>(
    'SELECT * FROM categories WHERE id = ? LIMIT 1',
    [id]
  );
}

/**
 * 是否在指定日期触发（daily/workday/weekly/monthly）
 * monthly 的 31 日在不足 31 天的月份跳过（不钳制）
 */
export function firesOn(item: FixedItem, date: Date): boolean {
  switch (item.frequency) {
    case 'daily':
      return true;
    case 'workday': {
      const day = date.getDay();
      return day >= 1 && day <= 5; // 周一~周五
    }
    case 'weekly':
      return item.weekday !== null && item.weekday !== undefined && date.getDay() === item.weekday;
    case 'monthly': {
      if (item.day_of_month === null || item.day_of_month === undefined) return false;
      const dim = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === item.day_of_month && item.day_of_month <= dim;
    }
    default:
      return false;
  }
}

/**
 * 补生成固定收支记录（幂等）：
 * 从创建日/本月 1 号（取较晚）到今天的每个到期日，若尚无「[固定] #id 日期」标记记录则写入。
 * 未来日期不生成；重复调用是 no-op。
 */
export async function syncFixedItems(): Promise<number> {
  const items = await getFixedItems({ enabled: true });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  let inserted = 0;
  for (const item of items) {
    if (!(await getCategoryById(item.category_id))) continue; // 分类已删除则跳过
    let from = monthStart;
    const createdAt = parseCreatedAt(item.created_at);
    if (createdAt && createdAt > from) from = createdAt;

    for (let d = new Date(from); d <= today; d.setDate(d.getDate() + 1)) {
      if (!firesOn(item, d)) continue;
      const dateStr = formatDate(d);
      const marker = `${FIXED_PREFIX} #${item.id} ${dateStr}`;
      if (await getExpenseByRawInput(marker)) continue; // 已生成，幂等
      await addExpense(item.amount, item.category_id, dateStr, item.name, marker);
      inserted++;
    }
  }
  return inserted;
}

/** 本月固定收支汇总（统计从标记生成的记录） */
export async function getFixedSummary(month: string): Promise<{ expenseTotal: number; incomeTotal: number }> {
  const rows = getDb().getAllSync<{ type: string; total: number }>(
    `SELECT c.type as type, COALESCE(SUM(e.amount), 0) as total
     FROM expenses e JOIN categories c ON e.category_id = c.id
     WHERE e.expense_date LIKE ? AND e.raw_input LIKE ?
     GROUP BY c.type`,
    [`${month}%`, `${FIXED_PREFIX}%`]
  );
  let expenseTotal = 0;
  let incomeTotal = 0;
  for (const r of rows) {
    if (r.type === 'income') incomeTotal += r.total;
    else expenseTotal += r.total;
  }
  return { expenseTotal, incomeTotal };
}

function parseCreatedAt(s: string): Date | null {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export async function setBudget(categoryId: number, amount: number, month: string, period: 'monthly' | 'weekly' | 'yearly' = 'monthly'): Promise<void> {
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
  // 当前月按已过天数算日均（月中看数字不会偏小）；历史月按整月天数
  const elapsed = isCurrentMonth(month) ? Math.max(new Date().getDate(), 1) : daysInMonth;

  return {
    totalExpense: total,
    totalIncome: currentIncome?.total || 0,
    dailyAverage: cnt > 0 ? total / elapsed : 0,
    monthOverMonth: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0,
    recordCount: cnt,
    hasPrevData: prevTotal > 0,
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

// ===================== 通知捕获（待确认记账） =====================

/** 新增一条捕获；60 秒内同来源同文本视为重复通知，返回 -1 */
export async function addPendingCapture(c: { source: 'alipay' | 'wechat'; title: string; text: string; amount: number | null; direction: 'expense' | 'income' }): Promise<number> {
  const database = getDb();
  const dup = database.getFirstSync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM pending_captures WHERE source = ? AND text = ? AND status = 'pending' AND created_at >= datetime('now', '-60 seconds', 'localtime')",
    [c.source, c.text]
  )?.cnt || 0;
  if (dup > 0) return -1;
  const result = database.runSync(
    'INSERT INTO pending_captures (source, title, text, amount, direction) VALUES (?, ?, ?, ?, ?)',
    [c.source, c.title, c.text, c.amount]
  );
  return result.lastInsertRowId;
}

export async function getPendingCaptures(): Promise<PendingCapture[]> {
  return getDb().getAllSync<PendingCapture>(
    "SELECT * FROM pending_captures WHERE status = 'pending' ORDER BY id DESC LIMIT 50"
  );
}

/** 确认入账：写账单并置 confirmed；金额用列表里人工校准后的值 */
export async function confirmPendingCapture(id: number, opts: { categoryId: number; amount: number; date: string; description?: string }): Promise<void> {
  const database = getDb();
  const row = database.getFirstSync<PendingCapture>('SELECT * FROM pending_captures WHERE id = ?', [id]);
  if (!row || row.status !== 'pending') return;
  await addExpense(opts.amount, opts.categoryId, opts.date, opts.description || row.title || row.text, row.text);
  database.runSync("UPDATE pending_captures SET status = 'confirmed', amount = ? WHERE id = ?", [opts.amount, id]);
}

export async function ignorePendingCapture(id: number): Promise<void> {
  getDb().runSync("UPDATE pending_captures SET status = 'ignored' WHERE id = ?", [id]);
}

// ===================== 备份恢复 =====================

export interface BackupData {
  version: string;
  exportedAt: string;
  categories: Category[];
  expenses: Expense[];
  budgets: Budget[];
  settings: { key: string; value: string }[];
  customRules: CustomRule[];
  fixedItems: FixedItem[];
  importBatches?: ImportBatch[];
  importAdjustments?: ImportAdjustment[];
}

export async function exportAllData(): Promise<BackupData> {
  const database = getDb();

  const categories = database.getAllSync<Category>('SELECT * FROM categories');
  const expenses = database.getAllSync<Expense>('SELECT * FROM expenses ORDER BY expense_date DESC');
  const budgets = database.getAllSync<Budget>('SELECT * FROM budgets');
  const settings = database.getAllSync<{ key: string; value: string }>('SELECT * FROM settings');
  const customRules = database.getAllSync<CustomRule>('SELECT * FROM custom_rules');
  const fixedItems = database.getAllSync<FixedItem>('SELECT * FROM fixed_items');
  const importBatches = database.getAllSync<ImportBatch>('SELECT * FROM import_batches ORDER BY created_at DESC');
  const importAdjustments = database.getAllSync<ImportAdjustment>('SELECT * FROM import_adjustments ORDER BY id ASC');

  return {
    version: '1.2.0',
    exportedAt: new Date().toISOString(),
    categories,
    expenses,
    budgets,
    settings,
    customRules,
    fixedItems,
    importBatches,
    importAdjustments,
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

  // 导入消费记录；带账单单号的行用 OR IGNORE 避免唯一索引冲突
  const expenseIdMap = new Map<number, number>();
  for (const exp of data.expenses || []) {
    const result = database.runSync(
      `INSERT OR IGNORE INTO expenses
        (amount, category_id, description, raw_input, expense_date, created_at, source, external_id, import_batch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        exp.amount,
        exp.category_id,
        exp.description,
        exp.raw_input,
        exp.expense_date,
        exp.created_at,
        exp.source ?? null,
        exp.external_id ?? null,
        exp.import_batch_id ?? null,
      ]
    );
    if (result.changes > 0) {
      expenseIdMap.set(exp.id, result.lastInsertRowId);
      imported++;
    } else {
      skipped++;
      if (exp.source && exp.external_id) {
        const existing = database.getFirstSync<{ id: number }>(
          'SELECT id FROM expenses WHERE source = ? AND external_id = ? LIMIT 1',
          [exp.source, exp.external_id],
        );
        if (existing) expenseIdMap.set(exp.id, existing.id);
      }
    }
  }

  // 导入批次记录（撤销导入用）
  for (const b of data.importBatches || []) {
    database.runSync(
      `INSERT OR REPLACE INTO import_batches
        (id, source, file_name, total_rows, imported_count, skipped_count, adjusted_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.id, b.source, b.file_name, b.total_rows, b.imported_count, b.skipped_count,
        b.adjusted_count ?? 0, b.created_at || new Date().toISOString(),
      ]
    );
  }

  // 导入冲减记录（expense_id 按本次恢复出的新 id 映射）
  for (const adj of data.importAdjustments || []) {
    const mapped = expenseIdMap.get(adj.expense_id);
    if (!mapped) continue;
    let snapshot = adj.snapshot;
    try {
      const snap = JSON.parse(snapshot);
      delete snap.id;
      snapshot = JSON.stringify(snap);
    } catch {
      // 保留原快照
    }
    database.runSync(
      `INSERT OR REPLACE INTO import_adjustments
        (id, batch_id, expense_id, source, refund_external_id, snapshot, new_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adj.id, adj.batch_id, mapped, adj.source, adj.refund_external_id,
        snapshot, adj.new_amount, adj.created_at || new Date().toISOString(),
      ]
    );
  }

  // 导入预算
  for (const b of data.budgets || []) {
    database.runSync(
      'INSERT OR REPLACE INTO budgets (category_id, amount, period, month) VALUES (?, ?, ?, ?)',
      [b.category_id, b.amount, b.period, b.month]
    );
  }

  // 导入自定义规则（保留 id）
  for (const rule of data.customRules || []) {
    database.runSync(
      'INSERT OR REPLACE INTO custom_rules (id, keyword, category, created_at) VALUES (?, ?, ?, ?)',
      [rule.id, rule.keyword, rule.category, rule.created_at || new Date().toISOString()]
    );
  }

  // 导入固定收支（保留 id —— 生成的记录依赖「[固定] #id 日期」标记中的 id）
  for (const item of data.fixedItems || []) {
    database.runSync(
      'INSERT OR REPLACE INTO fixed_items (id, name, type, category_id, amount, frequency, weekday, day_of_month, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [item.id, item.name, item.type, item.category_id, item.amount, item.frequency, item.weekday, item.day_of_month, item.enabled, item.created_at || new Date().toISOString()]
    );
  }

  return { imported, skipped };
}