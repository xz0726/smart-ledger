import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export default function StatCard({ title, value, subtitle, color = '#6366f1', trend }: Props) {
  return (
    <View style={s.card}>
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

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, flex: 1, marginHorizontal: 4, elevation: 1 },
  title: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  value: { fontSize: 20, fontWeight: 'bold' },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  subtitle: { fontSize: 12, color: '#64748b' },
});