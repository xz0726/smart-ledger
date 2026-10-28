import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { useThemeColors, type ThemeColors } from '../../theme';
import type { DailyTrend } from '../../types';
import { getCurrentMonth, getMonthRange, formatShortAmount } from '../../utils/format';

interface Props {
  data: DailyTrend[];
  month: string;
}

const CHART_H = 100;    // 柱子区高度（顶部留 12px 给峰值标签）
const PEAK_SPACE = 12;  // 峰值金额标签预留空间
const LABEL_H = 18;     // 日期标签区高度

export default function DailyTrendChart({ data, month }: Props) {
  const [width, setWidth] = useState(0);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  // 稀疏数据补零：每日一档；当前月只补到今日
  const days = useMemo(() => {
    const byDate = new Map(data.map(d => [d.date, d.amount]));
    const { start, end } = getMonthRange(month);
    const lastDay = parseInt(end.split('-')[2]);
    const isCurrent = month === getCurrentMonth();
    const today = new Date().getDate();
    const count = isCurrent ? Math.min(today, lastDay) : lastDay;
    const out: { day: number; amount: number }[] = [];
    for (let i = 1; i <= count; i++) {
      const key = `${month}-${i.toString().padStart(2, '0')}`;
      out.push({ day: i, amount: byDate.get(key) || 0 });
    }
    return out;
  }, [data, month]);

  const max = useMemo(() => days.reduce((m, d) => Math.max(m, d.amount), 0), [days]);
  const hasData = days.some(d => d.amount > 0);

  if (!hasData) {
    return <Text style={s.empty}>本月暂无支出</Text>;
  }

  const n = days.length;
  const spacing = n > 0 ? width / n : 0;
  const barW = Math.max(spacing * 0.55, 2);

  return (
    <View style={s.wrap} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={CHART_H + LABEL_H}>
          {days.map((d, i) => {
            const h = d.amount > 0 ? Math.max((d.amount / max) * (CHART_H - PEAK_SPACE), 3) : 1.5;
            return (
              <Rect key={i} x={i * spacing + (spacing - barW) / 2} y={CHART_H - h}
                width={barW} height={h} rx={1.5} fill={d.amount > 0 ? '#6366f1' : c.border} />
            );
          })}
          {days.map((d, i) => {
            if (d.day % 5 !== 1 && i !== n - 1) return null;
            return (
              <SvgText key={`l${i}`} x={i * spacing + spacing / 2} y={CHART_H + 13}
                fontSize={9} fill={c.hint} textAnchor="middle">
                {d.day}
              </SvgText>
            );
          })}
          {days.map((d, i) => {
            if (d.amount !== max || d.amount <= 0) return null;
            const h = (d.amount / max) * (CHART_H - PEAK_SPACE);
            return (
              <SvgText key={`m${i}`} x={i * spacing + spacing / 2} y={CHART_H - h - 4}
                fontSize={9} fill="#6366f1" textAnchor="middle" fontWeight="bold">
                {formatShortAmount(d.amount)}
              </SvgText>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  wrap: { width: '100%' },
  empty: { color: c.textSecondary, textAlign: 'center', paddingVertical: 24 },
});
