import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import type { DailyTrend } from '../../types';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface Props {
  data: DailyTrend[];
}

export default function DailyLineChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <View className="items-center justify-center py-8">
        <Text className="text-text-secondary">暂无数据</Text>
      </View>
    );
  }

  const chartData = data.map(d => ({
    value: d.amount,
    label: d.date.slice(-2), // 只显示日期
    dataPointText: d.amount > 0 ? d.amount.toFixed(0) : '',
  }));

  const maxValue = Math.max(...data.map(d => d.amount), 1);

  return (
    <View className="items-center">
      <LineChart
        data={chartData}
        width={SCREEN_WIDTH - 96}
        height={180}
        showVerticalLines
        spacing={Math.max(30, (SCREEN_WIDTH - 96) / data.length - 10)}
        color="#6366f1"
        thickness={2}
        startFillColor="#6366f120"
        endFillColor="#6366f102"
        startOpacity={0.4}
        endOpacity={0.05}
        initialSpacing={10}
        endSpacing={10}
        noOfSections={4}
        maxValue={maxValue * 1.2 || 100}
        yAxisColor="#e2e8f0"
        xAxisColor="#e2e8f0"
        yAxisTextStyle={{ color: '#94a3b8', fontSize: 10 }}
        xAxisLabelTextStyle={{ color: '#94a3b8', fontSize: 10 }}
        hideDataPoints={data.length > 15}
        dataPointsColor="#6366f1"
        dataPointsRadius={4}
        textColor="#1e293b"
        textFontSize={10}
        curved
        isAnimated
      />
    </View>
  );
}