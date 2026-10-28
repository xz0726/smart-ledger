import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import type { CategoryStats } from '../types';
import { formatShortAmount } from '../utils/format';
import CategoryDonutChart from './charts/CategoryDonutChart';

interface Props {
  data: CategoryStats[];
}

type ViewMode = 'bar' | 'pie';

export default function CategoryBreakdownCard({ data }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('bar');
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  // 过滤无数据分类；≥1% 为主类（至多 8 个），<1% 归并为「其他」
  const { list, total } = useMemo(() => {
    const pos = data.filter(d => d.total > 0);
    const t = pos.reduce((s, d) => s + d.total, 0);
    const main = pos.filter(d => d.percentage >= 1).slice(0, 8);
    const rest = pos.filter(d => d.percentage < 1);
    const other: CategoryStats = rest.reduce((acc, d) => ({
      category_id: -1,
      category_name: '其他',
      category_icon: '🗂',
      category_color: '#94a3b8',
      total: acc.total + d.total,
      percentage: acc.percentage + d.percentage,
      count: acc.count + d.count,
    }), { category_id: -1, category_name: '其他', category_icon: '🗂', category_color: '#94a3b8', total: 0, percentage: 0, count: 0 });
    const out = [...main];
    if (other.total > 0) out.push(other);
    return { list: out, total: t };
  }, [data]);

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.cardLeft}>
          <Text style={s.cardTitle}>分类占比</Text>
          <Text style={s.total}>合计 ¥{total.toFixed(0)}</Text>
        </View>
        <View style={s.seg}>
          {(['bar', 'pie'] as ViewMode[]).map(mode => (
            <TouchableOpacity key={mode} onPress={() => setViewMode(mode)}
              style={[s.segItem, viewMode === mode && s.segItemActive]}>
              <Text style={[s.segText, viewMode === mode && s.segTextActive]}>
                {mode === 'bar' ? '条形' : '饼图'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {list.length === 0 ? (
        <Text style={s.empty}>暂无数据</Text>
      ) : viewMode === 'bar' ? (
        <View>
          {list.map(d => (
            <View key={d.category_id} style={s.catRow}>
              <View style={s.catLeft}>
                <View style={[s.iconChip, { backgroundColor: d.category_color + '20' }]}>
                  <Text style={s.iconChipText}>{d.category_icon}</Text>
                </View>
                <Text style={s.catName}>{d.category_name}</Text>
              </View>
              <View style={s.catRight}>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${Math.min(d.percentage, 100)}%`, backgroundColor: d.category_color }]} />
                </View>
                <Text style={s.catPct}>{d.percentage.toFixed(0)}%</Text>
                <Text style={s.catAmt}>{formatShortAmount(d.total)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <CategoryDonutChart data={list} />
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 12, padding: 16, marginBottom: 16, ...cardShadow },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardLeft: { flexDirection: 'row', alignItems: 'baseline' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: c.text, marginRight: 8 },
  total: { fontSize: 12, color: c.textSecondary },
  seg: { flexDirection: 'row', backgroundColor: c.subtle, borderRadius: 8, padding: 2 },
  segItem: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  segItemActive: { backgroundColor: c.card, ...cardShadow },
  segText: { fontSize: 12, color: c.textSecondary },
  segTextActive: { color: '#6366f1', fontWeight: '600' },
  empty: { color: c.textSecondary, textAlign: 'center', paddingVertical: 24 },
  catRow: { marginBottom: 10 },
  catLeft: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  iconChip: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconChipText: { fontSize: 13 },
  catName: { fontSize: 13, color: c.text, marginLeft: 6 },
  catRight: { flexDirection: 'row', alignItems: 'center' },
  bar: { flex: 1, height: 8, backgroundColor: c.subtle, borderRadius: 4, overflow: 'hidden', marginRight: 8 },
  barFill: { height: '100%', borderRadius: 4 },
  catPct: { fontSize: 12, color: c.textSecondary, width: 36, textAlign: 'right' },
  catAmt: { fontSize: 12, color: c.textSecondary, width: 60, textAlign: 'right' },
});
