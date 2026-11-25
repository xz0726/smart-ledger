import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bell } from 'lucide-react-native';
import CardTitle from './CardTitle';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import { spacing, radius, fontSize } from '../theme/spacing';
import type { PendingCapture } from '../types';
import { getPendingCaptures, confirmPendingCapture, ignorePendingCapture, getCategories } from '../services/db';
import { getTodayDate } from '../utils/format';
import { useCategoryStore } from '../stores/categoryStore';

const SOURCE_LABEL: Record<string, string> = { alipay: '支付宝', wechat: '微信' };

/**
 * 待确认记账卡片：通知捕获的支付通知在此人工核对后入账。
 * 半自动设计——自动解析金额/方向，分类与最终金额由用户确认；无通知捕获时整卡隐藏。
 */
export default function PendingCapturesCard() {
  const [items, setItems] = useState<PendingCapture[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string; icon: string; color: string }[]>([]);
  const [selectedCat, setSelectedCat] = useState<number>(0);
  const [amountText, setAmountText] = useState('');
  const revision = useCategoryStore(s => s.revision);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  const load = useCallback(async () => {
    try {
      const [list, cats] = await Promise.all([getPendingCaptures(), getCategories('expense')]);
      setItems(list);
      const seen = new Set<string>();
      setCategories(cats.filter(x => seen.has(x.name) ? false : (seen.add(x.name), true)));
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load, revision]));

  // 捕获到新支付通知时实时刷新（不用切页面）
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onPendingCaptureAdded', () => { void load(); });
    return () => sub.remove();
  }, [load]);

  if (items.length === 0) return null;

  const toggleExpand = (item: PendingCapture) => {
    if (expandedId === item.id) { setExpandedId(null); return; }
    setExpandedId(item.id);
    setSelectedCat(0);
    setAmountText(item.amount != null ? item.amount.toString() : '');
  };

  const confirm = async (item: PendingCapture) => {
    const amount = parseFloat(amountText);
    // 金额或分类未就绪时不动作，避免写入 category_id = 0 的脏账目
    if (isNaN(amount) || amount <= 0 || selectedCat === 0) return;
    await confirmPendingCapture(item.id, {
      categoryId: selectedCat,
      amount,
      date: getTodayDate(),
      description: item.title || undefined,
    });
    setExpandedId(null);
    await load();
  };

  const ignore = async (item: PendingCapture) => {
    await ignorePendingCapture(item.id);
    setExpandedId(null);
    await load();
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <CardTitle icon={Bell} text="待确认记账" />
        <View style={s.badge}><Text style={s.badgeText}>{items.length}</Text></View>
      </View>
      {items.map(item => {
        const expanded = expandedId === item.id;
        return (
          <View key={item.id} style={s.item}>
            <TouchableOpacity style={s.row} onPress={() => toggleExpand(item)} activeOpacity={0.7}>
              <View style={[s.sourceChip, { backgroundColor: item.source === 'wechat' ? '#22c55e20' : '#3b82f620' }]}>
                <Text style={[s.sourceText, { color: item.source === 'wechat' ? c.success : c.info }]}>
                  {SOURCE_LABEL[item.source] || '通知'}
                </Text>
              </View>
              <View style={s.info}>
                <Text style={s.text} numberOfLines={1}>{item.title || item.text}</Text>
                <Text style={s.sub} numberOfLines={1}>{item.text}</Text>
              </View>
              <Text style={[s.amount, item.direction === 'income' && { color: c.success }]}>
                {item.amount != null ? `${item.direction === 'income' ? '+' : '-'}¥${item.amount.toFixed(2)}` : '金额待补'}
              </Text>
            </TouchableOpacity>

            {expanded && (
              <View style={s.expand}>
                <Text style={s.label}>金额</Text>
                <TextInput
                  style={s.amountInput}
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={c.hint}
                />
                <Text style={s.label}>分类（默认选「其他」）</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
                  {categories.map(cat => (
                    <TouchableOpacity key={cat.id} onPress={() => setSelectedCat(cat.id)}
                      style={[s.catItem, selectedCat === cat.id && s.catItemActive]}>
                      <Text style={[s.catText, selectedCat === cat.id && s.catTextActive]}>{cat.icon} {cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={s.btnRow}>
                  <TouchableOpacity style={s.ignoreBtn} onPress={() => ignore(item)}>
                    <Text style={s.ignoreText}>忽略</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.confirmBtn, (selectedCat === 0 || !(parseFloat(amountText) > 0)) && { opacity: 0.5 }]}
                    disabled={selectedCat === 0 || !(parseFloat(amountText) > 0)}
                    onPress={() => confirm(item)}>
                    <Text style={s.confirmText}>确认入账</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg, ...cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { backgroundColor: c.danger, borderRadius: radius.pill, minWidth: 22, paddingHorizontal: spacing.xs, paddingVertical: 2, alignItems: 'center' },
  badgeText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '600' },
  item: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: c.subtle, paddingTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  sourceChip: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, marginRight: spacing.md },
  sourceText: { fontSize: fontSize.xs, fontWeight: '500' },
  info: { flex: 1, marginRight: spacing.sm },
  text: { fontSize: fontSize.base, color: c.text, fontWeight: '500' },
  sub: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
  amount: { fontSize: fontSize.lg, fontWeight: '600', color: c.text },
  expand: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: c.subtle },
  label: { fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.xs },
  amountInput: { backgroundColor: c.inputBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.lg, color: c.text, borderWidth: 1, borderColor: c.border, marginBottom: spacing.md },
  catRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  catItem: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
  catItemActive: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  catText: { fontSize: fontSize.sm, color: c.text },
  catTextActive: { color: c.primary, fontWeight: '500' },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  ignoreBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: 'center', backgroundColor: c.subtle },
  ignoreText: { color: c.textSecondary, fontSize: fontSize.base, fontWeight: '500' },
  confirmBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: 'center', backgroundColor: c.primary },
  confirmText: { color: '#fff', fontSize: fontSize.base, fontWeight: '600' },
});
