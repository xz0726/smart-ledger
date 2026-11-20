import React, { useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Check, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalHeader from './ModalHeader';
import { useThemeColors, type ThemeColors } from '../theme';
import { spacing, radius, fontSize } from '../theme/spacing';
import type { ReleaseNotes } from '../constants/releaseNotes';

interface Props {
  visible: boolean;
  version: string;
  notes: ReleaseNotes;
  onClose: () => void;
}

/** 更新介绍：安装新版本后第一次打开 App 时弹出一次 */
export default function WhatsNewModal({ visible, version, notes, onClose }: Props) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(c), [c]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[s.panel, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <ModalHeader
            title={notes.title}
            onClose={onClose}
            right={<View style={s.versionPill}><Text style={s.versionText}>v{version}</Text></View>}
          />
          <ScrollView style={s.body} bounces={false}>
            <View style={s.hero}>
              <View style={s.heroIcon}><Sparkles size={20} color={c.primary} /></View>
              <Text style={s.intro}>{notes.intro}</Text>
            </View>
            {notes.items.map((t, i) => (
              <View key={i} style={s.row}>
                <View style={s.check}><Check size={12} color={c.primary} strokeWidth={3} /></View>
                <Text style={s.itemText}>{t}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={s.primaryBtn} onPress={onClose} accessibilityRole="button">
            <Text style={s.primaryBtnText}>开始记账</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdrop: { flex: 1 },
  panel: { backgroundColor: c.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, width: '100%', maxWidth: 480, alignSelf: 'center', maxHeight: '85%' },
  versionPill: { backgroundColor: c.primarySoftBg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  versionText: { fontSize: fontSize.sm, color: c.primaryText, fontWeight: '600' },
  body: { flexShrink: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.xs },
  heroIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.primarySoftBg, alignItems: 'center', justifyContent: 'center' },
  intro: { flex: 1, fontSize: fontSize.base, color: c.textSecondary, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: 7 },
  check: { width: 18, height: 18, borderRadius: 9, backgroundColor: c.primarySoftBg, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  itemText: { flex: 1, fontSize: fontSize.base, color: c.text, lineHeight: 21 },
  primaryBtn: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: c.primary, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: fontSize.base + 1, fontWeight: '600' },
});
