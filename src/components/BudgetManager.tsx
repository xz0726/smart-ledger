import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, StyleSheet } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import type { Category, BudgetWithCategory } from '../types';
import { getCategories, getBudgets, setBudget, deleteBudget } from '../services/db';
import { getCurrentMonth } from '../utils/format';

const PERIODS = [
  { key: 'weekly', label: '周' },
  { key: 'monthly', label: '月' },
  { key: 'yearly', label: '年' },
] as const;

export default function BudgetManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithCategory[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number>(0);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const month = getCurrentMonth();

  const load = useCallback(async () => {
    try {
      const [cats, buds] = await Promise.all([getCategories('expense'), getBudgets(month)]);
      const seen = new Set<string>();
      setCategories(cats.filter(c => seen.has(c.name) ? false : (seen.add(c.name), true)));
      setBudgets(buds);
    } catch (e) { console.error(e); }
  }, [month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSetBudget() {
    if (selectedCategory === 0) { Alert.alert('请选择分类'); return; }
    const amount = parseFloat(budgetAmount);
    if (isNaN(amount) || amount <= 0) { Alert.alert('请输入有效预算金额'); return; }
    try {
      await setBudget(selectedCategory, amount, month, period);
      setBudgetAmount(''); setShowAdd(false); setSelectedCategory(0); await load();
    } catch (e: any) { Alert.alert('设置失败', e.message); }
  }

  async function handleDelete(categoryId: number) {
    Alert.alert('删除预算', '确定删除此预算吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { await deleteBudget(categoryId, month); await load(); } },
    ]);
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>🎯 预算管理</Text>
        <TouchableOpacity onPress={() => setShowAdd(!showAdd)}>
          <Plus size={20} color={showAdd ? '#ef4444' : '#6366f1'} />
        </TouchableOpacity>
      </View>

      {showAdd && (
        <View style={s.addPanel}>
          <Text style={s.label}>分类</Text>
          <View style={s.catRow}>
            {categories.map(cat => (
              <TouchableOpacity key={cat.id} onPress={() => setSelectedCategory(cat.id)}
                style={[s.catItem, selectedCategory === cat.id && s.catItemActive]}>
                <Text style={{ fontSize: 12 }}>{cat.icon} {cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>周期</Text>
          <View style={s.periodRow}>
            {PERIODS.map(p => (
              <TouchableOpacity key={p.key} onPress={() => setPeriod(p.key)}
                style={[s.periodItem, period === p.key && s.periodActive]}>
                <Text style={[s.periodText, period === p.key && s.periodTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.amountRow}>
            <Text style={s.yuan}>¥</Text>
            <TextInput style={s.amountInput} value={budgetAmount} onChangeText={setBudgetAmount}
              keyboardType="decimal-pad" placeholder="预算金额" placeholderTextColor="#94a3b8" />
          </View>
          <TouchableOpacity onPress={handleSetBudget} style={s.setBtn}>
            <Text style={s.setBtnText}>设置预算</Text>
          </TouchableOpacity>
        </View>
      )}

      {budgets.length === 0 ? (
        <Text style={s.empty}>暂无预算，点击 + 添加</Text>
      ) : budgets.map(b => {
        const pct = b.amount > 0 ? Math.min((b.spent / b.amount) * 100, 100) : 0;
        const isOver = b.spent > b.amount && b.amount > 0;
        const isWarning = pct >= 80 && !isOver;
        return (
          <View key={b.id} style={s.budgetItem}>
            <View style={s.budgetTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, marginRight: 4 }}>{b.category_icon}</Text>
                <Text style={{ fontSize: 14, color: '#1e293b' }}>{b.category_name}</Text>
                <Text style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>
                  · {PERIODS.find(p => p.key === b.period)?.label || '月'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: isOver ? '#ef4444' : isWarning ? '#f59e0b' : '#64748b', marginRight: 8 }}>
                  ¥{b.spent.toFixed(0)} / ¥{b.amount.toFixed(0)}
                </Text>
                <TouchableOpacity onPress={() => handleDelete(b.category_id)}>
                  <Trash2 size={14} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: isOver ? '#ef4444' : isWarning ? '#f59e0b' : b.category_color }]} />
            </View>
            {isOver && <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>⚠️ 已超预算</Text>}
            {isWarning && <Text style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>⚡ 即将超预算</Text>}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16, elevation: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  addPanel: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 12 },
  label: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  catItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  catItemActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  periodItem: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: '#e2e8f0' },
  periodActive: { backgroundColor: '#6366f1' },
  periodText: { fontSize: 12, fontWeight: '500', color: '#64748b' },
  periodTextActive: { color: '#fff' },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  yuan: { fontSize: 14, color: '#1e293b', marginRight: 8 },
  amountInput: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1e293b', borderWidth: 1, borderColor: '#e2e8f0' },
  setBtn: { backgroundColor: '#6366f1', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  setBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  empty: { color: '#64748b', fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  budgetItem: { marginBottom: 12 },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progressBar: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
});