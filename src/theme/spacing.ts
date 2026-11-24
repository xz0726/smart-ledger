/**
 * 共享布局 token：间距 / 圆角 / 字号阶梯。
 * 各组件样式工厂引用这些常量，避免字面量各自为政（4/8/12/16 节奏、12 圆角卡片等）。
 * 不在映射内的取值（如 6/10/14 等局部微调值）保留字面量。
 */

/** 间距阶梯 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 圆角阶梯（pill 为胶囊：toast/快捷按钮/返回本月） */
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  pill: 20,
  circle: 999,
} as const;

/** 字号阶梯 */
export const fontSize = {
  xs: 11,   // tab 标签
  sm: 12,   // 次要信息 / 提示
  md: 13,   // 辅助正文
  base: 14, // 正文 / 卡片标题
  lg: 16,   // 账单金额
  xl: 20,   // 统计数值
} as const;

/** 底部 Tab 栏内容区高度（不含系统导航区；实际栏高 = 该值 + insets.bottom） */
export const TAB_BAR_CONTENT_HEIGHT = 64;
