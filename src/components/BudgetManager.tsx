import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, StyleSheet } from 'react-native';
import { Plus, Trash2, Target } from 'lucide-react-native';
import CardTitle from './CardTitle';
import { useFocusEffect } from 'expo-router';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import type { Category, BudgetWithCategory } from '../types';
import { getCategories, getBudgets, setBudget, deleteBudget } from '../services/db';
import { getCurrentMonth } from '../utils/format';
import { useCategoryStore } from '../stores/categoryStore';

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
  const revision = useCategoryStore(s => s.revision);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  const load = useCallback(async () => {
    try {
      const [cats, buds] = await Promise.all([getCategories('expense'), getBudgets(month)]);
      const seen = new Set<string>();
      setCategories(cats.filter(c => seen.has(c.name) ? false : (seen.add(c.name), true)));
      setBudgets(buds);
    } catch (e) { console.error(e); }
  }, [month]);

  useFocusEffect(useCallback(() => { load(); }, [load, revision]));

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
        <CardTitle icon={Target} text="预算管理" />
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
                <Text style={{ fontSize: 12, color: c.text }}>{cat.icon} {cat.name}</Text>
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
              keyboardType="decimal-pad" placeholder="预算金额" placeholderTextColor={c.hint} />
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
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: b.category_color + '20', marginRight: 6 }}>
                  <Text style={{ fontSize: 13 }}>{b.category_icon}</Text>
                </View>
                <Text style={{ fontSize: 14, color: c.text }}>{b.category_name}</Text>
                <Text style={{ fontSize: 12, color: c.textSecondary, marginLeft: 4 }}>
                  · {PERIODS.find(p => p.key === b.period)?.label || '月'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: isOver ? '#ef4444' : isWarning ? '#f59e0b' : c.textSecondary, marginRight: 8 }}>
                  ¥{b.spent.toFixed(0)} / ¥{b.amount.toFixed(0)}
                </Text>
                <TouchableOpacity onPress={() => handleDelete(b.category_id)}>
                  <Trash2 size={14} color={c.hint} />
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

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16, ...cardShadow },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '600', color: c.text },
  addPanel: { backgroundColor: c.inputBg, borderRadius: 8, padding: 12, marginBottom: 12 },
  label: { fontSize: 12, color: c.textSecondary, marginBottom: 4 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  catItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: c.border },
  catItemActive: { borderColor: '#6366f1', backgroundColor: c.primarySoftBg },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  periodItem: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: c.border },
  periodActive: { backgroundColor: '#6366f1' },
  periodText: { fontSize: 12, fontWeight: '500', color: c.textSecondary },
  periodTextActive: { color: '#fff' },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  yuan: { fontSize: 14, color: c.text, marginRight: 8 },
  amountInput: { flex: 1, backgroundColor: c.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: c.text, borderWidth: 1, borderColor: c.border },
  setBtn: { backgroundColor: '#6366f1', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  setBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  empty: { color: c.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  budgetItem: { marginBottom: 12 },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  progressBar: { height: 8, backgroundColor: c.subtle, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
});
