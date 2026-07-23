import { useState, useEffect, useCallback } from 'react';
import type { BudgetWithCategory } from '../types';
import * as db from '../services/db';

export function useBudget(month: string) {
  const [budgets, setBudgets] = useState<BudgetWithCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await db.getBudgets(month);
      setBudgets(result);
    } catch (e) {
      console.error('Failed to load budgets:', e);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const setBudget = useCallback(async (
    categoryId: number,
    amount: number,
    period: 'monthly' | 'weekly' = 'monthly'
  ) => {
    await db.setBudget(categoryId, amount, month, period);
    await load();
  }, [month, load]);

  return { budgets, loading, setBudget, reload: load };
}