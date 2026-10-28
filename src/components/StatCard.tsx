import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  style?: ViewStyle;
}

export default function StatCard({ title, value, subtitle, color, trend, style }: Props) {
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);
  const tone = color ?? c.primary;

  return (
    <View style={[s.card, style]}>
      <Text style={s.title}>{title}</Text>
      <Text style={[s.value, { color: tone }]}>{value}</Text>
      {subtitle ? (
        <View style={s.subRow}>
          {trend === 'up' && <Text style={{ color: c.danger, fontSize: fontSize.sm, marginRight: 2 }}>↑</Text>}
          {trend === 'down' && <Text style={{ color: c.success, fontSize: fontSize.sm, marginRight: 2 }}>↓</Text>}
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: radius.md, padding: spacing.lg, flex: 1, marginHorizontal: spacing.xs, ...cardShadow },
  title: { fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.xs },
  value: { fontSize: fontSize.xl, fontWeight: 'bold' },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  subtitle: { fontSize: fontSize.sm, color: c.textSecondary },
});
