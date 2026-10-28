import { create } from 'zustand';

/**
 * 分类数据版本号：分类管理里新增/删除分类后 bump，
 * 设置页内其他使用分类选择器的模块（预算/固定收支/自定义规则）据此联动刷新。
 */
interface CategoryStoreState {
  revision: number;
  bump: () => void;
}

export const useCategoryStore = create<CategoryStoreState>((set) => ({
  revision: 0,
  bump: () => set(s => ({ revision: s.revision + 1 })),
}));
