import React, { useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Pressable, StyleSheet } from 'react-native';
import { ChartColumn, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useThemeColors, type ThemeColors } from '../theme';
import { formatMonth, getCurrentMonth, getNextMonth, getPreviousMonth, getRecentMonths, isCurrentMonth } from '../utils/format';

interface Props {
  month: string;
  onChange: (m: string) => void;
}

export default function MonthSwitcher({ month, onChange }: Props) {
  const [visible, setVisible] = useState(false);
  const months = useMemo(() => getRecentMonths(), []);
  const current = getCurrentMonth();
  const c = useThemeColors();
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
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setVisible(false)}><X size={22} color={c.textSecondary} /></TouchableOpacity>
              <Text style={s.modalTitle}>选择月份</Text>
              <View style={{ width: 22 }} />
            </View>
            <ScrollView style={s.body}>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  titleBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { fontSize: 18, fontWeight: '600', color: c.text },
  backBtn: { alignSelf: 'center', marginBottom: 8, backgroundColor: c.primarySoftBg, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  backBtnText: { fontSize: 13, color: c.primaryText, fontWeight: '500' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: { backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.subtle },
  modalTitle: { fontSize: 16, fontWeight: '600', color: c.text },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '31%', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  monthItemActive: { borderColor: '#6366f1', backgroundColor: c.primarySoftBg },
  monthText: { fontSize: 14, color: c.text },
  monthTextActive: { color: c.primaryText, fontWeight: '600' },
  nowTag: { fontSize: 10, color: c.hint, marginLeft: 4 },
  nowTagActive: { color: c.primaryText },
});
