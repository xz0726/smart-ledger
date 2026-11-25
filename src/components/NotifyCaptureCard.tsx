import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet, Linking, Platform, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bell, ChevronRight } from 'lucide-react-native';
import CardTitle from './CardTitle';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import { spacing, radius, fontSize } from '../theme/spacing';
import {
  isNotifyCaptureAvailable, isListenerEnabled, isNotifyCaptureEnabled,
  setNotifyCaptureEnabled, startNotifyCapture,
  getNotifyCaptureStatus, type NotifyCaptureStatus,
} from '../services/notifyCapture';

const PKG_LABEL: Record<string, string> = {
  'com.tencent.mm': '微信',
  'com.eg.android.AlipayGphone': '支付宝',
};

const OUTCOME_LABEL: Record<string, string> = {
  connected: '服务连接',
  disconnected: '服务断开',
  not_target: '非目标应用',
  disabled: '开关关闭',
  no_extras: '无内容',
  empty: '内容为空',
  no_keyword: '无支付关键词',
  captured_js: '已捕获',
  captured_buffer: '已缓存',
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 自动记账（通知捕获）设置卡片，仅 Android 显示：
 * 开关 + 系统「通知使用权」授权引导。捕获的支付通知进仪表盘「待确认记账」，确认后才入账。
 */
export default function NotifyCaptureCard() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [granted, setGranted] = useState(false);
  const [status, setStatus] = useState<NotifyCaptureStatus | null>(null);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'android' || !isNotifyCaptureAvailable()) return;
    setAvailable(true);
    const [on, ok] = await Promise.all([isNotifyCaptureEnabled(), isListenerEnabled()]);
    setEnabled(on);
    setGranted(ok);
    // 用户刚在系统设置授权后回到 App：开关已开则立即开始监听
    if (on && ok) await startNotifyCapture();
    setStatus(await getNotifyCaptureStatus());
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
              try {
                // action 不是 URL，必须走 Intent；openURL 会静默失败
                await Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS');
              } catch {
                Alert.alert('无法直接打开设置', '请手动前往：系统设置 → 应用 → 特殊权限 → 通知使用权，允许「智记账」。');
              }
            }}>
            <Text style={s.goText}>去系统设置授权</Text>
            <ChevronRight size={16} color="#fff" />
          </TouchableOpacity>
        </>
      )}
      {enabled && granted && (
        <Text style={s.ok}>✓ 通知使用权已授权，捕获到的支付通知会出现在仪表盘「待确认记账」</Text>
      )}
      {enabled && status ? (
        <TouchableOpacity onPress={refresh} activeOpacity={0.7}>
          <Text style={s.diag}>
            {status.connected ? '服务已连接' : '服务未连接'} · 回调 {status.eventCount} 次
            {status.lastEventAt > 0
              ? ` · 最近 ${fmtTime(status.lastEventAt)} ${PKG_LABEL[status.lastPkg] || status.lastPkg || '系统'} ${OUTCOME_LABEL[status.lastOutcome] || status.lastOutcome}`
              : ''}
            （点此刷新）
          </Text>
        </TouchableOpacity>
      ) : null}
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
  diag: { fontSize: fontSize.xs, color: c.hint, marginTop: spacing.sm, lineHeight: 16 },
  goBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary, borderRadius: radius.sm, paddingVertical: spacing.md, marginTop: spacing.md },
  goText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500', marginRight: spacing.xs },
  tip: { fontSize: fontSize.sm, color: c.hint, marginTop: spacing.md, lineHeight: 18 },
});
