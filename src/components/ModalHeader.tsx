import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useThemeColors, type ThemeColors } from '../theme';
import { spacing, fontSize } from '../theme/spacing';

interface Props {
  title: string;
  /** 传入则左侧显示关闭 X */
  onClose?: () => void;
  /** 右侧插槽（如「保存」按钮） */
  right?: React.ReactNode;
}

/**
 * 底部弹窗统一页头：左关闭 X · 绝对居中标题（插槽再宽也不偏移）· 右插槽。
 * 所有底部弹窗共用，与面板底部圆角（radius.lg）配套。
 */
export default function ModalHeader({ title, onClose, right }: Props) {
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);
  return (
    <View style={s.header}>
      <View style={s.side}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <X size={22} color={c.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={s.titleWrap} pointerEvents="none">
        <Text style={s.title} numberOfLines={1}>{title}</Text>
      </View>
      <View style={s.side}>{right}</View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.subtle,
  },
  side: { minWidth: 56, alignItems: 'flex-start' },
  titleWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: c.text, marginHorizontal: 72 },
});
