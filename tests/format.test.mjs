/**
 * 格式化工具函数测试
 */
import { describe, test, assert, assertEquals } from './run.mjs';

// 复制 format.ts 逻辑（因为无法直接 import TypeScript）
function formatAmount(amount) {
  return `¥${amount.toFixed(2)}`;
}

function formatShortAmount(amount) {
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(1)}万`;
  return `¥${amount.toFixed(0)}`;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${month}月${day}日 ${weekdays[date.getDay()]}`;
}

function formatMonth(month) {
  const [year, m] = month.split('-');
  return `${year}年${parseInt(m)}月`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

function getPreviousMonth(month) {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 2, 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function getNextMonth(month) {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m, 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function isCurrentMonth(month) {
  return month === getCurrentMonth();
}

function getRecentMonths(endMonth = getCurrentMonth(), count = 12) {
  const out = [];
  let m = endMonth;
  for (let i = 0; i < count; i++) {
    out.unshift(m);
    m = getPreviousMonth(m);
  }
  return out;
}

function getTodayDate() {
  const now = new Date();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

// ==================== 测试 ====================

describe('formatAmount', () => {
  test('整数金额', () => assertEquals(formatAmount(100), '¥100.00'));
  test('小数金额', () => assertEquals(formatAmount(99.5), '¥99.50'));
  test('零', () => assertEquals(formatAmount(0), '¥0.00'));
  test('大额', () => assertEquals(formatAmount(1234567.89), '¥1234567.89'));
  test('负数', () => assertEquals(formatAmount(-50), '¥-50.00'));
});

describe('formatShortAmount', () => {
  test('小于一万', () => assertEquals(formatShortAmount(500), '¥500'));
  test('一万', () => assertEquals(formatShortAmount(10000), '¥1.0万'));
  test('一万五', () => assertEquals(formatShortAmount(15000), '¥1.5万'));
  test('十万', () => assertEquals(formatShortAmount(100000), '¥10.0万'));
  test('零', () => assertEquals(formatShortAmount(0), '¥0'));
});

describe('formatDate', () => {
  test('普通日期', () => {
    const result = formatDate('2026-07-16');
    assert(result.includes('7月16日'), '应包含 7月16日');
    assert(result.includes('周'), '应包含星期');
  });
  test('月初', () => assertEquals(formatDate('2026-01-01'), '1月1日 周四'));
  test('月末', () => assertEquals(formatDate('2026-12-31'), '12月31日 周四'));
});

describe('formatMonth', () => {
  test('标准格式', () => assertEquals(formatMonth('2026-07'), '2026年7月'));
  test('一月', () => assertEquals(formatMonth('2026-01'), '2026年1月'));
  test('十二月', () => assertEquals(formatMonth('2026-12'), '2026年12月'));
});

describe('getCurrentMonth', () => {
  test('返回当前年月', () => {
    const result = getCurrentMonth();
    const [year, month] = result.split('-');
    assert(year.length === 4, '年份应为4位');
    assert(parseInt(month) >= 1 && parseInt(month) <= 12, '月份应在1-12之间');
  });
});

describe('getPreviousMonth', () => {
  test('7月→6月', () => assertEquals(getPreviousMonth('2026-07'), '2026-06'));
  test('1月→去年12月', () => assertEquals(getPreviousMonth('2026-01'), '2025-12'));
  test('3月→2月', () => assertEquals(getPreviousMonth('2026-03'), '2026-02'));
});

describe('getNextMonth', () => {
  test('10月→11月', () => assertEquals(getNextMonth('2026-10'), '2026-11'));
  test('12月→次年1月', () => assertEquals(getNextMonth('2026-12'), '2027-01'));
  test('1月→2月', () => assertEquals(getNextMonth('2026-01'), '2026-02'));
});

describe('isCurrentMonth', () => {
  test('当前月为 true', () => assert(isCurrentMonth(getCurrentMonth()), '当前月应返回 true'));
  test('非当前月为 false', () => {
    const prev = getPreviousMonth(getCurrentMonth());
    assert(!isCurrentMonth(prev), '非当前月应返回 false');
  });
});

describe('getRecentMonths', () => {
  test('返回最近3个月（旧到新）', () => {
    const result = getRecentMonths('2026-10', 3);
    assertEquals(result.length, 3);
    assertEquals(result[0], '2026-08');
    assertEquals(result[1], '2026-09');
    assertEquals(result[2], '2026-10');
  });
  test('跨年', () => {
    const result = getRecentMonths('2026-02', 3);
    assertEquals(result.join(','), '2025-12,2026-01,2026-02');
  });
  test('默认12个月且最新为当前月', () => {
    const result = getRecentMonths();
    assertEquals(result.length, 12);
    assertEquals(result[result.length - 1], getCurrentMonth());
  });
});

describe('getTodayDate', () => {
  test('返回 YYYY-MM-DD 格式', () => {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(getTodayDate()), '应匹配 YYYY-MM-DD');
  });
  test('与当前日期逐段一致', () => {
    const now = new Date();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    assertEquals(getTodayDate(), `${now.getFullYear()}-${m}-${d}`);
  });
  test('月份和日期两位补零', () => {
    const parts = getTodayDate().split('-');
    assert(parts[1].length === 2, '月份应两位');
    assert(parts[2].length === 2, '日期应两位');
  });
});