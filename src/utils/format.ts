export function formatAmount(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

export function formatShortAmount(amount: number): string {
  if (amount >= 10000) {
    return `¥${(amount / 10000).toFixed(1)}万`;
  }
  return `¥${amount.toFixed(0)}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${month}月${day}日 ${weekdays[date.getDay()]}`;
}

export function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  return `${year}年${parseInt(m)}月`;
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

export function getTodayDate(): string {
  const now = new Date();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function getPreviousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 2, 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export function getNextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m, 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export function isCurrentMonth(month: string): boolean {
  return month === getCurrentMonth();
}

export function getRecentMonths(endMonth: string = getCurrentMonth(), count = 12): string[] {
  const out: string[] = [];
  let m = endMonth;
  for (let i = 0; i < count; i++) {
    out.unshift(m);
    m = getPreviousMonth(m);
  }
  return out;
}

export function getMonthRange(month: string): { start: string; end: string } {
  const [year, m] = month.split('-').map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${lastDay.toString().padStart(2, '0')}`,
  };
}