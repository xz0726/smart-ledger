import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useThemeColors, type ThemeColors } from '../../theme';
import type { CategoryStats } from '../../types';
import { formatShortAmount } from '../../utils/format';
import { spacing, radius, fontSize } from '../../theme/spacing';

interface Props {
  data: CategoryStats[];
}

const SIZE = 168;        // viewBox 尺寸
const CENTER = SIZE / 2; // 圆心
const RI = 44;           // 环内半径
const RO = 72;           // 环外半径（选中扇区 +4 外扩放大）

// 角度 → 坐标（deg 从 -90° 即 12 点方向起，y 向下故顺时针增长）
function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

// 环形扇区 Path：内弧 → 外弧（大圆弧）→ 外弧端 → 内弧（小圆弧）→ 闭合
function ringSector(a0: number, a1: number, ri: number, ro: number): string {
  const p0 = polar(ri, a0);
  const p1 = polar(ro, a0);
  const p2 = polar(ro, a1);
  const p3 = polar(ri, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(3)} ${p0.y.toFixed(3)} L ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} ` +
    `A ${ro.toFixed(3)} ${ro.toFixed(3)} 0 ${large} 1 ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} ` +
    `L ${p3.x.toFixed(3)} ${p3.y.toFixed(3)} A ${ri.toFixed(3)} ${ri.toFixed(3)} 0 ${large} 0 ${p0.x.toFixed(3)} ${p0.y.toFixed(3)} Z`;
}

export default function CategoryDonutChart({ data }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);
  const total = useMemo(() => data.reduce((s, d) => s + d.total, 0), [data]);

  // 月份/数据切换后默认选中最大扇区
  useEffect(() => {
    setActiveId(data.length > 0 ? data[0].category_id : null);
  }, [data]);

  const active = data.find(d => d.category_id === activeId) || data[0];

  if (data.length === 0) {
    return <Text style={s.empty}>暂无数据</Text>;
  }

  // 每扇区独立 Path 环形扇形，命中测试精确（比 strokeDasharray 圆环可靠）
  let acc = 0;
  const wedges = data.map(d => {
    const a0 = -90 + 360 * acc;
    const a1 = Math.min(a0 + 360 * (d.total / total), a0 + 359.99); // 单扇区避免 360° 弧退化
    acc += d.total / total;
    const isActive = activeId === d.category_id;
    return (
      <Path
        key={d.category_id}
        d={ringSector(a0, a1, RI, isActive ? RO + 4 : RO)}
        fill={d.category_color}
        stroke={c.card}
        strokeWidth={1}
        opacity={activeId === null || isActive ? 1 : 0.35}
        onPress={() => setActiveId(isActive ? null : d.category_id)}
      />
    );
  });

  return (
    <View>
      <View style={s.chartWrap}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {wedges}
        </Svg>
        {/* pointerEvents="none"：中心点击穿透到下方扇区，不拦截 */}
        <View style={s.center} pointerEvents="none">
          <Text style={s.centerLabel}>总支出</Text>
          <Text style={s.centerValue}>{formatShortAmount(total)}</Text>
        </View>
      </View>

      {active && (
        <View style={s.detail}>
          <Text style={s.detailIcon}>{active.category_icon}</Text>
          <Text style={s.detailName}>{active.category_name}</Text>
          <Text style={s.detailAmt}>¥{active.total.toFixed(0)}</Text>
          <Text style={s.detailMeta}>
            {active.percentage.toFixed(1)}% · {active.count} 笔
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  chartWrap: { width: 168, height: 168, alignSelf: 'center', marginTop: spacing.xs },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerLabel: { fontSize: fontSize.sm, color: c.textSecondary },
  centerValue: { fontSize: 18, fontWeight: 'bold', color: c.text, marginTop: 2 },
  detail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, minHeight: 28, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: c.inputBg, borderRadius: radius.sm, alignSelf: 'center' },
  detailIcon: { fontSize: fontSize.lg, marginRight: 6 },
  detailName: { fontSize: fontSize.base, fontWeight: '600', color: c.text, marginRight: spacing.sm },
  detailAmt: { fontSize: fontSize.base, fontWeight: '600', color: c.text, marginRight: spacing.sm },
  detailMeta: { fontSize: fontSize.sm, color: c.textSecondary },
  empty: { color: c.textSecondary, textAlign: 'center', paddingVertical: spacing.xl },
});
