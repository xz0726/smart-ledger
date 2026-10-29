/**
 * web 平台的内存版数据层（Metro 按平台解析，native 端走 db.ts）。
 *
 * 背景：web 预览依赖 expo-sqlite 的 WASM worker 通路，在无头浏览器自动化环境里
 * worker 不可用（SharedArrayBuffer / worker 崩溃问题），故按降级方案提供同签名
 * 的内存实现：10 个默认分类 + 丰富的示例账单，让 UI 布局/图标审查有真实数据可看。
 * 仅用于 web 预览，不参与原生构建；数据不做持久化（刷新即重置）。
 */
import type {
  Category, Expense, ExpenseWithCategory, Budget, BudgetWithCategory,
  StatsOverview, CategoryStats, DailyTrend, CustomRule, FixedItem,
  FixedItemWithCategory, QuickItemWithCategory, PendingCapture,
} from '../types';
import { isCurrentMonth } from '../utils/format';

const FIXED_PREFIX = '[固定]';

// ===================== 内存表 =====================

let nextCategoryId = 1;
let nextExpenseId = 1;
let nextBudgetId = 1;
let nextCustomRuleId = 1;
let nextFixedItemId = 1;
let nextQuickItemId = 1;

const categories: Category[] = [];
const expenses: Expense[] = [];
const budgets: Budget[] = [];
const settingsMap = new Map<string, string>();
const customRules: CustomRule[] = [];
const fixedItems: FixedItem[] = [];

// ===================== 种子数据 =====================

function nowStr(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function dateStr(offsetDaysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDaysAgo);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function monthStr(offsetMonthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offsetMonthsAgo);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}

/** 当月第 offsetDaysAgo 天的日期串（不做未来日期） */
function monthDate(day: number): string {
  const now = new Date();
  const maxDay = now.getDate();
  const useDay = Math.min(day, maxDay);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(useDay)}`;
}

function seedCategory(icon: string, name: string, color: string, type: 'expense' | 'income'): Category {
  const c: Category = { id: nextCategoryId++, name, icon, color, type, is_default: 1, parent_id: null };
  categories.push(c);
  return c;
}

function seedExpense(amount: number, categoryId: number, expenseDate: string, description: string, rawInput?: string): Expense {
  const e: Expense = {
    id: nextExpenseId++, amount, category_id: categoryId,
    description, raw_input: rawInput ?? description, expense_date: expenseDate, created_at: `${expenseDate} 12:00:00`,
  };
  expenses.push(e);
  return e;
}

/** 上月第 N 天（用于环比演示） */
function prevMonthDate(day: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(day)}`;
}

function seedDemoData(): void {
  const food = seedCategory('🍔', '餐饮', '#f97316', 'expense');
  const transport = seedCategory('🚇', '交通', '#3b82f6', 'expense');
  const shopping = seedCategory('🛒', '购物', '#ec4899', 'expense');
  const fun = seedCategory('🎮', '娱乐', '#8b5cf6', 'expense');
  const housing = seedCategory('🏠', '居住', '#14b8a6', 'expense');
  const medical = seedCategory('💊', '医疗', '#ef4444', 'expense');
  const study = seedCategory('📚', '学习', '#06b6d4', 'expense');
  const telecom = seedCategory('💬', '通讯', '#6366f1', 'expense');
  const income = seedCategory('💰', '收入', '#22c55e', 'income');
  const other = seedCategory('✏️', '其他', '#64748b', 'expense');

  // 固定收支：房租（每月 1 日）
  fixedItems.push({
    id: nextFixedItemId++, name: '房租', type: 'expense', category_id: housing.id,
    amount: 1800, frequency: 'monthly', weekday: null, day_of_month: 1, enabled: 1, created_at: nowStr(),
  });
  // 快捷记账按钮
  quickItemsSeed.push({ id: nextQuickItemId++, name: '早餐', category_id: food.id, amount: 8, created_at: nowStr() });
  quickItemsSeed.push({ id: nextQuickItemId++, name: '地铁', category_id: transport.id, amount: 4, created_at: nowStr() });
  quickItemsSeed.push({ id: nextQuickItemId++, name: '咖啡', category_id: other.id, amount: 15, created_at: nowStr() });
  // 自定义关键词规则
  customRules.push({ id: nextCustomRuleId++, keyword: '瑞幸', category: '餐饮', created_at: nowStr() });
  // 预算：餐饮接近预警线、购物超支（演示两种状态）
  budgets.push({ id: nextBudgetId++, category_id: food.id, amount: 800, period: 'monthly', month: monthStr(0) });
  budgets.push({ id: nextBudgetId++, category_id: shopping.id, amount: 300, period: 'monthly', month: monthStr(0) });

  // 上月示例账单（用于环比）
  seedExpense(1680, housing.id, prevMonthDate(1), '房租', `${FIXED_PREFIX} #1 ${prevMonthDate(1)}`);
  seedExpense(620, food.id, prevMonthDate(3), '上月餐费');
  seedExpense(260, shopping.id, prevMonthDate(8), '上月购物');
  seedExpense(95, fun.id, prevMonthDate(15), '上月娱乐');
  seedExpense(8800, income.id, prevMonthDate(10), '上月工资');

  // 本月示例账单
  seedExpense(1800, housing.id, monthDate(1), '房租', `${FIXED_PREFIX} #1 ${monthDate(1)}`);
  seedExpense(12, food.id, monthDate(1), '早餐豆浆油条');
  seedExpense(28, food.id, monthDate(2), '午餐黄焖鸡');
  seedExpense(4, transport.id, monthDate(2), '地铁通勤');
  seedExpense(35, food.id, monthDate(3), '晚餐外卖');
  seedExpense(199, shopping.id, monthDate(3), '卫衣');
  seedExpense(45, study.id, monthDate(4), '技术书籍');
  seedExpense(16, food.id, monthDate(5), '瑞幸咖啡', '瑞幸 16元');
  seedExpense(9.9, fun.id, monthDate(6), '视频会员');
  seedExpense(58, medical.id, monthDate(7), '感冒药');
  seedExpense(32, food.id, monthDate(8), '火锅');
  seedExpense(6, transport.id, monthDate(9), '公交');
  seedExpense(129, shopping.id, monthDate(10), '运动鞋垫');
  seedExpense(22, food.id, monthDate(11), '面馆');
  seedExpense(30, telecom.id, monthDate(12), '话费充值');
  seedExpense(18, food.id, monthDate(13), '奶茶');
  seedExpense(76, fun.id, monthDate(14), '电影票');
  seedExpense(14, food.id, monthDate(15), '煎饼果子');
  seedExpense(240, shopping.id, monthDate(16), '日用品囤货');
  seedExpense(5, transport.id, monthDate(17), '共享单车');
  seedExpense(42, food.id, monthDate(18), '烧烤');
  seedExpense(88, study.id, monthDate(19), '网课');
  seedExpense(26, food.id, monthDate(20), '寿司');
  seedExpense(12, transport.id, monthDate(21), '打车');
  seedExpense(36, food.id, dateStr(1), '午餐拌饭');
  seedExpense(8800, income.id, monthDate(10), '工资');
  seedExpense(120, income.id, dateStr(2), '稿费');
  seedExpense(23.5, food.id, dateStr(0), '晚餐麻辣烫');
  seedExpense(3.5, transport.id, dateStr(0), '地铁');
}

const quickItemsSeed: { id: number; name: string; category_id: number; amount: number; created_at: string }[] = [];

seedDemoData();

// ===================== 内部工具 =====================

function withCategory(e: Expense): ExpenseWithCategory {
  const c = categories.find(x => x.id === e.category_id);
  return {
    ...e,
    category_name: c?.name ?? '',
    category_icon: c?.icon ?? '📦',
    category_color: c?.color ?? '#64748b',
    category_type: c?.type ?? 'expense',
  };
}

function spentByCategoryInMonth(month: string): Map<number, number> {
  const map = new Map<number, number>();
  for (const e of expenses) {
    if (e.expense_date.startsWith(month)) {
      map.set(e.category_id, (map.get(e.category_id) || 0) + e.amount);
    }
  }
  return map;
}

// ===================== 消费记录 CRUD =====================

export async function addExpense(
  amount: number,
  categoryId: number,
  expenseDate: string,
  description?: string,
  rawInput?: string
): Promise<number> {
  const e: Expense = {
    id: nextExpenseId++, amount, category_id: categoryId,
    description: description || null, raw_input: rawInput ?? description ?? null,
    expense_date: expenseDate, created_at: nowStr(),
  };
  expenses.push(e);
  return e.id;
}

export async function getExpenses(params: {
  month?: string;
  categoryId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: ExpenseWithCategory[]; total: number }> {
  const { month, categoryId, search, page = 1, pageSize = 50 } = params;
  let list = expenses.slice();
  if (month) list = list.filter(e => e.expense_date.startsWith(month));
  if (categoryId) list = list.filter(e => e.category_id === categoryId);
  if (search) list = list.filter(e => (e.description || '').includes(search) || (e.raw_input || '').includes(search));
  list.sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at));
  const total = list.length;
  const start = (page - 1) * pageSize;
  return { data: list.slice(start, start + pageSize).map(withCategory), total };
}

export async function deleteExpense(id: number): Promise<void> {
  const i = expenses.findIndex(e => e.id === id);
  if (i >= 0) expenses.splice(i, 1);
}

export async function updateExpense(
  id: number,
  updates: { amount?: number; categoryId?: number; description?: string; expenseDate?: string }
): Promise<void> {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  if (updates.amount !== undefined) e.amount = updates.amount;
  if (updates.categoryId !== undefined) e.category_id = updates.categoryId;
  if (updates.description !== undefined) e.description = updates.description;
  if (updates.expenseDate !== undefined) e.expense_date = updates.expenseDate;
}

// ===================== 分类管理 =====================

export async function getCategories(type?: 'expense' | 'income'): Promise<Category[]> {
  const list = categories.filter(c => !type || c.type === type).slice();
  list.sort((a, b) => b.is_default - a.is_default || a.id - b.id);
  return list;
}

export async function getCategoryByName(name: string): Promise<Category | null> {
  return categories.find(c => c.name === name) || null;
}

export async function addCategory(name: string, icon: string, color: string, type: 'expense' | 'income'): Promise<number> {
  const c: Category = { id: nextCategoryId++, name, icon, color, type, is_default: 0, parent_id: null };
  categories.push(c);
  return c.id;
}

export async function deleteCategory(id: number): Promise<void> {
  const i = categories.findIndex(c => c.id === id && c.is_default === 0);
  if (i >= 0) categories.splice(i, 1);
}

export async function getCategoryDataCounts(categoryId: number): Promise<{ expenses: number; budgets: number; fixedItems: number }> {
  return {
    expenses: expenses.filter(e => e.category_id === categoryId).length,
    budgets: budgets.filter(b => b.category_id === categoryId).length,
    fixedItems: fixedItems.filter(f => f.category_id === categoryId).length,
  };
}

export async function deleteCategoryWithData(categoryId: number, transferTargetId: number | null): Promise<void> {
  if (transferTargetId) {
    for (const e of expenses) if (e.category_id === categoryId) e.category_id = transferTargetId;
  } else {
    for (let i = expenses.length - 1; i >= 0; i--) if (expenses[i].category_id === categoryId) expenses.splice(i, 1);
  }
  for (let i = budgets.length - 1; i >= 0; i--) if (budgets[i].category_id === categoryId) budgets.splice(i, 1);
  for (const f of fixedItems) if (f.category_id === categoryId) f.enabled = 0;
  for (let i = quickItemsSeed.length - 1; i >= 0; i--) if (quickItemsSeed[i].category_id === categoryId) quickItemsSeed.splice(i, 1);
  const ci = categories.findIndex(c => c.id === categoryId && c.is_default === 0);
  if (ci >= 0) categories.splice(ci, 1);
}

// ===================== 自定义规则 =====================

export async function getCustomRules(): Promise<CustomRule[]> {
  return customRules.slice().sort((a, b) => b.id - a.id);
}

export async function addCustomRule(keyword: string, category: string): Promise<void> {
  const i = customRules.findIndex(r => r.keyword === keyword);
  if (i >= 0) customRules[i].category = category;
  else customRules.push({ id: nextCustomRuleId++, keyword, category, created_at: nowStr() });
}

export async function deleteCustomRule(id: number): Promise<void> {
  const i = customRules.findIndex(r => r.id === id);
  if (i >= 0) customRules.splice(i, 1);
}

export async function deleteCustomRulesByCategory(category: string): Promise<void> {
  for (let i = customRules.length - 1; i >= 0; i--) if (customRules[i].category === category) customRules.splice(i, 1);
}

// ===================== 固定收支 =====================

export async function getFixedItems(opts?: { enabled?: boolean }): Promise<FixedItem[]> {
  return fixedItems.filter(f => opts?.enabled === undefined || f.enabled === (opts.enabled ? 1 : 0));
}

export async function getFixedItemsWithCategory(opts?: { enabled?: boolean }): Promise<FixedItemWithCategory[]> {
  return fixedItems
    .filter(f => opts?.enabled === undefined || f.enabled === (opts.enabled ? 1 : 0))
    .map(f => {
      const c = categories.find(x => x.id === f.category_id);
      return { ...f, category_name: c?.name ?? null, category_icon: c?.icon ?? null, category_color: c?.color ?? null };
    });
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
  const f: FixedItem = {
    id: nextFixedItemId++, name: data.name, type: data.type, category_id: data.category_id,
    amount: data.amount, frequency: data.frequency, weekday: data.weekday ?? null,
    day_of_month: data.day_of_month ?? null, enabled: 1, created_at: nowStr(),
  };
  fixedItems.push(f);
  return f.id;
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
  const f = fixedItems.find(x => x.id === id);
  if (!f) return;
  Object.assign(f, updates);
}

export async function deleteFixedItem(id: number): Promise<void> {
  const i = fixedItems.findIndex(f => f.id === id);
  if (i >= 0) fixedItems.splice(i, 1);
}

// ===================== 快捷记账 =====================

export async function getQuickItemsWithCategory(): Promise<QuickItemWithCategory[]> {
  return quickItemsSeed.map(q => {
    const c = categories.find(x => x.id === q.category_id);
    return { ...q, category_name: c?.name ?? null, category_icon: c?.icon ?? null, category_color: c?.color ?? null };
  });
}

export async function addQuickItem(name: string, categoryId: number, amount: number): Promise<number> {
  const q = { id: nextQuickItemId++, name, category_id: categoryId, amount, created_at: nowStr() };
  quickItemsSeed.push(q);
  return q.id;
}

export async function deleteQuickItem(id: number): Promise<void> {
  const i = quickItemsSeed.findIndex(q => q.id === id);
  if (i >= 0) quickItemsSeed.splice(i, 1);
}

export async function getExpenseByRawInput(rawInput: string): Promise<Expense | null> {
  return expenses.find(e => e.raw_input === rawInput) || null;
}

export async function getCategoryById(id: number): Promise<Category | null> {
  return categories.find(c => c.id === id) || null;
}

/** 是否在指定日期触发（daily/workday/weekly/monthly）；monthly 的 31 日在不足 31 天的月份跳过 */
export function firesOn(item: FixedItem, date: Date): boolean {
  switch (item.frequency) {
    case 'daily':
      return true;
    case 'workday': {
      const day = date.getDay();
      return day >= 1 && day <= 5;
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

/** 补生成固定收支记录（幂等）：与 db.ts 同语义，内存版直接操作数组 */
export async function syncFixedItems(): Promise<number> {
  const items = await getFixedItems({ enabled: true });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  let inserted = 0;
  for (const item of items) {
    if (!(await getCategoryById(item.category_id))) continue;
    let from = monthStart;
    const m = item.created_at.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const createdAt = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      if (createdAt > from) from = createdAt;
    }
    for (let d = new Date(from); d <= today; d.setDate(d.getDate() + 1)) {
      if (!firesOn(item, d)) continue;
      const p = (n: number) => n.toString().padStart(2, '0');
      const ds = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      const marker = `${FIXED_PREFIX} #${item.id} ${ds}`;
      if (await getExpenseByRawInput(marker)) continue;
      await addExpense(item.amount, item.category_id, ds, item.name, marker);
      inserted++;
    }
  }
  return inserted;
}

export async function getFixedSummary(month: string): Promise<{ expenseTotal: number; incomeTotal: number }> {
  let expenseTotal = 0;
  let incomeTotal = 0;
  for (const e of expenses) {
    if (!e.expense_date.startsWith(month) || !(e.raw_input || '').startsWith(FIXED_PREFIX)) continue;
    const c = categories.find(x => x.id === e.category_id);
    if (c?.type === 'income') incomeTotal += e.amount;
    else expenseTotal += e.amount;
  }
  return { expenseTotal, incomeTotal };
}

// ===================== 预算管理 =====================

export async function getBudgets(month: string): Promise<BudgetWithCategory[]> {
  const spent = spentByCategoryInMonth(month);
  return budgets
    .filter(b => b.month === month)
    .map(b => {
      const c = categories.find(x => x.id === b.category_id);
      return {
        ...b,
        category_name: c?.name ?? '',
        category_icon: c?.icon ?? '📦',
        category_color: c?.color ?? '#64748b',
        spent: spent.get(b.category_id) || 0,
      };
    })
    .sort((a, b) => b.spent - a.spent);
}

export async function setBudget(categoryId: number, amount: number, month: string, period: 'monthly' | 'weekly' | 'yearly' = 'monthly'): Promise<void> {
  const existing = budgets.find(b => b.category_id === categoryId && b.month === month);
  if (existing) {
    existing.amount = amount;
    existing.period = period;
  } else {
    budgets.push({ id: nextBudgetId++, category_id: categoryId, amount, period, month });
  }
}

export async function deleteBudget(categoryId: number, month: string): Promise<void> {
  const i = budgets.findIndex(b => b.category_id === categoryId && b.month === month);
  if (i >= 0) budgets.splice(i, 1);
}

// ===================== 统计查询 =====================

export async function getStatsOverview(month: string, prevMonth: string): Promise<StatsOverview> {
  let total = 0, cnt = 0, totalIncome = 0, prevTotal = 0;
  for (const e of expenses) {
    const c = categories.find(x => x.id === e.category_id);
    if (!c) continue;
    if (e.expense_date.startsWith(month)) {
      if (c.type === 'expense') { total += e.amount; cnt++; }
      else totalIncome += e.amount;
    }
    if (c.type === 'expense' && e.expense_date.startsWith(prevMonth)) prevTotal += e.amount;
  }

  const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
  const elapsed = isCurrentMonth(month) ? Math.max(new Date().getDate(), 1) : daysInMonth;

  return {
    totalExpense: total,
    totalIncome,
    dailyAverage: cnt > 0 ? total / elapsed : 0,
    monthOverMonth: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0,
    recordCount: cnt,
    hasPrevData: prevTotal > 0,
  };
}

export async function getCategoryStats(month: string): Promise<CategoryStats[]> {
  const stats: CategoryStats[] = [];
  for (const c of categories.filter(x => x.type === 'expense')) {
    let total = 0, count = 0;
    for (const e of expenses) {
      if (e.category_id === c.id && e.expense_date.startsWith(month)) { total += e.amount; count++; }
    }
    stats.push({
      category_id: c.id, category_name: c.name, category_icon: c.icon, category_color: c.color,
      total, count, percentage: 0,
    });
  }
  stats.sort((a, b) => b.total - a.total);
  const grandTotal = stats.reduce((s, x) => s + x.total, 0);
  return stats.map(s => ({ ...s, percentage: grandTotal > 0 ? (s.total / grandTotal) * 100 : 0 }));
}

export async function getDailyTrend(month: string): Promise<DailyTrend[]> {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const c = categories.find(x => x.id === e.category_id);
    if (c?.type !== 'expense' || !e.expense_date.startsWith(month)) continue;
    map.set(e.expense_date, (map.get(e.expense_date) || 0) + e.amount);
  }
  return [...map.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ===================== 设置管理 =====================

export async function getSetting(key: string): Promise<string | null> {
  return settingsMap.get(key) || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  settingsMap.set(key, value);
}

// ===================== 通知捕获（待确认记账） =====================

const pendingCaptures: PendingCapture[] = [];
let nextPendingCaptureId = 1;

export async function addPendingCapture(c: { source: 'alipay' | 'wechat'; title: string; text: string; amount: number | null; direction: 'expense' | 'income' }): Promise<number> {
  const dup = pendingCaptures.some(
    x => x.source === c.source && x.text === c.text && x.status === 'pending' &&
      Math.abs(Date.now() - Date.parse(x.created_at.replace(' ', 'T'))) < 60_000
  );
  if (dup) return -1;
  const p = (n: number) => n.toString().padStart(2, '0');
  const d = new Date();
  const row: PendingCapture = {
    id: nextPendingCaptureId++, source: c.source, title: c.title, text: c.text,
    amount: c.amount, direction: c.direction, status: 'pending',
    created_at: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
  pendingCaptures.push(row);
  return row.id;
}

export async function getPendingCaptures(): Promise<PendingCapture[]> {
  return pendingCaptures.filter(x => x.status === 'pending').slice(0, 50).reverse();
}

export async function confirmPendingCapture(id: number, opts: { categoryId: number; amount: number; date: string; description?: string }): Promise<void> {
  const row = pendingCaptures.find(x => x.id === id && x.status === 'pending');
  if (!row) return;
  await addExpense(opts.amount, opts.categoryId, opts.date, opts.description || row.title || row.text, row.text);
  row.status = 'confirmed';
  row.amount = opts.amount;
}

export async function ignorePendingCapture(id: number): Promise<void> {
  const row = pendingCaptures.find(x => x.id === id && x.status === 'pending');
  if (row) row.status = 'ignored';
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
}

export async function exportAllData(): Promise<BackupData> {
  return {
    version: '1.1.0',
    exportedAt: new Date().toISOString(),
    categories: categories.slice(),
    expenses: expenses.slice().sort((a, b) => b.expense_date.localeCompare(a.expense_date)),
    budgets: budgets.slice(),
    settings: [...settingsMap.entries()].map(([key, value]) => ({ key, value })),
    customRules: customRules.slice(),
    fixedItems: fixedItems.slice(),
  };
}

export async function importAllData(data: BackupData): Promise<{ imported: number; skipped: number }> {
  for (const s of data.settings || []) settingsMap.set(s.key, s.value);

  const existingNames = new Set(categories.map(c => c.name));
  let imported = 0;
  let skipped = 0;

  for (const cat of data.categories || []) {
    if (existingNames.has(cat.name)) { skipped++; continue; }
    categories.push({ ...cat, id: nextCategoryId++, is_default: 0 });
    existingNames.add(cat.name);
    imported++;
  }

  for (const exp of data.expenses || []) {
    expenses.push({
      id: nextExpenseId++, amount: exp.amount, category_id: exp.category_id,
      description: exp.description, raw_input: exp.raw_input,
      expense_date: exp.expense_date, created_at: exp.created_at,
    });
    imported++;
  }

  // 预算与固定收支按 db.ts 语义：预算按月去重、固定项保留 id 追加
  for (const b of data.budgets || []) {
    if (!budgets.some(x => x.category_id === b.category_id && x.month === b.month)) {
      budgets.push({ ...b, id: nextBudgetId++ });
      imported++;
    } else skipped++;
  }
  for (const f of data.fixedItems || []) {
    if (!fixedItems.some(x => x.id === f.id)) { fixedItems.push(f); imported++; }
    else skipped++;
  }

  return { imported, skipped };
}
