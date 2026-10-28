import { View, Text, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useThemeColors } from '../theme';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  icon: LucideIcon;
  text: string;
  /** 覆盖默认的下间距（默认 12） */
  style?: object;
}

/**
 * 卡片标题行：lucide 小图标 + 标题文字。
 * 取代原先「emoji 前缀 + 文字」的写法，与全项目 lucide 图标体系保持一致。
 */
export default function CardTitle({ icon: Icon, text, style }: Props) {
  const c = useThemeColors();
  return (
    <View style={[s.row, style]}>
      <Icon size={15} color={c.primaryText} strokeWidth={2.2} />
      <Text style={[s.text, { color: c.text }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  text: { fontSize: fontSize.base, fontWeight: '600' },
});
