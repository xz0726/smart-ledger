import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useThemeColors, type ThemeColors } from '../theme';
import type { Category, CustomRule } from '../types';
import { getCategories, getCustomRules, deleteCustomRule } from '../services/db';
import { useCategoryStore } from '../stores/categoryStore';

/**
 * 自定义规则展示：仅保留展示与删除，按分类分组。
 * 新增关键词入口已收敛到「分类管理」——点击分类在弹窗中编辑。
 */
export default function RuleManager() {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const revision = useCategoryStore(s => s.revision);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  const load = useCallback(async () => {
    try {
      const [ruleList, catList] = await Promise.all([getCustomRules(), getCategories()]);
      setRules(ruleList);
      // 同名去重（旧版本遗留重复行，避免分组/图标查询错乱）
      const seen = new Set<string>();
      setCategories(catList.filter(c => seen.has(c.name) ? false : (seen.add(c.name), true)));
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load, revision]));

  async function handleDelete(rule: CustomRule) {
    Alert.alert('删除确认', `确定删除关键词「${rule.keyword}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
          try {
            await deleteCustomRule(rule.id);
            await load();
            // bump 让同屏的分类管理计数/其他选择器联动刷新（仅 load() 只刷本组件）
            useCategoryStore.getState().bump();
          } catch (e: any) { Alert.alert('删除失败', e.message); }
        } },
    ]);
  }

  // 按分类分组：已存在分类在前，孤儿规则（指向已删除分类）排最后、用默认 📦 图标
  const catMap = new Map(categories.map(c => [c.name, c]));
  const groups: { name: string; icon: string; items: CustomRule[] }[] = [];
  for (const rule of rules) {
    let g = groups.find(g => g.name === rule.category);
    if (!g) {
      g = { name: rule.category, icon: catMap.get(rule.category)?.icon || '📦', items: [] };
      groups.push(g);
    }
    g.items.push(rule);
  }
  groups.sort((a, b) => Number(!catMap.has(a.name)) - Number(!catMap.has(b.name)));

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>🧩 自定义规则</Text>
      </View>
      <Text style={s.hint}>关键词管理请到「分类管理」，点击分类查看/添加</Text>

      {groups.length === 0 ? (
        <Text style={s.empty}>暂无自定义关键词，可前往「分类管理」添加</Text>
      ) : groups.map(group => (
        <View key={group.name}>
          <View style={s.groupHeader}>
            <Text style={s.groupTitle}>{group.icon} {group.name} · {group.items.length}</Text>
          </View>
          {group.items.map(rule => (
            <View key={rule.id} style={s.ruleItem}>
              <Text style={s.keyword}>{rule.keyword}</Text>
              <TouchableOpacity onPress={() => handleDelete(rule)} style={s.deleteBtn}>
                <Trash2 size={14} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16, elevation: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '600', color: c.text },
  hint: { fontSize: 12, color: c.textSecondary, marginBottom: 12 },
  empty: { color: c.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  groupHeader: { marginTop: 4, marginBottom: 2 },
  groupTitle: { fontSize: 13, fontWeight: '600', color: '#6366f1' },
  ruleItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.subtle },
  keyword: { flex: 1, fontSize: 14, fontWeight: '500', color: c.text },
  deleteBtn: { padding: 4 },
});
