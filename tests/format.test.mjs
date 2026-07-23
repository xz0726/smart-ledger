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