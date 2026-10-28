import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useThemeColors, type ThemeColors } from '../theme';
import type { Category } from '../types';

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
        <View style={s.modal}>
          <View style={s.header}>
            <TouchableOpacity onPress={onCancel}>
              <X size={22} color={c.textSecondary} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>删除分类「{cat.icon} {cat.name}」</Text>
            <View style={{ width: 22 }} />
          </View>
          <View style={s.body}>
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
  modal: { backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  info: { fontSize: 14, color: c.text, lineHeight: 20 },
  infoSub: { fontSize: 12, color: '#ef4444', marginTop: 4, marginBottom: 12 },
  label: { fontSize: 12, color: c.textSecondary, marginBottom: 8 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  catItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: c.border },
  catItemActive: { borderColor: '#6366f1', backgroundColor: c.primarySoftBg },
  catName: { fontSize: 12, color: c.text },
  catNameActive: { color: '#6366f1', fontWeight: '500' },
  primaryBtn: { backgroundColor: '#6366f1', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  dangerBtn: { paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  dangerText: { color: '#ef4444', fontSize: 14, fontWeight: '500' },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: c.textSecondary, fontSize: 14 },
});
