import React from 'react';
import { View, Text } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import type { CategoryStats } from '../../types';

interface Props {
  data: CategoryStats[];
}

export default function CategoryPieChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <View className="items-center justify-center py-8">
        <Text className="text-text-secondary">暂无数据</Text>
      </View>
    );
  }

  const chartData = data
    .filter(d => d.total > 0)
    .map(d => ({
      value: d.total,
      color: d.category_color,
      text: d.category_name,
    }));

  if (chartData.length === 0) {
    return (
      <View className="items-center justify-center py-8">
        <Text className="text-text-secondary">暂无数据</Text>
      </View>
    );
  }

  return (
    <View className="items-center">
      <PieChart
        data={chartData}
        donut
        showGradient
        sectionAutoFocus
        radius={90}
        innerRadius={55}
        innerCircleColor="#f8fafc"
        centerLabelComponent={() => (
          <View className="items-center">
            <Text className="text-xs text-text-secondary">总支出</Text>
            <Text className="text-lg font-bold text-text">
              ¥{data.reduce((s, d) => s + d.total, 0).toFixed(0)}
            </Text>
          </View>
        )}
      />
      <View className="flex-row flex-wrap justify-center mt-3 gap-x-3 gap-y-1">
        {data.filter(d => d.total > 0).slice(0, 6).map(d => (
          <View key={d.category_id} className="flex-row items-center">
            <View className="w-2.5 h-2.5 rounded-full mr-1" style={{ backgroundColor: d.category_color }} />
            <Text className="text-xs text-text-secondary">
              {d.category_icon} {d.category_name} {d.percentage.toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}