import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ScrollView, StyleSheet } from 'react-native';
import { Plus, Trash2, ChevronRight, Tags } from 'lucide-react-native';
import CardTitle from './CardTitle';
import { useFocusEffect } from 'expo-router';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import type { Category, CustomRule } from '../types';
import { getCategories, getCustomRules, addCategory, getCategoryDataCounts, deleteCategoryWithData, deleteCustomRulesByCategory } from '../services/db';
import { useCategoryStore } from '../stores/categoryStore';
import CategoryKeywordsModal from './CategoryKeywordsModal';
import CategoryDeleteModal from './CategoryDeleteModal';
import { spacing, radius, fontSize } from '../theme/spacing';

const EMOJI_OPTIONS = ['🍔','🚇','🛒','🎮','🏠','💊','📚','💬','💰','✏️','🎁','🐱','🎵','✈️','💻','📱','🚗','⚽','🧘','🎂'];
const COLOR_OPTIONS = ['#f97316','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#ef4444','#06b6d4','#6366f1','#22c55e','#64748b','#f59e0b','#84cc16','#a855f7','#e11d48','#0891b2'];

export default function CategoryManager() {
  const c = useThemeColors();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📦');
  const [customIcon, setCustomIcon] = useState('');
  const [newColor, setNewColor] = useState(c.primary);
  const [newType, setNewType] = useState<'expense' | 'income'>('expense');
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<{ cat: Category; counts: { expenses: number; budgets: number; fixedItems: number } } | null>(null);
  const revision = useCategoryStore(s => s.revision);
  const s = useMemo(() => createStyles(c), [c]);

  const loadCategories = useCallback(async () => {
    try {
      const [cats, ruleList] = await Promise.all([getCategories(), getCustomRules()]);
      const seen = new Set<string>();
      setCategories(cats.filter(c => seen.has(c.name) ? false : (seen.add(c.name), true)));
      setRules(ruleList);
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { loadCategories(); }, [loadCategories, revision]));

  async function handleAdd() {
    const name = newName.trim();
    if (!name) { Alert.alert('请输入分类名称'); return; }
    if (categories.some(c => c.name === name)) { Alert.alert('分类已存在'); return; }
    const icon = customIcon.trim() || newIcon;
    try { await addCategory(name, icon, newColor, newType); setNewName(''); setCustomIcon(''); setShowAdd(false); await loadCategories(); useCategoryStore.getState().bump(); }
    catch (e: any) { Alert.alert('添加失败', e.message); }
  }

  async function handleDelete(cat: Category) {
    if (cat.is_default === 1) { Alert.alert('无法删除', '默认分类不可删除'); return; }
    let counts;
    try { counts = await getCategoryDataCounts(cat.id); }
    catch (e: any) { Alert.alert('删除失败', e.message); return; }
    if (counts.expenses === 0 && counts.budgets === 0 && counts.fixedItems === 0) {
      Alert.alert('删除确认', `确定删除分类"${cat.name}"吗？其下的自定义关键词将一并删除。`, [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => doDelete(cat, null) },
      ]);
    } else if (counts.expenses === 0) {
      Alert.alert('删除确认', `该分类下有 ${counts.budgets} 条预算将删除、${counts.fixedItems} 条固定收支将停用。确定删除分类"${cat.name}"吗？`, [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => doDelete(cat, null) },
      ]);
    } else {
      setDeleting({ cat, counts }); // 有账单 → 弹窗选择转移目标
    }
  }

  async function doDelete(cat: Category, transferTargetId: number | null) {
    try {
      await deleteCategoryWithData(cat.id, transferTargetId);
      await deleteCustomRulesByCategory(cat.name);
      await loadCategories();
      useCategoryStore.getState().bump();
    } catch (e: any) { Alert.alert('删除失败', e.message); }
    finally { setDeleting(null); }
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <CardTitle icon={Tags} text="分类管理" />
        <TouchableOpacity onPress={() => setShowAdd(!showAdd)}>
          <Plus size={20} color={showAdd ? c.danger : c.primary} />
        </TouchableOpacity>
      </View>

      {showAdd && (
        <View style={s.addPanel}>
          <TextInput style={s.nameInput} value={newName} onChangeText={setNewName} placeholder="分类名称" placeholderTextColor={c.hint} />
          <TextInput style={s.nameInput} value={customIcon} onChangeText={setCustomIcon}
            placeholder="输入自定义图标/表情（如 🍕 / 🐕）" placeholderTextColor={c.hint} />
          <View style={s.typeRow}>
            <TouchableOpacity onPress={() => setNewType('expense')}
              style={[s.typeBtn, newType === 'expense' && { backgroundColor: c.primary }]}>
              <Text style={[s.typeText, newType === 'expense' && { color: '#fff' }]}>支出</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setNewType('income')}
              style={[s.typeBtn, newType === 'income' && { backgroundColor: c.success }]}>
              <Text style={[s.typeText, newType === 'income' && { color: '#fff' }]}>收入</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.label}>图标（当前：{customIcon.trim() || newIcon}）</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {EMOJI_OPTIONS.map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => { setNewIcon(emoji); setCustomIcon(''); }}
                  style={[s.emojiItem, newIcon === emoji && !customIcon && s.emojiActive]}>
                  <Text style={{ fontSize: 18 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Text style={s.label}>颜色</Text>
          <View style={s.colorRow}>
            {COLOR_OPTIONS.map(color => (
              <TouchableOpacity key={color} onPress={() => setNewColor(color)}
                style={[s.colorDot, { backgroundColor: color }, newColor === color && s.colorActive]} />
            ))}
          </View>
          <TouchableOpacity onPress={handleAdd} style={s.addBtn}>
            <Text style={s.addBtnText}>添加分类</Text>
          </TouchableOpacity>
        </View>
      )}

      {categories.map(cat => {
        const count = rules.filter(r => r.category === cat.name).length;
        return (
          <View key={cat.id} style={s.catItem}>
            <TouchableOpacity onPress={() => setSelectedCat(cat)} style={s.catInfo}>
              <View style={[s.catIcon, { backgroundColor: cat.color + '20' }]}>
                <Text style={s.catIconText}>{cat.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.catName}>{cat.name}</Text>
                <Text style={s.catSub}>
                  {cat.type === 'income' ? '收入' : '支出'}{cat.is_default === 1 ? ' · 默认' : ' · 自定义'}
                </Text>
              </View>
              <Text style={s.count}>{count} 词</Text>
              <ChevronRight size={16} color={c.hint} />
            </TouchableOpacity>
            {cat.is_default === 0 && (
              <TouchableOpacity onPress={() => handleDelete(cat)} style={s.deleteBtn}>
                <Trash2 size={16} color={c.danger} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <CategoryKeywordsModal visible={!!selectedCat} category={selectedCat} onClose={() => setSelectedCat(null)} />
      <CategoryDeleteModal
        visible={!!deleting}
        category={deleting?.cat ?? null}
        categories={deleting ? categories.filter(c => c.id !== deleting.cat.id) : []}
        counts={deleting?.counts ?? { expenses: 0, budgets: 0, fixedItems: 0 }}
        onCancel={() => setDeleting(null)}
        onConfirm={(t) => { if (deleting) doDelete(deleting.cat, t); }}
      />
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.md, padding: spacing.lg, ...cardShadow },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: fontSize.base, fontWeight: '600', color: c.text },
  addPanel: { backgroundColor: c.inputBg, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  nameInput: { backgroundColor: c.card, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.base, color: c.text, borderWidth: 1, borderColor: c.border, marginBottom: spacing.sm },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  typeBtn: { flex: 1, paddingVertical: 6, borderRadius: radius.sm, alignItems: 'center', backgroundColor: c.border },
  typeText: { fontSize: fontSize.sm, fontWeight: '500', color: c.textSecondary },
  label: { fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.xs },
  emojiItem: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: c.card },
  emojiActive: { backgroundColor: c.primarySoftBg, borderWidth: 1, borderColor: c.primary },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorActive: { borderWidth: 2, borderColor: c.text, transform: [{ scale: 1.1 }] },
  addBtn: { backgroundColor: c.primary, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500' },
  catItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.subtle },
  catInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  catIcon: { width: 32, height: 32, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  catIconText: { fontSize: 15 },
  catName: { fontSize: fontSize.base, color: c.text },
  catSub: { fontSize: fontSize.sm, color: c.textSecondary },
  count: { fontSize: fontSize.sm, color: c.primary, marginLeft: spacing.xs },
  deleteBtn: { padding: spacing.xs, marginLeft: spacing.sm },
});
