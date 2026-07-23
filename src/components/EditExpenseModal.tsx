import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { X, Check } from 'lucide-react-native';
import type { ExpenseWithCategory, Category } from '../types';
import { getCategories } from '../services/db';

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

  useEffect(() => {
    if (visible && expense) {
      setAmount(expense.amount.toString());
      setDescription(expense.description || '');
      setDate(expense.expense_date);
      setSelectedCategoryId(expense.category_id);
      getCategories().then(setCategories).catch(console.error);
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
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView style={s.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.header}>
              <TouchableOpacity onPress={onClose}><X size={22} color="#64748b" /></TouchableOpacity>
              <Text style={s.headerTitle}>编辑账单</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving} style={s.saveBtn}>
                <Check size={16} color="white" />
                <Text style={s.saveText}>{saving ? '保存中…' : '保存'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.body}>
              <Text style={s.label}>金额</Text>
              <View style={s.amountRow}>
                <Text style={s.yuan}>¥</Text>
                <TextInput style={s.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#cbd5e1" autoFocus />
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
              <TextInput style={s.field} value={description} onChangeText={setDescription} placeholder="备注信息" placeholderTextColor="#94a3b8" />
              <Text style={s.label}>日期</Text>
              <TextInput style={s.field} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" autoCapitalize="none" />
              {expense.raw_input ? <><Text style={s.label}>原始输入</Text><Text style={s.raw}>{expense.raw_input}</Text></> : null}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  saveBtn: { backgroundColor: '#6366f1', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '500', marginLeft: 4 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  label: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  yuan: { fontSize: 18, color: '#1e293b', fontWeight: '600', marginRight: 8 },
  amountInput: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, color: '#1e293b', fontWeight: '600', borderWidth: 1, borderColor: '#e2e8f0' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  catItemActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  catName: { fontSize: 13, color: '#64748b', marginLeft: 4 },
  catNameActive: { color: '#6366f1', fontWeight: '500' },
  field: { backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  raw: { fontSize: 14, color: '#64748b', backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
});