import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import ModalHeader from './ModalHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, type ThemeColors } from '../theme';
import type { Category } from '../types';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  visible: boolean;
  category: Category | null;      // 被删除分类
  categories: Category[];         // 可选目标分类（不含被删分类）
  counts: { expenses: number; budgets: number; fixedItems: number };
  onCancel: () => void;
  onConfirm: (transferTargetId: number | null) => void; // null = 连带删除账单
}

/**
 * 删除有账单数据的分类前的处置弹窗：选择账单转移目标（默认「其他」），
 * 或连带删除账单。预算恒删除、固定收支恒停用（由调用方 deleteCategoryWithData 执行）。
 */
export default function CategoryDeleteModal({ visible, category, categories, counts, onCancel, onConfirm }: Props) {
  const [selectedTarget, setSelectedTarget] = useState(0);
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(c), [c]);

  useEffect(() => {
    if (visible && category) {
      const other = categories.find(c => c.name === '其他');
      setSelectedTarget(other?.id ?? categories[0]?.id ?? 0);
    }
  }, [visible, category?.id]);

  if (!category) return null;
  const cat = category;

  function confirmCascade() {
    Alert.alert('删除确认', `将同时删除该分类下全部 ${counts.expenses} 条账单，且不可恢复。确定？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onConfirm(null) },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} onPress={onCancel} activeOpacity={1} />
        <View style={s.modal}>
          <ModalHeader title={`删除分类「${cat.icon} ${cat.name}」`} onClose={onCancel} />
          <View style={[s.body, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
            <Text style={s.info}>该分类下有 {counts.expenses} 条账单、{counts.budgets} 条预算、{counts.fixedItems} 条固定收支。</Text>
            <Text style={s.infoSub}>删除后将删除 {counts.budgets} 条预算、停用 {counts.fixedItems} 条固定收支。</Text>

            <Text style={s.label}>账单转移到：</Text>
            <View style={s.catRow}>
              {categories.map(c => (
                <TouchableOpacity key={c.id} onPress={() => setSelectedTarget(c.id)}
                  style={[s.catItem, selectedTarget === c.id && s.catItemActive]}>
                  <Text style={[s.catName, selectedTarget === c.id && s.catNameActive]}>{c.icon} {c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={() => onConfirm(selectedTarget)} disabled={!selectedTarget}
              style={[s.primaryBtn, !selectedTarget && { opacity: 0.5 }]}>
              <Text style={s.primaryText}>转移并删除分类</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmCascade} style={s.dangerBtn}>
              <Text style={s.dangerText}>删除账单并删除分类</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} style={s.cancelBtn}>
              <Text style={s.cancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdrop: { flex: 1 },
  modal: { backgroundColor: c.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  info: { fontSize: fontSize.base, color: c.text, lineHeight: 20 },
  infoSub: { fontSize: fontSize.sm, color: c.danger, marginTop: spacing.xs, marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.sm },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.lg },
  catItem: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
  catItemActive: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  catName: { fontSize: fontSize.sm, color: c.text },
  catNameActive: { color: c.primary, fontWeight: '500' },
  primaryBtn: { backgroundColor: c.primary, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: 'center', marginBottom: spacing.sm },
  primaryText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500' },
  dangerBtn: { paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: 'center', marginBottom: spacing.sm },
  dangerText: { color: c.danger, fontSize: fontSize.base, fontWeight: '500' },
  cancelBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  cancelText: { color: c.textSecondary, fontSize: fontSize.base },
});
