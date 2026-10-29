import React, { useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Pressable, StyleSheet } from 'react-native';
import { ChartColumn, ChevronLeft, ChevronRight } from 'lucide-react-native';
import ModalHeader from './ModalHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, type ThemeColors } from '../theme';
import { formatMonth, getCurrentMonth, getNextMonth, getPreviousMonth, getRecentMonths, isCurrentMonth } from '../utils/format';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  month: string;
  onChange: (m: string) => void;
}

export default function MonthSwitcher({ month, onChange }: Props) {
  const [visible, setVisible] = useState(false);
  const months = useMemo(() => getRecentMonths(), []);
  const current = getCurrentMonth();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(c), [c]);

  return (
    <>
      <View>
        <View style={s.header}>
          <TouchableOpacity onPress={() => onChange(getPreviousMonth(month))} hitSlop={8}>
            <ChevronLeft size={22} color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={s.titleBtn} onPress={() => setVisible(true)}>
            <View style={s.titleRow}>
              <ChartColumn size={17} color={c.primaryText} strokeWidth={2.2} />
              <Text style={s.title}>{formatMonth(month)}{isCurrentMonth(month) ? ' · 本月' : ''}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onChange(getNextMonth(month))} disabled={isCurrentMonth(month)} hitSlop={8}>
            <ChevronRight size={22} color={isCurrentMonth(month) ? c.disabled : c.textSecondary} />
          </TouchableOpacity>
        </View>
        {/* 浏览历史月时，页面上直接提供「回到本月」 */}
        {!isCurrentMonth(month) && (
          <TouchableOpacity style={s.backBtn} onPress={() => onChange(getCurrentMonth())}>
            <Text style={s.backBtnText}>回到本月</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <Pressable style={s.overlay} onPress={() => setVisible(false)}>
          <Pressable style={s.modal} onPress={e => e.stopPropagation()}>
            <ModalHeader title="选择月份" onClose={() => setVisible(false)} />
            <ScrollView style={[s.body, { paddingBottom: Math.max(insets.bottom, spacing.xxl) }]}>
              <View style={s.grid}>
                {months.map(m => {
                  const active = m === month;
                  const isNow = m === current;
                  return (
                    <TouchableOpacity key={m} onPress={() => { onChange(m); setVisible(false); }}
                      style={[s.monthItem, active && s.monthItemActive]}>
                      <Text style={[s.monthText, active && s.monthTextActive]}>
                        {formatMonth(m).replace('年', '.').replace('月', '')}
                      </Text>
                      {isNow && <Text style={[s.nowTag, active && s.nowTagActive]}>本月</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  titleBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { fontSize: 18, fontWeight: '600', color: c.text },
  backBtn: { alignSelf: 'center', marginBottom: spacing.sm, backgroundColor: c.primarySoftBg, paddingHorizontal: spacing.lg, paddingVertical: 6, borderRadius: radius.pill },
  backBtnText: { fontSize: fontSize.md, color: c.primaryText, fontWeight: '500' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: { backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%' },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  monthItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '31%', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  monthItemActive: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  monthText: { fontSize: fontSize.base, color: c.text },
  monthTextActive: { color: c.primaryText, fontWeight: '600' },
  nowTag: { fontSize: 10, color: c.hint, marginLeft: spacing.xs },
  nowTagActive: { color: c.primaryText },
});
