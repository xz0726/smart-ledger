import { useMemo } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Copy, Users, Megaphone, MessagesSquare } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CardTitle from '../../src/components/CardTitle';
import { cardShadow, useThemeColors, type ThemeColors } from '../../src/theme';
import { SUPPORT, mqqGroupUrl } from '../../src/constants/support';
import { spacing, radius, fontSize } from '../../src/theme/spacing';

const copyText = async (text: string, label: string) => {
  try {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert('已复制', `${label}已复制到剪贴板`);
  } catch {
    Alert.alert('复制失败', '请手动复制号码');
  }
};

const openQqGroup = async () => {
  try {
    // 未装 QQ / scheme 无法处理时会抛错，走下方兜底
    await Linking.openURL(mqqGroupUrl());
  } catch {
    Alert.alert('未检测到 QQ', `请复制群号 ${SUPPORT.qqGroupId}，到 QQ 中搜索「${SUPPORT.qqGroupName}」并加入`, [
      { text: '取消', style: 'cancel' },
      { text: '复制群号', onPress: () => Clipboard.setStringAsync(SUPPORT.qqGroupId) },
    ]);
  }
};

export default function Contact() {
  const c = useThemeColors();
  const st = useMemo(() => createStyles(c), [c]);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={st.safe} contentContainerStyle={{ paddingBottom: insets.bottom }}>
      {/* 群简介 */}
      <View style={st.card}>
        <CardTitle icon={Megaphone} text="群简介" />
        <Text style={st.desc}>
          {SUPPORT.qqGroupName}（其实只有作者一个人）——答疑解惑、功能建议、版本动态都在这。进群后请先看群公告，遵守群规；反馈问题请尽量带上版本号和操作步骤，方便作者更快定位。
        </Text>
      </View>

      {/* QQ 交流群 */}
      <View style={st.card}>
        <CardTitle icon={MessagesSquare} text="QQ 交流群" />
        <Text style={st.groupName}>{SUPPORT.qqGroupName}</Text>
        <Text style={st.groupId}>群号：{SUPPORT.qqGroupId}</Text>
        <Text style={st.hint}>进群请备注：皇帝驾到</Text>
        <View style={st.btnRow}>
          <TouchableOpacity style={st.btnOutline} onPress={() => copyText(SUPPORT.qqGroupId, '群号')}>
            <Copy size={16} color={c.primary} />
            <Text style={st.btnOutlineText}>复制群号</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.btnPrimary} onPress={openQqGroup}>
            <Users size={16} color="#fff" />
            <Text style={st.btnPrimaryText}>一键加群</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.md, padding: spacing.lg, ...cardShadow },
  desc: { fontSize: fontSize.base, color: c.textSecondary, lineHeight: 22 },
  groupName: { fontSize: 15, fontWeight: '600', color: c.text },
  groupId: { fontSize: fontSize.md, color: c.primary, marginTop: 6, fontWeight: '500' },
  hint: { fontSize: fontSize.sm, color: c.hint, marginTop: spacing.xs, marginBottom: 14 },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  btnOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: c.primary,
  },
  btnOutlineText: { color: c.primary, fontSize: fontSize.base, fontWeight: '500', marginLeft: 6 },
  btnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: radius.sm, backgroundColor: c.primary,
  },
  btnPrimaryText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500', marginLeft: 6 },
});
