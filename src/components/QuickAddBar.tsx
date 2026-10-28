import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useThemeColors, type ThemeColors } from '../theme';
import type { QuickItemWithCategory } from '../types';
import { getQuickItemsWithCategory } from '../services/db';
import { useCategoryStore } from '../stores/categoryStore';
import { formatAmount } from '../utils/format';

interface Props {
  onQuickAdd: (item: QuickItemWithCategory) => void;
}

/**
 * 快捷记账按钮条：固定金额、点一下记一笔。空配置时整卡片隐藏。
 */
export default function QuickAddBar({ onQuickAdd }: Props) {
  const [items, setItems] = useState<QuickItemWithCategory[]>([]);
  const revision = useCategoryStore(s => s.revision);

  const load = useCallback(async () => {
    try {
      setItems(await getQuickItemsWithCategory());
    } catch (e) { console.error(e); }
  }, []);

  // 切回仪表盘即刷新；分类变更（revision）也联动刷新按钮
  useFocusEffect(useCallback(() => { load(); }, [load, revision]));

  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  if (items.length === 0) return null;

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>⚡ 快捷记账</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {items.map(item => (
          <TouchableOpacity key={item.id} onPress={() => onQuickAdd(item)} style={s.btn}>
            <Text style={s.btnIcon}>{item.category_icon || '📦'}</Text>
            <Text style={s.btnName}>{item.name}</Text>
            {/* 与设置页一致用 formatAmount（两位小数）：toFixed(0) 会把 3.5 四舍五入成 4 */}
            <Text style={s.btnAmount}>{formatAmount(item.amount)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 12, padding: 16, marginBottom: 16, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.primarySoftBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  btnIcon: { fontSize: 14, marginRight: 4 },
  btnName: { fontSize: 13, color: c.primaryText, fontWeight: '500', marginRight: 6 },
  btnAmount: { fontSize: 13, color: c.primaryText, fontWeight: '600' },
});
