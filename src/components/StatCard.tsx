import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useThemeColors, type ThemeColors } from '../theme';

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  style?: ViewStyle;
}

export default function StatCard({ title, value, subtitle, color = '#6366f1', trend, style }: Props) {
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  return (
    <View style={[s.card, style]}>
      <Text style={s.title}>{title}</Text>
      <Text style={[s.value, { color }]}>{value}</Text>
      {subtitle ? (
        <View style={s.subRow}>
          {trend === 'up' && <Text style={{ color: '#ef4444', fontSize: 12, marginRight: 2 }}>↑</Text>}
          {trend === 'down' && <Text style={{ color: '#22c55e', fontSize: 12, marginRight: 2 }}>↓</Text>}
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 12, padding: 16, flex: 1, marginHorizontal: 4, elevation: 1 },
  title: { fontSize: 12, color: c.textSecondary, marginBottom: 4 },
  value: { fontSize: 20, fontWeight: 'bold' },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  subtitle: { fontSize: 12, color: c.textSecondary },
});
