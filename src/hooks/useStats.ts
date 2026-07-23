import { useState, useEffect, useCallback } from 'react';
import type { StatsOverview, CategoryStats, DailyTrend } from '../types';
import * as db from '../services/db';
import { getPreviousMonth } from '../utils/format';

export function useStats(month: string) {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const prevMonth = getPreviousMonth(month);
      const [ov, cs, dt] = await Promise.all([
        db.getStatsOverview(month, prevMonth),
        db.getCategoryStats(month),
        db.getDailyTrend(month),
      ]);
      setOverview(ov);
      setCategoryStats(cs);
      setDailyTrend(dt);
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  return { overview, categoryStats, dailyTrend, loading, reload: load };
}