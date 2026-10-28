import { useState, useEffect, useCallback } from 'react';
import type { StatsOverview, CategoryStats, DailyTrend } from '../types';
import * as db from '../services/db';
import { getPreviousMonth } from '../utils/format';

export function useStats(month: string) {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [fixedSummary, setFixedSummary] = useState<{ expenseTotal: number; incomeTotal: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const prevMonth = getPreviousMonth(month);
      const [ov, cs, dt, fs] = await Promise.all([
        db.getStatsOverview(month, prevMonth),
        db.getCategoryStats(month),
        db.getDailyTrend(month),
        db.getFixedSummary(month),
      ]);
      setOverview(ov);
      setCategoryStats(cs);
      setDailyTrend(dt);
      setFixedSummary(fs);
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  return { overview, categoryStats, dailyTrend, fixedSummary, loading, reload: load };
}