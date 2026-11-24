import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors, type ThemeColors } from '../theme';
import type { ExpenseWithCategory } from '../types';
import { SOURCE_LABEL } from '../services/billImport/types';
import { formatAmount } from '../utils/format';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  expense: ExpenseWithCategory;
  onPress?: () => void;
  onLongPress?: () => void;
}

export default function ExpenseCard({ expense, onPress, onLongPress }: Props) {
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  return (
    <TouchableOpacity style={s.card} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      <View style={s.left}>
        <View style={[s.icon, { backgroundColor: expense.category_color + '20' }]}>
          <Text style={s.iconText}>{expense.category_icon}</Text>
        </View>
        <View style={s.info}>
          <Text style={s.desc} numberOfLines={1}>
            {expense.description || expense.raw_input || expense.category_name}
          </Text>
          <Text style={s.cat}>
            {expense.category_name}
            {expense.source ? <Text style={s.source}> · {SOURCE_LABEL[expense.source]}</Text> : null}
          </Text>
        </View>
      </View>
      <Text style={[s.amount, expense.category_type === 'income' ? { color: c.success } : { color: c.text }]}>
        {expense.category_type === 'income' ? '+' : '-'}{formatAmount(expense.amount)}
      </Text>
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, marginVertical: 2, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.md },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  icon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  iconText: { fontSize: 18 },
  info: { flex: 1 },
  desc: { fontSize: fontSize.base, color: c.text, fontWeight: '500' },
  cat: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
  source: { color: c.hint },
  amount: { fontSize: fontSize.lg, fontWeight: '600' },
});
