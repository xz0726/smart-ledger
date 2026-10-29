import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet, Linking, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bell, ChevronRight } from 'lucide-react-native';
import CardTitle from './CardTitle';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import { spacing, radius, fontSize } from '../theme/spacing';
import {
  isNotifyCaptureAvailable, isListenerEnabled, isNotifyCaptureEnabled,
  setNotifyCaptureEnabled, startNotifyCapture,
} from '../services/notifyCapture';

/**
 * 自动记账（通知捕获）设置卡片，仅 Android 显示：
 * 开关 + 系统「通知使用权」授权引导。捕获的支付通知进仪表盘「待确认记账」，确认后才入账。
 */
export default function NotifyCaptureCard() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [granted, setGranted] = useState(false);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'android' || !isNotifyCaptureAvailable()) return;
    setAvailable(true);
    setEnabled(await isNotifyCaptureEnabled());
    setGranted(await isListenerEnabled());
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (!available) return null;

  const toggle = async (v: boolean) => {
    setEnabled(v);
    await setNotifyCaptureEnabled(v);
    if (v && granted) await startNotifyCapture(); // 已授权时立即开始监听
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <CardTitle icon={Bell} text="自动记账" />
        <Switch value={enabled} onValueChange={toggle} trackColor={{ true: c.primary }} />
      </View>
      <Text style={s.desc}>
        开启后自动捕获支付宝 / 微信的支付类通知，本地解析后进入仪表盘「待确认记账」，由你确认后才入账。
        全程本地处理，不上传任何数据。
      </Text>
      {enabled && !granted && (
        <>
          <Text style={s.warn}>还没授予「通知使用权」，去系统设置允许智记账读取通知后回来即可。</Text>
          <TouchableOpacity
            style={s.goBtn}
            onPress={async () => {
              try { await Linking.openURL('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS'); } catch {}
            }}>
            <Text style={s.goText}>去系统设置授权</Text>
            <ChevronRight size={16} color="#fff" />
          </TouchableOpacity>
        </>
      )}
      {enabled && granted && (
        <Text style={s.ok}>✓ 通知使用权已授权，捕获到的支付通知会出现在仪表盘「待确认记账」</Text>
      )}
      <Text style={s.tip}>提示：部分支付通知不含金额，这类通知会保留原文，金额需手动补填；厂商省电策略可能中断监听，建议把智记账加入电池白名单。</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.md, padding: spacing.lg, ...cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  desc: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: spacing.md, lineHeight: 20 },
  warn: { fontSize: fontSize.sm, color: c.warning, marginTop: spacing.md, lineHeight: 20 },
  ok: { fontSize: fontSize.sm, color: c.success, marginTop: spacing.md },
  goBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary, borderRadius: radius.sm, paddingVertical: spacing.md, marginTop: spacing.md },
  goText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500', marginRight: spacing.xs },
  tip: { fontSize: fontSize.sm, color: c.hint, marginTop: spacing.md, lineHeight: 18 },
});
