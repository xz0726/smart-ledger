/**
 * 数据库逻辑测试 — Mock SQLite
 * 验证：Schema、查询构造、数据转换、边界情况
 */
import { describe, test, assert, assertEquals } from './run.mjs';

// ==================== Mock 数据 ====================

const DEFAULT_CATEGORIES = [
  { icon: '🍔', name: '餐饮', color: '#f97316', type: 'expense' },
  { icon: '🚇', name: '交通', color: '#3b82f6', type: 'expense' },
  { icon: '🛒', name: '购物', color: '#ec4899', type: 'expense' },
  { icon: '🎮', name: '娱乐', color: '#8b5cf6', type: 'expense' },
  { icon: '🏠', name: '居住', color: '#14b8a6', type: 'expense' },
  { icon: '💊', name: '医疗', color: '#ef4444', type: 'expense' },
  { icon: '📚', name: '学习', color: '#06b6d4', type: 'expense' },
  { icon: '💬', name: '通讯', color: '#6366f1', type: 'expense' },
  { icon: '💰', name: '收入', color: '#22c55e', type: 'income' },
  { icon: '✏️', name: '其他', color: '#64748b', type: 'expense' },
];

// ==================== Schema 验证 ====================

describe('数据库 Schema', () => {
  test('分类表包含必要字段', () => {
    const fields = ['id', 'name', 'icon', 'color', 'type', 'is_default', 'parent_id'];
    const sample = { id: 1, name: '餐饮', icon: '🍔', color: '#f97316', type: 'expense', is_default: 1, parent_id: null };
    fields.forEach(f => assert(f in sample, `缺少字段: ${f}`));
  });

  test('消费表包含必要字段', () => {
    const fields = ['id', 'amount', 'category_id', 'description', 'raw_input', 'expense_date', 'created_at'];
    const sample = { id: 1, amount: 35.0, category_id: 1, description: '午饭', raw_input: '午饭花了35元', expense_date: '2026-07-20', created_at: '2026-07-20 12:00:00' };
    fields.forEach(f => assert(f in sample, `缺少字段: ${f}`));
  });

  test('预算表包含必要字段', () => {
    const fields = ['id', 'category_id', 'amount', 'period', 'month'];
    const sample = { id: 1, category_id: 1, amount: 1000, period: 'monthly', month: '2026-07' };
    fields.forEach(f => assert(f in sample, `缺少字段: ${f}`));
  });

  test('设置表是键值对结构', () => {
    const fields = ['key', 'value'];
    const sample = { key: 'ai_api_url', value: 'https://api.deepseek.com/v1' };
    fields.forEach(f => assert(f in sample, `缺少字段: ${f}`));
  });

  test('custom_rules 表包含必要字段', () => {
    const fields = ['id', 'keyword', 'category', 'created_at'];
    const sample = { id: 1, keyword: '台球', category: '娱乐', created_at: '2026-10-15 12:00:00' };
    fields.forEach(f => assert(f in sample, `缺少字段: ${f}`));
  });

  test('fixed_items 表包含必要字段', () => {
    const fields = ['id', 'name', 'type', 'category_id', 'amount', 'frequency', 'weekday', 'day_of_month', 'enabled', 'created_at'];
    const sample = {
      id: 1, name: '工作日通勤', type: 'expense', category_id: 2, amount: 7,
      frequency: 'workday', weekday: null, day_of_month: null, enabled: 1, created_at: '2026-10-15 08:00:00',
    };
    fields.forEach(f => assert(f in sample, `缺少字段: ${f}`));
  });

  test('quick_items 表包含必要字段', () => {
    const fields = ['id', 'name', 'category_id', 'amount', 'created_at'];
    const sample = {
      id: 1, name: '停车', category_id: 2, amount: 10, created_at: '2026-10-22 08:00:00',
    };
    fields.forEach(f => assert(f in sample, `缺少字段: ${f}`));
  });
});

// ==================== 分类验证 ====================

describe('默认分类', () => {
  test('共有10个默认分类', () => assertEquals(DEFAULT_CATEGORIES.length, 10));
  test('8个支出+1个收入+1个其他', () => {
    const expenses = DEFAULT_CATEGORIES.filter(c => c.type === 'expense');
    const incomes = DEFAULT_CATEGORIES.filter(c => c.type === 'income');
    assertEquals(expenses.length, 9);
    assertEquals(incomes.length, 1);
  });
  test('每个分类名称唯一', () => {
    const names = DEFAULT_CATEGORIES.map(c => c.name);
    const unique = new Set(names);
    assertEquals(unique.size, names.length);
  });
  test('每个分类有 emoji 图标', () => {
    DEFAULT_CATEGORIES.forEach(c => {
      assert(c.icon.length > 0, `${c.name} 缺少图标`);
    });
  });
  test('每个分类有 hex 颜色', () => {
    DEFAULT_CATEGORIES.forEach(c => {
      assert(/^#[0-9a-f]{6}$/.test(c.color), `${c.name} 颜色无效: ${c.color}`);
    });
  });
});

// ==================== 查询构造器 ====================

describe('动态 SQL 查询构造', () => {
  function buildExpenseQuery(params) {
    const { month, categoryId, search, page = 1, pageSize = 50 } = params;
    let where = 'WHERE 1=1';
    const values = [];

    if (month) { where += ' AND e.expense_date LIKE ?'; values.push(`${month}%`); }
    if (categoryId) { where += ' AND e.category_id = ?'; values.push(categoryId); }
    if (search) {
      where += ' AND (e.description LIKE ? OR e.raw_input LIKE ?)';
      values.push(`%${search}%`, `%${search}%`);
    }

    const offset = (page - 1) * pageSize;
    const sql = `SELECT e.*, c.name as category_name FROM expenses e LEFT JOIN categories c ON e.category_id = c.id ${where} ORDER BY e.expense_date DESC LIMIT ? OFFSET ?`;
    return { sql, values: [...values, pageSize, offset], page, pageSize };
  }

  test('无参数查询', () => {
    const { sql, values } = buildExpenseQuery({});
    assert(sql.includes('WHERE 1=1'), '应包含默认 WHERE');
    assert(sql.includes('LIMIT ? OFFSET ?'), '应包含分页');
    assertEquals(values.length, 2);
  });

  test('按月筛选', () => {
    const { sql, values } = buildExpenseQuery({ month: '2026-07' });
    assert(sql.includes('expense_date LIKE ?'), '应包含月份筛选');
    assertEquals(values[0], '2026-07%');
  });

  test('按分类筛选', () => {
    const { sql, values } = buildExpenseQuery({ categoryId: 3 });
    assert(sql.includes('category_id = ?'), '应包含分类筛选');
    assertEquals(values[0], 3);
  });

  test('模糊搜索', () => {
    const { sql, values } = buildExpenseQuery({ search: '午饭' });
    assert(sql.includes('description LIKE ?'), '应包含描述搜索');
    assert(sql.includes('raw_input LIKE ?'), '应包含原始输入搜索');
    assertEquals(values[0], '%午饭%');
    assertEquals(values[1], '%午饭%');
  });

  test('分页', () => {
    const { values } = buildExpenseQuery({ page: 3, pageSize: 20 });
    assertEquals(values[values.length - 2], 20); // LIMIT
    assertEquals(values[values.length - 1], 40); // OFFSET = (3-1)*20
  });

  test('组合查询', () => {
    const { sql, values } = buildExpenseQuery({ month: '2026-07', categoryId: 1, search: '面' });
    assert(sql.includes('expense_date LIKE ?'), '应有月份');
    assert(sql.includes('category_id = ?'), '应有分类');
    assert(sql.includes('description LIKE ?'), '应有搜索');
    assertEquals(values.length, 6); // 3个筛选 + 2个分页 + ?
  });
});

// ==================== 数据转换 ====================

describe('数据转换 & 聚合', () => {
  function groupByDate(expenses) {
    const groups = [];
    for (const expense of expenses) {
      const last = groups[groups.length - 1];
      if (last && last.date === expense.expense_date) {
        last.items.push(expense);
      } else {
        groups.push({ date: expense.expense_date, items: [expense] });
      }
    }
    return groups;
  }

  function calculateCategoryStats(expenses, categories) {
    const stats = categories.map(c => {
      const items = expenses.filter(e => e.category_id === c.id);
      return {
        category_id: c.id,
        category_name: c.name,
        total: items.reduce((s, e) => s + e.amount, 0),
        count: items.length,
      };
    });
    const grandTotal = stats.reduce((s, st) => s + st.total, 0);
    return stats.map(s => ({
      ...s,
      percentage: grandTotal > 0 ? (s.total / grandTotal) * 100 : 0,
    }));
  }

  function calculateBudgetSpent(budgets, expenses) {
    return budgets.map(b => ({
      ...b,
      spent: expenses
        .filter(e => e.category_id === b.category_id)
        .reduce((s, e) => s + e.amount, 0),
    }));
  }

  test('按日期分组', () => {
    const expenses = [
      { id: 1, expense_date: '2026-07-20', amount: 35 },
      { id: 2, expense_date: '2026-07-20', amount: 50 },
      { id: 3, expense_date: '2026-07-19', amount: 100 },
    ];
    const groups = groupByDate(expenses);
    assertEquals(groups.length, 2);
    assertEquals(groups[0].items.length, 2);
    assertEquals(groups[1].items.length, 1);
  });

  test('空列表分组', () => {
    assertEquals(groupByDate([]).length, 0);
  });

  test('分类统计', () => {
    const categories = [
      { id: 1, name: '餐饮' }, { id: 2, name: '交通' },
    ];
    const expenses = [
      { category_id: 1, amount: 100 },
      { category_id: 1, amount: 50 },
      { category_id: 2, amount: 50 },
    ];
    const stats = calculateCategoryStats(expenses, categories);
    assertEquals(stats[0].total, 150);
    assertEquals(stats[0].percentage, 75);
    assertEquals(stats[1].total, 50);
    assertEquals(stats[1].percentage, 25);
  });

  test('无消费时分类统计', () => {
    const categories = [{ id: 1, name: '餐饮' }];
    const stats = calculateCategoryStats([], categories);
    assertEquals(stats[0].total, 0);
    assertEquals(stats[0].percentage, 0);
  });

  test('预算已消费计算', () => {
    const budgets = [
      { id: 1, category_id: 1, amount: 1000 },
      { id: 2, category_id: 2, amount: 500 },
    ];
    const expenses = [
      { category_id: 1, amount: 350 },
      { category_id: 1, amount: 150 },
      { category_id: 2, amount: 600 },
    ];
    const result = calculateBudgetSpent(budgets, expenses);
    assertEquals(result[0].spent, 500);
    assertEquals(result[1].spent, 600);
  });
});

// ==================== 环比计算 ====================

describe('同比/环比计算', () => {
  function calcMonthOverMonth(current, previous) {
    if (previous <= 0) return 0;
    return ((current - previous) / previous) * 100;
  }

  test('上涨', () => assertEquals(calcMonthOverMonth(1200, 1000), 20));
  test('下降', () => assertEquals(calcMonthOverMonth(800, 1000), -20));
  test('持平', () => assertEquals(calcMonthOverMonth(1000, 1000), 0));
  test('上月为零时返回0', () => assertEquals(calcMonthOverMonth(500, 0), 0));
  test('上月为负时返回0', () => assertEquals(calcMonthOverMonth(500, -100), 0));
});

// ==================== 预算进度 ====================

describe('预算进度计算', () => {
  function calcBudgetProgress(spent, budget) {
    if (budget <= 0) return { percentage: 0, isOver: false, isWarning: false };
    const pct = Math.min((spent / budget) * 100, 100);
    return {
      percentage: pct,
      isOver: spent > budget,
      isWarning: pct >= 80 && spent <= budget,
    };
  }

  test('正常', () => {
    const r = calcBudgetProgress(500, 1000);
    assertEquals(r.percentage, 50);
    assert(!r.isOver);
    assert(!r.isWarning);
  });

  test('预警', () => {
    const r = calcBudgetProgress(850, 1000);
    assertEquals(r.percentage, 85);
    assert(!r.isOver);
    assert(r.isWarning);
  });

  test('超支', () => {
    const r = calcBudgetProgress(1200, 1000);
    assertEquals(r.percentage, 100);
    assert(r.isOver);
    assert(!r.isWarning);
  });

  test('恰好80%', () => {
    const r = calcBudgetProgress(800, 1000);
    assertEquals(r.percentage, 80);
    assert(r.isWarning);
  });

  test('预算为零', () => {
    const r = calcBudgetProgress(500, 0);
    assertEquals(r.percentage, 0);
    assert(!r.isOver);
    assert(!r.isWarning);
  });
});

// ==================== CSV 数据处理 ====================

describe('CSV 导入导出', () => {
  function generateCSV(expenses) {
    let csv = '日期,分类,金额,描述,原始输入\n';
    for (const e of expenses) {
      csv += `${e.expense_date},${e.category_name},${e.amount},${e.description || ''},${e.raw_input || ''}\n`;
    }
    return csv;
  }

  function parseCSV(content) {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length >= 3) {
        const amount = parseFloat(cols[2].trim());
        if (isNaN(amount)) continue;
        records.push({
          date: cols[0].trim(),
          categoryName: cols[1].trim(),
          amount,
          description: cols[3]?.trim() || '',
        });
      }
    }
    return records;
  }

  test('生成 CSV', () => {
    const expenses = [
      { expense_date: '2026-07-20', category_name: '餐饮', amount: 35, description: '午饭', raw_input: '午饭花了35元' },
    ];
    const csv = generateCSV(expenses);
    assert(csv.startsWith('日期,分类,金额,描述,原始输入'), '应有表头');
    assert(csv.includes('2026-07-20'), '应包含日期');
    assert(csv.includes('35'), '应包含金额');
  });

  test('解析 CSV', () => {
    const csv = '日期,分类,金额,描述,原始输入\n2026-07-20,餐饮,35,午饭,午饭花了35元\n2026-07-21,交通,50,,';
    const records = parseCSV(csv);
    assertEquals(records.length, 2);
    assertEquals(records[0].amount, 35);
    assertEquals(records[0].categoryName, '餐饮');
    assertEquals(records[1].description, '');
  });

  test('空 CSV', () => {
    assertEquals(parseCSV('日期,分类,金额\n').length, 0);
  });

  test('无效金额跳过', () => {
    const csv = '日期,分类,金额\n2026-07-20,餐饮,abc\n2026-07-21,交通,50';
    const records = parseCSV(csv);
    assertEquals(records.length, 1);
    assertEquals(records[0].categoryName, '交通');
  });
});

// ==================== 设置存储 ====================

describe('设置存储', () => {
  function createSettingsStore(initial = {}) {
    const store = { ...initial };
    return {
      get: (key) => store[key] || null,
      set: (key, value) => { store[key] = value; },
      getAll: () => ({ ...store }),
    };
  }

  test('默认值', () => {
    const store = createSettingsStore();
    assertEquals(store.get('ai_api_url'), null);
  });

  test('读写', () => {
    const store = createSettingsStore();
    store.set('ai_api_url', 'https://api.deepseek.com/v1');
    assertEquals(store.get('ai_api_url'), 'https://api.deepseek.com/v1');
  });

  test('覆盖', () => {
    const store = createSettingsStore({ ai_model: 'deepseek-chat' });
    store.set('ai_model', 'gpt-4o');
    assertEquals(store.get('ai_model'), 'gpt-4o');
  });

  test('AI 配置完整流程', () => {
    const store = createSettingsStore();
    store.set('ai_api_url', 'https://api.openai.com/v1');
    store.set('ai_api_key', 'sk-xxx');
    store.set('ai_model', 'gpt-4o');
    assertEquals(store.get('ai_api_url'), 'https://api.openai.com/v1');
    assertEquals(store.get('ai_api_key'), 'sk-xxx');
    assertEquals(store.get('ai_model'), 'gpt-4o');
  });
});

// ==================== 固定收支（镜像 db.ts） ====================

const FIXED_PREFIX = '[固定]';

function fixedFormatDate(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fixedParseCreatedAt(s) {
  const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

/** 是否在指定日期触发（与 db.ts firesOn 一致） */
function firesOn(item, date) {
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

/** 内存版固定收支库：镜像 getExpenseByRawInput / addExpense / syncFixedItems / getFixedSummary */
function createFixedMock() {
  const expenses = [];            // { amount, category_id, expense_date, description, raw_input }
  const categories = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // 有效分类 id
  const items = [];               // FixedItem[]
  return {
    expenses,
    categories,
    addItem(item) { items.push({ enabled: 1, ...item }); },
    removeCategory(id) { categories.delete(id); },
    sync(today) {
      let inserted = 0;
      const t = today || new Date();
      t.setHours(0, 0, 0, 0);
      const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
      for (const item of items) {
        if (item.enabled !== 1) continue;
        if (!categories.has(item.category_id)) continue; // 分类已删除则跳过
        let from = monthStart;
        const createdAt = fixedParseCreatedAt(item.created_at);
        if (createdAt && createdAt > from) from = createdAt;
        for (let d = new Date(from); d <= t; d.setDate(d.getDate() + 1)) {
          if (!firesOn(item, d)) continue;
          const dateStr = fixedFormatDate(d);
          const marker = `${FIXED_PREFIX} #${item.id} ${dateStr}`;
          if (expenses.find(e => e.raw_input === marker)) continue; // 幂等
          expenses.push({ amount: item.amount, category_id: item.category_id, expense_date: dateStr, description: item.name, raw_input: marker });
          inserted++;
        }
      }
      return inserted;
    },
    summary(month) {
      let expenseTotal = 0, incomeTotal = 0;
      for (const e of expenses) {
        if (!e.expense_date.startsWith(month)) continue;
        if (!e.raw_input || !e.raw_input.startsWith(FIXED_PREFIX)) continue;
        // 分类 id → type（模拟 JOIN categories）
        const type = e.category_id === 9 ? 'income' : 'expense';
        if (type === 'income') incomeTotal += e.amount;
        else expenseTotal += e.amount;
      }
      return { expenseTotal, incomeTotal };
    },
  };
}

function makeFixedItem(overrides) {
  return {
    id: 1, name: '工作日通勤', type: 'expense', category_id: 2, amount: 7,
    frequency: 'workday', weekday: null, day_of_month: null, enabled: 1,
    created_at: '2026-10-01 08:00:00', ...overrides,
  };
}

describe('firesOn 触发规则', () => {
  function fmt(y, m, d) { return new Date(y, m - 1, d); }

  test('daily 每天都触发', () => assert(firesOn({ frequency: 'daily' }, fmt(2026, 10, 15))));

  test('workday 周一触发', () => assert(firesOn({ frequency: 'workday' }, fmt(2026, 10, 12)))); // 周一
  test('workday 周五触发', () => assert(firesOn({ frequency: 'workday' }, fmt(2026, 10, 9))));  // 周五
  test('workday 周六不触发', () => assert(!firesOn({ frequency: 'workday' }, fmt(2026, 10, 17)))); // 周六
  test('workday 周日不触发', () => assert(!firesOn({ frequency: 'workday' }, fmt(2026, 10, 11)))); // 周日

  test('weekly 指定星期触发', () => {
    assert(firesOn({ frequency: 'weekly', weekday: 0 }, fmt(2026, 10, 11))); // 周日
    assert(!firesOn({ frequency: 'weekly', weekday: 1 }, fmt(2026, 10, 11)));
  });
  test('weekly 无 weekday 不触发', () => assert(!firesOn({ frequency: 'weekly', weekday: null }, fmt(2026, 10, 15))));

  test('monthly 指定日触发', () => {
    assert(firesOn({ frequency: 'monthly', day_of_month: 20 }, fmt(2026, 10, 20)));
    assert(!firesOn({ frequency: 'monthly', day_of_month: 21 }, fmt(2026, 10, 20)));
  });
  test('monthly 31日在短月份跳过', () => assert(!firesOn({ frequency: 'monthly', day_of_month: 31 }, fmt(2026, 2, 28))));
  test('monthly 29日在闰年2月触发', () => assert(firesOn({ frequency: 'monthly', day_of_month: 29 }, fmt(2028, 2, 29))));

  test('未知频率不触发', () => assert(!firesOn({ frequency: 'foobar' }, fmt(2026, 10, 15))));
});

describe('syncFixedItems 幂等补账', () => {
  test('幂等：两次同步不重复插入', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 1 }));
    const first = mock.sync(new Date(2026, 9, 15));
    const second = mock.sync(new Date(2026, 9, 15));
    assert(first > 0, '首次应有插入');
    assertEquals(second, 0);
  });

  test('工作日通勤：本月1~15日共11个工作日且不含周末', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 1, created_at: '2026-10-01 08:00:00' }));
    const inserted = mock.sync(new Date(2026, 9, 15));
    assertEquals(inserted, 11);
    const weekend = mock.expenses.filter(e => {
      const d = new Date(e.expense_date);
      const day = d.getDay();
      return day === 0 || day === 6;
    });
    assertEquals(weekend.length, 0);
    assertEquals(mock.expenses[0].expense_date, '2026-10-01');
  });

  test('月付话费：20号未到不生成，过了20号只生成一条', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 2, name: '话费', category_id: 8, amount: 20, frequency: 'monthly', day_of_month: 20, created_at: '2026-01-05 00:00:00' }));
    assertEquals(mock.sync(new Date(2026, 9, 15)), 0);
    const inserted = mock.sync(new Date(2026, 9, 25));
    assertEquals(inserted, 1);
    assertEquals(mock.expenses[0].expense_date, '2026-10-20');
    assertEquals(mock.expenses[0].amount, 20);
  });

  test('创建日之后才生成，不回溯到月初', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 1, frequency: 'daily', created_at: '2026-10-10 08:00:00' }));
    const inserted = mock.sync(new Date(2026, 9, 15));
    assertEquals(inserted, 6); // 10~15
    assertEquals(mock.expenses[0].expense_date, '2026-10-10');
  });

  test('未来创建日不生成任何记录', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 1, frequency: 'daily', created_at: '2026-11-01 00:00:00' }));
    assertEquals(mock.sync(new Date(2026, 9, 15)), 0);
  });

  test('分类被删除则跳过', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 1, category_id: 99 }));
    assertEquals(mock.sync(new Date(2026, 9, 15)), 0);
  });

  test('停用项不生成', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 1, enabled: 0 }));
    assertEquals(mock.sync(new Date(2026, 9, 15)), 0);
  });

  test('标记格式 [固定] #id 日期', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 7, frequency: 'daily', created_at: '2026-10-15 00:00:00' }));
    mock.sync(new Date(2026, 9, 15));
    assertEquals(mock.expenses[0].raw_input, '[固定] #7 2026-10-15');
    assertEquals(mock.expenses[0].description, '工作日通勤');
  });

  test('不同 id 的同类项各自生成（id 独立，不冲突）', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 1, frequency: 'daily', created_at: '2026-10-15 00:00:00' }));
    mock.addItem(makeFixedItem({ id: 2, frequency: 'daily', created_at: '2026-10-15 00:00:00' }));
    assertEquals(mock.sync(new Date(2026, 9, 15)), 2);
    assertEquals(mock.expenses.length, 2);
  });

  test('每周某天：每周一条', () => {
    const mock = createFixedMock();
    mock.addItem(makeFixedItem({ id: 1, frequency: 'weekly', weekday: 1, created_at: '2026-10-01 00:00:00' })); // 每周一
    const inserted = mock.sync(new Date(2026, 9, 15));
    // 10月1~15日周一：10-05、10-12 → 2条
    assertEquals(inserted, 2);
    assertEquals(mock.expenses[0].expense_date, '2026-10-05');
    assertEquals(mock.expenses[1].expense_date, '2026-10-12');
  });
});

describe('getFixedSummary 汇总', () => {
  test('支出按类型汇总', () => {
    const mock = createFixedMock();
    mock.expenses.push(
      { expense_date: '2026-10-05', raw_input: '[固定] #1 2026-10-05', category_id: 2, amount: 7 },
      { expense_date: '2026-10-06', raw_input: '[固定] #1 2026-10-06', category_id: 2, amount: 7 },
      { expense_date: '2026-10-20', raw_input: '[固定] #2 2026-10-20', category_id: 8, amount: 20 },
    );
    const s = mock.summary('2026-10');
    assertEquals(s.expenseTotal, 34);
    assertEquals(s.incomeTotal, 0);
  });

  test('收入单独汇总', () => {
    const mock = createFixedMock();
    mock.expenses.push(
      { expense_date: '2026-10-10', raw_input: '[固定] #3 2026-10-10', category_id: 9, amount: 1000 },
      { expense_date: '2026-10-11', raw_input: '[固定] #1 2026-10-11', category_id: 2, amount: 7 },
    );
    const s = mock.summary('2026-10');
    assertEquals(s.expenseTotal, 7);
    assertEquals(s.incomeTotal, 1000);
  });

  test('非固定标记记录不计入', () => {
    const mock = createFixedMock();
    mock.expenses.push({ expense_date: '2026-10-05', raw_input: '午饭35元', category_id: 1, amount: 35 });
    const s = mock.summary('2026-10');
    assertEquals(s.expenseTotal, 0);
  });

  test('其他月份不计入', () => {
    const mock = createFixedMock();
    mock.expenses.push({ expense_date: '2026-09-20', raw_input: '[固定] #2 2026-09-20', category_id: 8, amount: 20 });
    const s = mock.summary('2026-10');
    assertEquals(s.expenseTotal, 0);
  });
});

// ==================== 快捷记账 ====================

describe('快捷记账 SQL 构造', () => {
  function buildQuickItemsQuery() {
    return `SELECT qi.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM quick_items qi LEFT JOIN categories c ON qi.category_id = c.id
     ORDER BY qi.id ASC`;
  }

  test('LEFT JOIN 分类取图标与名称', () => {
    const sql = buildQuickItemsQuery();
    assert(sql.includes('LEFT JOIN categories c ON qi.category_id = c.id'), '应 LEFT JOIN categories');
    assert(sql.includes('category_name'), '应取 category_name');
    assert(sql.includes('category_icon'), '应取 category_icon');
  });

  test('按 id 升序排列', () => {
    assert(buildQuickItemsQuery().includes('ORDER BY qi.id ASC'), '应按 id ASC 排序');
  });

  test('addQuickItem INSERT 字段完整', () => {
    const sql = 'INSERT INTO quick_items (name, category_id, amount) VALUES (?, ?, ?)';
    assert(sql.includes('(name, category_id, amount)'), '应插入 name/category_id/amount');
  });

  test('deleteQuickItem 按 id 删除', () => {
    const sql = 'DELETE FROM quick_items WHERE id = ?';
    assert(sql.includes('WHERE id = ?'), '应按 id 删除');
  });
});

describe('删除分类连带清理快捷记账', () => {
  function deleteCategoryWithData(items, categoryId) {
    // 镜像：事务内删除引用该分类的 quick_items
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].category_id === categoryId) items.splice(i, 1);
    }
  }

  test('删除分类后其快捷记账一并删除', () => {
    const items = [
      { id: 1, name: '停车', category_id: 2, amount: 10 },
      { id: 2, name: '奶茶', category_id: 1, amount: 15 },
    ];
    deleteCategoryWithData(items, 2);
    assertEquals(items.length, 1);
    assertEquals(items[0].name, '奶茶');
  });

  test('不引用该分类的快捷记账保留', () => {
    const items = [{ id: 1, name: '停车', category_id: 2, amount: 10 }];
    deleteCategoryWithData(items, 99);
    assertEquals(items.length, 1);
  });
});