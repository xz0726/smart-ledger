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
import { spacing, radius, fontSize } from '../theme/spacing';

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
          <Plus size={20} color={showAdd ? c.danger : c.primary} />
        </TouchableOpacity>
      </View>

      {showAdd && (
        <View style={s.addPanel}>
          <Text style={s.label}>分类</Text>
          <View style={s.catRow}>
            {categories.map(cat => (
              <TouchableOpacity key={cat.id} onPress={() => setSelectedCategory(cat.id)}
                style={[s.catItem, selectedCategory === cat.id && s.catItemActive]}>
                <Text style={{ fontSize: fontSize.sm, color: c.text }}>{cat.icon} {cat.name}</Text>
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
                <View style={{ width: 24, height: 24, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: b.category_color + '20', marginRight: 6 }}>
                  <Text style={{ fontSize: fontSize.md }}>{b.category_icon}</Text>
                </View>
                <Text style={{ fontSize: fontSize.base, color: c.text }}>{b.category_name}</Text>
                <Text style={{ fontSize: fontSize.sm, color: c.textSecondary, marginLeft: spacing.xs }}>
                  · {PERIODS.find(p => p.key === b.period)?.label || '月'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: fontSize.sm, color: isOver ? c.danger : isWarning ? c.warning : c.textSecondary, marginRight: spacing.sm }}>
                  ¥{b.spent.toFixed(0)} / ¥{b.amount.toFixed(0)}
                </Text>
                <TouchableOpacity onPress={() => handleDelete(b.category_id)}>
                  <Trash2 size={14} color={c.hint} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: isOver ? c.danger : isWarning ? c.warning : b.category_color }]} />
            </View>
            {isOver && <Text style={{ fontSize: fontSize.sm, color: c.danger, marginTop: 2 }}>⚠️ 已超预算</Text>}
            {isWarning && <Text style={{ fontSize: fontSize.sm, color: c.warning, marginTop: 2 }}>⚡ 即将超预算</Text>}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.md, padding: spacing.lg, ...cardShadow },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: fontSize.base, fontWeight: '600', color: c.text },
  addPanel: { backgroundColor: c.inputBg, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.xs },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  catItem: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
  catItemActive: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  periodItem: { flex: 1, paddingVertical: 6, borderRadius: radius.sm, alignItems: 'center', backgroundColor: c.border },
  periodActive: { backgroundColor: c.primary },
  periodText: { fontSize: fontSize.sm, fontWeight: '500', color: c.textSecondary },
  periodTextActive: { color: '#fff' },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  yuan: { fontSize: fontSize.base, color: c.text, marginRight: spacing.sm },
  amountInput: { flex: 1, backgroundColor: c.card, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.base, color: c.text, borderWidth: 1, borderColor: c.border },
  setBtn: { backgroundColor: c.primary, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  setBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500' },
  empty: { color: c.textSecondary, fontSize: fontSize.base, textAlign: 'center', paddingVertical: spacing.md },
  budgetItem: { marginBottom: spacing.md },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  progressBar: { height: 8, backgroundColor: c.subtle, borderRadius: radius.xs, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.xs },
});
