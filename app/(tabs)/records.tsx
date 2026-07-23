import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, Alert, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import ExpenseCard from '../../src/components/ExpenseCard';
import EditExpenseModal from '../../src/components/EditExpenseModal';
import InputBar from '../../src/components/InputBar';
import { useExpenses } from '../../src/hooks/useExpenses';
import type { ExpenseWithCategory } from '../../src/types';
import { getCurrentMonth, formatDate } from '../../src/utils/format';

export default function Records() {
  const [month] = useState(getCurrentMonth());
  const [search, setSearch] = useState('');
  const { expenses, loading, add, remove, update, load } = useExpenses(month);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithCategory | null>(null);

  const handleDelete = useCallback((id: number, description: string) => {
    Alert.alert('删除确认', `确定要删除"${description}"吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => remove(id) },
    ]);
  }, [remove]);

  const handleEdit = useCallback((expense: ExpenseWithCategory) => setEditingExpense(expense), []);
  const handleSaveEdit = useCallback(async (id: number, updates: any) => { await update(id, updates); }, [update]);
  const handleAddExpense = useCallback(async (amount: number, categoryId: number, date: string, description?: string, rawInput?: string) => {
    await add(amount, categoryId, date, description, rawInput);
  }, [add]);

  // 切换到账单页时自动刷新
  useFocusEffect(useCallback(() => { load({}); }, [load]));

  const groupedExpenses = useMemo(() => {
    const groups: { date: string; items: typeof expenses }[] = [];
    for (const e of expenses) {
      const last = groups[groups.length - 1];
      if (last && last.date === e.expense_date) last.items.push(e);
      else groups.push({ date: e.expense_date, items: [e] });
    }
    if (search.trim()) {
      return groups.map(g => ({ ...g, items: g.items.filter(e =>
        e.description?.includes(search) || e.raw_input?.includes(search) || e.category_name.includes(search)
      )})).filter(g => g.items.length > 0);
    }
    return groups;
  }, [expenses, search]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.searchBar}>
        <View style={s.searchBox}>
          <Search size={16} color="#94a3b8" />
          <TextInput style={s.searchInput} placeholder="搜索账单..." placeholderTextColor="#94a3b8"
            value={search} onChangeText={setSearch} />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Text style={s.clear}>清除</Text></TouchableOpacity>}
        </View>
      </View>
      <FlatList
        data={groupedExpenses}
        keyExtractor={item => item.date}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load({ search: search.trim() || undefined })} tintColor="#6366f1" />}
        ListEmptyComponent={<View style={s.emptyWrap}><Text style={{ fontSize: 40, marginBottom: 12 }}>📝</Text>
          <Text style={{ color: '#64748b', fontSize: 14 }}>{search ? '没有匹配的记录' : '还没有记账记录'}</Text></View>}
        renderItem={({ item: group }) => (
          <View>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500' }}>{formatDate(group.date)}</Text>
            </View>
            {group.items.map(expense => (
              <ExpenseCard key={expense.id} expense={expense}
                onPress={() => handleEdit(expense)}
                onLongPress={() => handleDelete(expense.id, expense.description || expense.raw_input || expense.category_name)} />
            ))}
            <View style={{ marginHorizontal: 16, marginVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }} />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
      <InputBar onAddExpense={handleAddExpense} />
      <EditExpenseModal visible={editingExpense !== null} expense={editingExpense}
        onClose={() => setEditingExpense(null)} onSave={handleSaveEdit} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  searchBar: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 8, paddingHorizontal: 8, fontSize: 14, color: '#1e293b' },
  clear: { color: '#6366f1', fontSize: 14 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});