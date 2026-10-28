import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, StyleSheet } from 'react-native';
import { Plus, Trash2, Zap } from 'lucide-react-native';
import CardTitle from './CardTitle';
import { useFocusEffect } from 'expo-router';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import type { Category, QuickItemWithCategory } from '../types';
import { getCategories, getQuickItemsWithCategory, addQuickItem, deleteQuickItem } from '../services/db';
import { useCategoryStore } from '../stores/categoryStore';
import { spacing, radius, fontSize } from '../theme/spacing';

/**
 * 快捷记账管理：固定金额、点一下记一笔（停车 10 元、奶茶 15 元等）。
 * 仅支持支出分类；仪表盘 QuickAddBar 展示这些按钮。
 */
export default function QuickItemsManager() {
  const [items, setItems] = useState<QuickItemWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [amount, setAmount] = useState('');
  const revision = useCategoryStore(s => s.revision);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  const load = useCallback(async () => {
    try {
      const [list, catList] = await Promise.all([getQuickItemsWithCategory(), getCategories('expense')]);
      setItems(list);
      // 同名去重（与固定收支一致，避免选择器里出现重复分类）
      const seen = new Set<string>();
      setCategories(catList.filter(c => seen.has(c.name) ? false : (seen.add(c.name), true)));
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load, revision]));

  async function handleAdd() {
    if (!name.trim()) { Alert.alert('请输入名称'); return; }
    if (selectedCategory === 0) { Alert.alert('请选择分类'); return; }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { Alert.alert('请输入有效金额'); return; }
    try {
      await addQuickItem(name.trim(), selectedCategory, amountNum);
      setName(''); setAmount(''); setSelectedCategory(0); setShowAdd(false);
      await load();
    } catch (e: any) { Alert.alert('添加失败', e.message); }
  }

  async function handleDelete(item: QuickItemWithCategory) {
    Alert.alert('删除确认', `确定删除快捷记账「${item.name}」吗？已记录的账单不会被删除。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { try { await deleteQuickItem(item.id); await load(); } catch (e: any) { Alert.alert('删除失败', e.message); } } },
    ]);
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <CardTitle icon={Zap} text="快捷记账" />
        <TouchableOpacity onPress={() => setShowAdd(!showAdd)}>
          <Plus size={20} color={showAdd ? c.danger : c.primary} />
        </TouchableOpacity>
      </View>
      <Text style={s.hint}>固定金额、点一下记一笔，如停车 10 元 / 奶茶 15 元</Text>

      {showAdd && (
        <View style={s.addPanel}>
          <Text style={s.label}>名称</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="如：停车 / 奶茶" placeholderTextColor={c.hint} />
          <Text style={s.label}>分类</Text>
          <View style={s.catRow}>
            {categories.length === 0 ? <Text style={{ fontSize: fontSize.sm, color: c.hint }}>暂无支出分类</Text> :
              categories.map(cat => (
                <TouchableOpacity key={cat.id} onPress={() => setSelectedCategory(cat.id)}
                  style={[s.catItem, selectedCategory === cat.id && s.catItemActive]}>
                  <Text style={{ fontSize: fontSize.sm, color: c.text }}>{cat.icon} {cat.name}</Text>
                </TouchableOpacity>
              ))}
          </View>
          <Text style={s.label}>金额</Text>
          <View style={s.amountRow}>
            <Text style={s.yuan}>¥</Text>
            <TextInput style={s.amountInput} value={amount} onChangeText={setAmount}
              keyboardType="decimal-pad" placeholder="如：10 / 15" placeholderTextColor={c.hint} />
          </View>
          <TouchableOpacity onPress={handleAdd} style={s.addBtn}>
            <Text style={s.addBtnText}>添加快捷记账</Text>
          </TouchableOpacity>
        </View>
      )}

      {items.length === 0 ? (
        <Text style={s.empty}>暂无快捷记账，点击 + 添加</Text>
      ) : items.map(item => (
        <View key={item.id} style={s.item}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={[s.iconWrap, { backgroundColor: (item.category_color || '#64748b') + '20' }]}>
              <Text style={{ fontSize: 15 }}>{item.category_icon || '📦'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.base, color: c.text }}>{item.name}</Text>
              <Text style={{ fontSize: fontSize.sm, color: c.textSecondary }}>{item.category_name || '未知分类'}</Text>
            </View>
            <Text style={{ fontSize: fontSize.base, fontWeight: '600', color: c.primary, marginRight: spacing.sm }}>¥{item.amount.toFixed(2)}</Text>
            <TouchableOpacity onPress={() => handleDelete(item)}>
              <Trash2 size={14} color={c.hint} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.md, padding: spacing.lg, ...cardShadow },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  title: { fontSize: fontSize.base, fontWeight: '600', color: c.text },
  hint: { fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.md },
  addPanel: { backgroundColor: c.inputBg, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.xs },
  input: { backgroundColor: c.card, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.base, color: c.text, borderWidth: 1, borderColor: c.border, marginBottom: spacing.md },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  catItem: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
  catItemActive: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  yuan: { fontSize: fontSize.base, color: c.text, marginRight: spacing.sm },
  amountInput: { flex: 1, backgroundColor: c.card, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.base, color: c.text, borderWidth: 1, borderColor: c.border },
  addBtn: { backgroundColor: c.primary, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500' },
  empty: { color: c.textSecondary, fontSize: fontSize.base, textAlign: 'center', paddingVertical: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.subtle },
  iconWrap: { width: 32, height: 32, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
});
