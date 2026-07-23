import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ExpenseWithCategory } from '../types';
import { formatAmount } from '../utils/format';

interface Props {
  expense: ExpenseWithCategory;
  onPress?: () => void;
  onLongPress?: () => void;
}

export default function ExpenseCard({ expense, onPress, onLongPress }: Props) {
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
          <Text style={s.cat}>{expense.category_name}</Text>
        </View>
      </View>
      <Text style={[s.amount, expense.category_type === 'income' ? { color: '#22c55e' } : { color: '#1e293b' }]}>
        {expense.category_type === 'income' ? '+' : '-'}{formatAmount(expense.amount)}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 2, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8 },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconText: { fontSize: 18 },
  info: { flex: 1 },
  desc: { fontSize: 14, color: '#1e293b', fontWeight: '500' },
  cat: { fontSize: 12, color: '#64748b', marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '600' },
});