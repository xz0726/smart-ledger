import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Keyboard, Alert, StyleSheet } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { useThemeColors, type ThemeColors } from '../theme';
import type { ExpenseWithCategory, Category } from '../types';
import { getCategories } from '../services/db';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  visible: boolean;
  expense: ExpenseWithCategory | null;
  onClose: () => void;
  onSave: (id: number, updates: { amount?: number; categoryId?: number; description?: string; expenseDate?: string }) => Promise<void>;
}

export default function EditExpenseModal({ visible, expense, onClose, onSave }: Props) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  useEffect(() => {
    if (visible && expense) {
      setAmount(expense.amount.toString());
      setDescription(expense.description || '');
      setDate(expense.expense_date);
      setSelectedCategoryId(expense.category_id);
      getCategories().then(list => {
        // 同名去重（旧版本遗留重复行，避免选择器里出现两个「餐饮」）
        const seen = new Set<string>();
        setCategories(list.filter(c => seen.has(c.name) ? false : (seen.add(c.name), true)));
      }).catch(console.error);
    }
  }, [visible, expense]);

  async function handleSave() {
    if (!expense) return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { Alert.alert('金额无效'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('日期格式错误'); return; }
    if (selectedCategoryId === 0) { Alert.alert('请选择分类'); return; }
    setSaving(true);
    try { await onSave(expense.id, { amount: amountNum, categoryId: selectedCategoryId, description: description.trim() || undefined, expenseDate: date }); onClose(); }
    catch (e: any) { Alert.alert('保存失败', e.message); }
    finally { setSaving(false); }
  }

  if (!expense) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.overlay}>
          <TouchableOpacity style={s.backdrop} onPress={() => { Keyboard.dismiss(); onClose(); }} activeOpacity={1} />
          <View style={s.modal}>
            {/* header 的「保存」必须在 keyboardShouldPersistTaps="handled" 的 ScrollView 内：
                键盘弹出时点击，'never' 默认会把首次触点交给收键盘而吞掉按钮点击 */}
            <ScrollView keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => Keyboard.dismiss()}>
            <View style={s.header}>
              <TouchableOpacity onPress={onClose}><X size={22} color={c.textSecondary} /></TouchableOpacity>
              <Text style={s.headerTitle}>编辑账单</Text>
              <TouchableOpacity onPressIn={() => { Keyboard.dismiss(); handleSave(); }} disabled={saving} style={s.saveBtn}>
                <Check size={16} color="white" />
                <Text style={s.saveText}>{saving ? '保存中…' : '保存'}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.body}>
              <Text style={s.label}>金额</Text>
              <View style={s.amountRow}>
                <Text style={s.yuan}>¥</Text>
                <TextInput style={s.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.disabled} autoFocus />
              </View>
              <Text style={s.label}>分类</Text>
              <View style={s.catGrid}>
                {categories.map(cat => (
                  <TouchableOpacity key={cat.id} onPress={() => setSelectedCategoryId(cat.id)}
                    style={[s.catItem, selectedCategoryId === cat.id && s.catItemActive]}>
                    <Text>{cat.icon}</Text>
                    <Text style={[s.catName, selectedCategoryId === cat.id && s.catNameActive]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>描述</Text>
              <TextInput style={s.field} value={description} onChangeText={setDescription} placeholder="备注信息" placeholderTextColor={c.hint} />
              <Text style={s.label}>日期</Text>
              <TextInput style={s.field} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.hint} autoCapitalize="none" />
              {expense.raw_input ? <><Text style={s.label}>原始输入</Text><Text style={s.raw}>{expense.raw_input}</Text></> : null}
            </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  flex1: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdrop: { flex: 1 },
  modal: { backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.subtle },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '600', color: c.text },
  saveBtn: { backgroundColor: c.primary, paddingHorizontal: spacing.lg, paddingVertical: 6, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center' },
  saveText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500', marginLeft: spacing.xs },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  label: { fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.xs },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  yuan: { fontSize: 18, color: c.text, fontWeight: '600', marginRight: spacing.sm },
  amountInput: { flex: 1, backgroundColor: c.inputBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 18, color: c.text, fontWeight: '600', borderWidth: 1, borderColor: c.border },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  catItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  catItemActive: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  catName: { fontSize: fontSize.md, color: c.textSecondary, marginLeft: spacing.xs },
  catNameActive: { color: c.primary, fontWeight: '500' },
  field: { backgroundColor: c.inputBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSize.base, color: c.text, borderWidth: 1, borderColor: c.border, marginBottom: spacing.lg },
  raw: { fontSize: fontSize.base, color: c.textSecondary, backgroundColor: c.inputBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.lg },
});
