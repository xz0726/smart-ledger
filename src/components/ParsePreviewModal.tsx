import React, { useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useThemeColors, type ThemeColors } from '../theme';
import type { ParsedExpense } from '../types';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  visible: boolean;
  items: ParsedExpense[];
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 解析结果预览确认面板：一次输入识别出多条记录时，先展示再确认入账
 */
export default function ParsePreviewModal({ visible, items, onConfirm, onCancel }: Props) {
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} onPress={onCancel} activeOpacity={1} />
        <View style={s.panel}>
          <Text style={s.title}>识别到 {items.length} 笔记录</Text>
          <ScrollView style={{ maxHeight: 320 }} bounces={false}>
            {items.map((item, i) => (
              <View key={i} style={s.row}>
                <Text style={s.amount}>¥{item.amount.toFixed(2)}</Text>
                <View style={s.rowInfo}>
                  <Text style={s.category}>{item.category}</Text>
                  {item.description ? <Text style={s.description} numberOfLines={1}>{item.description}</Text> : null}
                  <Text style={s.date}>{item.date}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.btn, s.btnCancel]} onPress={onCancel}>
              <Text style={s.btnCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnConfirm]} onPress={onConfirm}>
              <Text style={s.btnConfirmText}>确认记账（{items.length}笔）</Text>
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
  panel: { backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: c.text, marginBottom: spacing.md, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.subtle },
  amount: { fontSize: fontSize.lg, fontWeight: '600', color: c.primary, width: 80 },
  rowInfo: { flex: 1 },
  category: { fontSize: fontSize.base, fontWeight: '500', color: c.text },
  description: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
  date: { fontSize: fontSize.xs, color: c.hint, marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: 10, alignItems: 'center' },
  btnCancel: { backgroundColor: c.subtle },
  btnCancelText: { color: c.textSecondary, fontSize: 15, fontWeight: '500' },
  btnConfirm: { backgroundColor: c.primary },
  btnConfirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
