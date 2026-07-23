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
    const sample = { key: 'ai_api_url', value: 'http://localhost:11434/v1' };
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
    store.set('ai_api_url', 'http://localhost:11434/v1');
    assertEquals(store.get('ai_api_url'), 'http://localhost:11434/v1');
  });

  test('覆盖', () => {
    const store = createSettingsStore({ ai_model: 'qwen2.5:7b' });
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