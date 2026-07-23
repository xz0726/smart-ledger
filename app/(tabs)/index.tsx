import React, { useCallback } from 'react';
import { ScrollView, View, Text, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import StatCard from '../../src/components/StatCard';
import InputBar from '../../src/components/InputBar';
import { useStats } from '../../src/hooks/useStats';
import { useExpenses } from '../../src/hooks/useExpenses';
import { useBudget } from '../../src/hooks/useBudget';
import { formatAmount, getCurrentMonth, formatMonth } from '../../src/utils/format';
import { CATEGORY_COLORS } from '../../src/utils/colors';

export default function Dashboard() {
  const month = getCurrentMonth();
  const { overview, categoryStats, dailyTrend, loading, reload: reloadStats } = useStats(month);
  const { add } = useExpenses(month);
  const { budgets, loading: budgetLoading, setBudget, reload: reloadBudgets } = useBudget(month);

  const handleAddExpense = useCallback(async (
    amount: number, categoryId: number, date: string, description?: string, rawInput?: string
  ) => {
    await add(amount, categoryId, date, description, rawInput);
    reloadStats();
    reloadBudgets();
  }, [add, reloadStats, reloadBudgets]);

  // 切换到仪表盘时自动刷新数据
  useFocusEffect(useCallback(() => { reloadStats(); reloadBudgets(); }, [reloadStats, reloadBudgets]));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.flex1} keyboardShouldPersistTaps="handled" refreshControl={
        <RefreshControl refreshing={loading || budgetLoading} onRefresh={() => { reloadStats(); reloadBudgets(); }} tintColor="#6366f1" />
      }>
        <View style={s.header}>
          <Text style={s.headerTitle}>📊 {formatMonth(month)}</Text>
        </View>

        <View style={s.statsRow}>
          <StatCard title="总支出" value={formatAmount(overview?.totalExpense || 0)}
            subtitle={overview ? `环比 ${overview.monthOverMonth >= 0 ? '+' : ''}${overview.monthOverMonth.toFixed(1)}%` : ''}
            trend={overview && overview.monthOverMonth > 0 ? 'up' : overview && overview.monthOverMonth < 0 ? 'down' : 'neutral'} />
          <StatCard title="日均" value={formatAmount(overview?.dailyAverage || 0)}
            subtitle={`${overview?.recordCount || 0} 笔记录`} color="#3b82f6" />
        </View>

        {/* 分类占比 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>分类占比</Text>
          {categoryStats.length === 0 ? (
            <Text style={s.empty}>暂无数据</Text>
          ) : (
            <View>
              {categoryStats.filter(d => d.total > 0).slice(0, 6).map(d => (
                <View key={d.category_id} style={s.catRow}>
                  <View style={s.catLeft}>
                    <Text>{d.category_icon}</Text>
                    <Text style={s.catName}>{d.category_name}</Text>
                  </View>
                  <View style={s.catRight}>
                    <View style={s.bar}>
                      <View style={[s.barFill, { width: `${Math.min(d.percentage, 100)}%`, backgroundColor: d.category_color }]} />
                    </View>
                    <Text style={s.catPct}>{d.percentage.toFixed(0)}%</Text>
                    <Text style={s.catAmt}>¥{d.total.toFixed(0)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 预算预警 */}
        {budgets.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🎯 预算预警</Text>
            {budgets.map(b => {
              const pct = b.amount > 0 ? Math.min((b.spent / b.amount) * 100, 100) : 0;
              const isOver = b.spent > b.amount && b.amount > 0;
              const isWarn = pct >= 80 && !isOver;
              return (
                <View key={b.id} style={s.budgetRow}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, marginRight: 4 }}>{b.category_icon}</Text>
                      <Text style={{ fontSize: 14, color: '#1e293b' }}>{b.category_name}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: isOver ? '#ef4444' : isWarn ? '#f59e0b' : '#64748b' }}>
                      ¥{b.spent.toFixed(0)} / ¥{b.amount.toFixed(0)}
                    </Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${pct}%`, borderRadius: 4, backgroundColor: isOver ? '#ef4444' : isWarn ? '#f59e0b' : b.category_color }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
      <InputBar onAddExpense={handleAddExpense} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  flex1: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 16 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 12, padding: 16, marginBottom: 16, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 12 },
  empty: { color: '#64748b', textAlign: 'center', paddingVertical: 24 },
  catRow: { marginBottom: 10 },
  catLeft: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  catName: { fontSize: 13, color: '#1e293b', marginLeft: 6 },
  catRight: { flexDirection: 'row', alignItems: 'center' },
  bar: { flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginRight: 8 },
  barFill: { height: '100%', borderRadius: 4 },
  catPct: { fontSize: 12, color: '#64748b', width: 36, textAlign: 'right' },
  catAmt: { fontSize: 12, color: '#64748b', width: 60, textAlign: 'right' },
  budgetRow: { marginBottom: 12 },
});