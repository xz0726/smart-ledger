import { create } from 'zustand';
import { getCurrentMonth } from '../utils/format';

interface MonthState {
  month: string;
  setMonth: (m: string) => void;
}

export const useMonthStore = create<MonthState>((set) => ({
  month: getCurrentMonth(),
  setMonth: (m) => set({ month: m }),
}));
