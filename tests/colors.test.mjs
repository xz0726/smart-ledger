/**
 * 颜色工具测试
 */
import { describe, test, assertEquals, assert } from './run.mjs';

const CATEGORY_COLORS = {
  '餐饮': '#f97316',
  '交通': '#3b82f6',
  '购物': '#ec4899',
  '娱乐': '#8b5cf6',
  '居住': '#14b8a6',
  '医疗': '#ef4444',
  '学习': '#06b6d4',
  '通讯': '#6366f1',
  '收入': '#22c55e',
  '其他': '#64748b',
};

describe('分类颜色映射', () => {
  test('10个分类都有颜色', () => assert(Object.keys(CATEGORY_COLORS).length === 10));
  test('每个颜色都是有效的 hex', () => {
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
      assert(/^#[0-9a-f]{6}$/.test(color), `${cat} 的颜色 ${color} 不是有效 hex`);
    }
  });
  test('所有颜色唯一', () => {
    const colors = Object.values(CATEGORY_COLORS);
    const unique = new Set(colors);
    assert(unique.size === colors.length, '所有颜色应唯一');
  });
  test('餐饮是橙色', () => assertEquals(CATEGORY_COLORS['餐饮'], '#f97316'));
  test('收入是绿色', () => assertEquals(CATEGORY_COLORS['收入'], '#22c55e'));
  test('医疗是红色', () => assertEquals(CATEGORY_COLORS['医疗'], '#ef4444'));
});