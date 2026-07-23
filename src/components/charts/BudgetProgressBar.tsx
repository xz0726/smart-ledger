import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  spent: number;
  budget: number;
}

export default function BudgetProgressBar({ categoryName, categoryIcon, categoryColor, spent, budget }: Props) {
  const percentage = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const isOverBudget = spent > budget && budget > 0;
  const isWarning = percentage >= 80 && !isOverBudget;

  return (
    <View className="mb-3">
      <View className="flex-row justify-between items-center mb-1">
        <View className="flex-row items-center">
          <Text className="text-sm mr-1">{categoryIcon}</Text>
          <Text className="text-sm text-text">{categoryName}</Text>
        </View>
        <Text className={`text-xs ${isOverBudget ? 'text-danger' : isWarning ? 'text-warning' : 'text-text-secondary'}`}>
          ¥{spent.toFixed(0)} / ¥{budget.toFixed(0)}
        </Text>
      </View>
      <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <View
          className="h-full rounded-full"
          style={{
            width: `${percentage}%`,
            backgroundColor: isOverBudget ? '#ef4444' : isWarning ? '#f59e0b' : categoryColor,
          }}
        />
      </View>
    </View>
  );
}