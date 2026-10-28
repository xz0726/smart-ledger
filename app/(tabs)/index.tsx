import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, RefreshControl, Animated, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Repeat, Rewind, Target, TrendingUp } from 'lucide-react-native';
import StatCard from '../../src/components/StatCard';
import CardTitle from '../../src/components/CardTitle';
import InputBar from '../../src/components/InputBar';
import MonthSwitcher from '../../src/components/MonthSwitcher';
import CategoryBreakdownCard from '../../src/components/CategoryBreakdownCard';
import DailyTrendChart from '../../src/components/charts/DailyTrendChart';
import QuickAddBar from '../../src/components/QuickAddBar';
import type { QuickItemWithCategory } from '../../src/types';
import { useStats } from '../../src/hooks/useStats';
import { useExpenses } from '../../src/hooks/useExpenses';
import { useBudget } from '../../src/hooks/useBudget';
import { useMonthStore } from '../../src/stores/monthStore';
import { cardShadow, useThemeColors, type ThemeColors } from '../../src/theme';
import { formatAmount, formatMonth, getTodayDate, isCurrentMonth } from '../../src/utils/format';

export default function Dashboard() {
  const { month, setMonth } = useMonthStore();
  const { overview, categoryStats, dailyTrend, fixedSummary, loading, reload: reloadStats } = useStats(month);
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

  // 快捷记账：点一下记一笔（记入今天），随后轻提示
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    toastOpacity.setValue(0);
    Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null));
    }, 1600);
  }, [toastOpacity]);

  const handleQuickAdd = useCallback(async (item: QuickItemWithCategory) => {
    await handleAddExpense(item.amount, item.category_id, getTodayDate(), item.name);
    showToast(`已记 · ${item.name} ${formatAmount(item.amount)}`);
  }, [handleAddExpense, showToast]);

  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  const balance = (overview?.totalIncome || 0) - (overview?.totalExpense || 0);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.flex1} keyboardShouldPersistTaps="handled" refreshControl={
        <RefreshControl refreshing={loading || budgetLoading} onRefresh={() => { reloadStats(); reloadBudgets(); }} tintColor="#6366f1" />
      }>
        <MonthSwitcher month={month} onChange={setMonth} />

        {/* 收支总览 */}
        <View style={s.statsRow}>
          <StatCard title="总支出" value={formatAmount(overview?.totalExpense || 0)}
            subtitle={overview ? (overview.hasPrevData
              ? `环比 ${overview.monthOverMonth >= 0 ? '+' : ''}${overview.monthOverMonth.toFixed(1)}%`
              : '无上月数据') : ''}
            trend={overview && overview.hasPrevData
              ? (overview.monthOverMonth > 0 ? 'up' : overview.monthOverMonth < 0 ? 'down' : 'neutral')
              : 'neutral'} />
          <StatCard title="总收入" value={formatAmount(overview?.totalIncome || 0)} color="#22c55e" />
        </View>
        <View style={s.statsRow}>
          <StatCard title="日均" value={formatAmount(overview?.dailyAverage || 0)}
            subtitle={`${overview?.recordCount || 0} 笔记录`} color="#3b82f6" />
          <StatCard title="结余" value={formatAmount(balance)} color={balance >= 0 ? '#22c55e' : '#ef4444'} />
        </View>

        {/* 每日支出趋势 */}
        <View style={s.card}>
          <CardTitle icon={TrendingUp} text="每日支出趋势" />
          <DailyTrendChart data={dailyTrend} month={month} />
        </View>

        {/* 快捷记账：固定金额点一下记一笔 */}
        <QuickAddBar onQuickAdd={handleQuickAdd} />

        {/* 分类占比（条形 / 饼图切换） */}
        <CategoryBreakdownCard data={categoryStats} />

        {/* 固定收支汇总 */}
        {fixedSummary && (fixedSummary.expenseTotal > 0 || fixedSummary.incomeTotal > 0) && (
          <View style={s.card}>
            <CardTitle icon={Repeat} text="固定收支" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: c.text }}>本月固定支出 ¥{fixedSummary.expenseTotal.toFixed(0)}</Text>
              <Text style={{ fontSize: 13, color: '#22c55e' }}>固定收入 ¥{fixedSummary.incomeTotal.toFixed(0)}</Text>
            </View>
          </View>
        )}

        {/* 预算预警 */}
        {budgets.length > 0 && (
          <View style={s.card}>
            <CardTitle icon={Target} text="预算预警" />
            {budgets.map(b => {
              const pct = b.amount > 0 ? Math.min((b.spent / b.amount) * 100, 100) : 0;
              const isOver = b.spent > b.amount && b.amount > 0;
              const isWarn = pct >= 80 && !isOver;
              return (
                <View key={b.id} style={s.budgetRow}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: b.category_color + '20', marginRight: 6 }}>
                        <Text style={{ fontSize: 13 }}>{b.category_icon}</Text>
                      </View>
                      <Text style={{ fontSize: 14, color: c.text }}>{b.category_name}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: isOver ? '#ef4444' : isWarn ? '#f59e0b' : c.textSecondary }}>
                      ¥{b.spent.toFixed(0)} / ¥{b.amount.toFixed(0)}
                    </Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: c.subtle, borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${pct}%`, borderRadius: 4, backgroundColor: isOver ? '#ef4444' : isWarn ? '#f59e0b' : b.category_color }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* 查看历史月时提醒：新记账默认记入今天 */}
      {!isCurrentMonth(month) && (
        <View style={s.histHint}>
          <Rewind size={12} color={c.histHintText} />
          <Text style={s.histHintText}>正在查看 {formatMonth(month)}，新记账默认记入今天</Text>
        </View>
      )}
      <InputBar onAddExpense={handleAddExpense} />

      {/* 快捷记账轻提示 */}
      {toast && (
        <Animated.View pointerEvents="none" style={[s.toast, { opacity: toastOpacity }]}>
          <Text style={s.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  flex1: { flex: 1 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 16 },
  card: { backgroundColor: c.card, marginHorizontal: 16, borderRadius: 12, padding: 16, marginBottom: 16, ...cardShadow },
  budgetRow: { marginBottom: 12 },
  histHint: { backgroundColor: c.histHintBg, paddingHorizontal: 16, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  histHintText: { fontSize: 12, color: c.histHintText, textAlign: 'center' },
  // 反色 toast：浅色下深底白字、深色下浅底深字，两种主题都清晰
  toast: { position: 'absolute', bottom: 72, alignSelf: 'center', backgroundColor: c.text, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  toastText: { fontSize: 13, color: c.background, fontWeight: '500' },
});
