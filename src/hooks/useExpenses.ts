import { useState, useEffect, useCallback } from 'react';
import type { ExpenseWithCategory, Expense } from '../types';
import * as db from '../services/db';

export function useExpenses(month?: string) {
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (params?: {
    month?: string;
    categoryId?: number;
    search?: string;
  }) => {
    setLoading(true);
    try {
      const result = await db.getExpenses({
        month: params?.month || month,
        categoryId: params?.categoryId,
        search: params?.search,
        pageSize: 200,
      });
      setExpenses(result.data);
      setTotal(result.total);
    } catch (e) {
      console.error('Failed to load expenses:', e);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (
    amount: number,
    categoryId: number,
    expenseDate: string,
    description?: string,
    rawInput?: string
  ) => {
    const id = await db.addExpense(amount, categoryId, expenseDate, description, rawInput);
    await load();
    return id;
  }, [load]);

  const remove = useCallback(async (id: number) => {
    await db.deleteExpense(id);
    await load();
  }, [load]);

  const update = useCallback(async (id: number, updates: {
    amount?: number;
    categoryId?: number;
    description?: string;
    expenseDate?: string;
  }) => {
    await db.updateExpense(id, updates);
    await load();
  }, [load]);

  return { expenses, loading, total, load, add, remove, update };
}