import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Zap } from 'lucide-react-native';
import CardTitle from './CardTitle';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import type { QuickItemWithCategory } from '../types';
import { getQuickItemsWithCategory } from '../services/db';
import { useCategoryStore } from '../stores/categoryStore';
import { formatAmount } from '../utils/format';
import { spacing, radius, fontSize } from '../theme/spacing';

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
      <CardTitle icon={Zap} text="快捷记账" />
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
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg, ...cardShadow },
  row: { flexDirection: 'row', gap: spacing.sm },
  btn: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.primarySoftBg, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnIcon: { fontSize: fontSize.base, marginRight: spacing.xs },
  btnName: { fontSize: fontSize.md, color: c.primaryText, fontWeight: '500', marginRight: 6 },
  btnAmount: { fontSize: fontSize.md, color: c.primaryText, fontWeight: '600' },
});
