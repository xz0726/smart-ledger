import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Pressable, StyleSheet, AppState, Animated, AccessibilityInfo } from 'react-native';
import { ChartColumn, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import ModalHeader from './ModalHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, type ThemeColors } from '../theme';
import { formatMonth, getCurrentMonth, getMonthsInYear, getNextMonth, getPreviousMonth, isCurrentMonth } from '../utils/format';
import { getExpenseMonths } from '../services/db';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  month: string;
  onChange: (m: string) => void;
}

const yearOf = (m: string) => Number(m.slice(0, 4));

const FUTURE_HINT = '客官不能看到未来的账单哦~';

export default function MonthSwitcher({ month, onChange }: Props) {
  const [visible, setVisible] = useState(false);
  const [viewYear, setViewYear] = useState(() => yearOf(month));
  const [recordMonths, setRecordMonths] = useState<Set<string>>(() => new Set());
  const [, forceRefresh] = useState(0);

  const [hint, setHint] = useState<string | null>(null);
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = getCurrentMonth();
  const currentYear = yearOf(current);
  const selectedYear = yearOf(month);
  const months = useMemo(() => getMonthsInYear(viewYear), [viewYear]);
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(c), [c]);

  // 最早有数据的年份；恒定允许回看一年（空库 / 跨年首月也不至于无历史可看）
  const earliestYear = useMemo(() => {
    let y = Infinity;
    for (const m of recordMonths) y = Math.min(y, yearOf(m));
    return Number.isFinite(y) ? y : currentYear;
  }, [recordMonths, currentYear]);
  const minYear = Math.min(currentYear, selectedYear, earliestYear, currentYear - 1);

  // 每次打开重拉，记账后不会看到过期圆点
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    getExpenseMonths()
      .then(ms => { if (alive) setRecordMonths(new Set(ms)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [visible]);

  // 跨月挂后台再回前台：重算 current（刷新「本月」标记），不自动改用户选中的月份
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') forceRefresh(t => t + 1);
    });
    return () => sub.remove();
  }, []);

  const openSheet = () => {
    setViewYear(selectedYear);
    setVisible(true);
  };

  // 选中后不关闭弹窗：页面数据随 onChange 实时更新，用户可继续挑月份再手动关闭
  const selectMonth = (m: string) => {
    onChange(m);
  };

  /** 点到未来月份 / 未来年份时的俏皮轻提示 */
  const showHint = useCallback(() => {
    AccessibilityInfo.announceForAccessibility(FUTURE_HINT);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setHint(FUTURE_HINT);
    hintOpacity.stopAnimation();
    hintOpacity.setValue(0);
    Animated.timing(hintOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => {
      Animated.timing(hintOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setHint(null); });
    }, 1600);
  }, [hintOpacity]);

  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  return (
    <>
      <View style={hint && !visible ? s.rootRaised : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => onChange(getPreviousMonth(month))} hitSlop={8}>
            <ChevronLeft size={22} color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.titleBtn}
            onPress={openSheet}
            accessibilityRole="button"
            accessibilityLabel={`选择月份，当前 ${formatMonth(month)}`}>
            <View style={s.titleRow}>
              <ChartColumn size={17} color={c.primaryText} strokeWidth={2.2} />
              <Text style={s.title}>{formatMonth(month)}{isCurrentMonth(month) ? ' · 本月' : ''}</Text>
              <ChevronDown size={15} color={c.hint} strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => isCurrentMonth(month) ? showHint() : onChange(getNextMonth(month))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="下一个月"
            accessibilityHint="已到本月，未来月份不可查看"
            accessibilityState={{ disabled: isCurrentMonth(month) }}>
            <ChevronRight size={22} color={isCurrentMonth(month) ? c.disabled : c.textSecondary} />
          </TouchableOpacity>
        </View>
        {/* 浏览历史月时，页面上直接提供「回到本月」 */}
        {!isCurrentMonth(month) && (
          <TouchableOpacity style={s.backBtn} onPress={() => onChange(getCurrentMonth())}>
            <Text style={s.backBtnText}>回到本月</Text>
          </TouchableOpacity>
        )}
        {hint && !visible && (
          <Animated.View pointerEvents="none" accessibilityLiveRegion="polite"
            style={[s.hintBubble, s.pageHint, { opacity: hintOpacity }]}>
            <Text style={s.hintText}>{hint}</Text>
          </Animated.View>
        )}
      </View>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <Pressable style={s.overlay} onPress={() => setVisible(false)}>
          <Pressable style={s.modal} onPress={e => e.stopPropagation()}>
            <ModalHeader
              title="选择月份"
              onClose={() => setVisible(false)}
              right={!isCurrentMonth(month) ? (
                <TouchableOpacity hitSlop={8} onPress={() => selectMonth(current)}
                  accessibilityRole="button" accessibilityLabel="回到本月">
                  <Text style={s.rightAction}>回到本月</Text>
                </TouchableOpacity>
              ) : null}
            />

            <View style={s.yearRow}>
              <TouchableOpacity
                disabled={viewYear <= minYear}
                onPress={() => setViewYear(y => y - 1)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="上一年"
                accessibilityState={{ disabled: viewYear <= minYear }}>
                <ChevronLeft size={20} color={viewYear <= minYear ? c.disabled : c.textSecondary} />
              </TouchableOpacity>
              <Text style={s.yearText}>{viewYear}年</Text>
              <TouchableOpacity
                onPress={() => viewYear >= currentYear ? showHint() : setViewYear(y => y + 1)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="下一年"
                accessibilityHint="未来年份不可查看"
                accessibilityState={{ disabled: viewYear >= currentYear }}>
                <ChevronRight size={20} color={viewYear >= currentYear ? c.disabled : c.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={[s.body, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
              <View style={s.grid}>
                {months.map((m, i) => {
                  const no = i + 1;
                  const active = m === month;
                  const isNow = m === current;
                  const isFuture = m > current; // YYYY-MM 零填充，字符串比较即时间序
                  const hasRecords = recordMonths.has(m);
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => isFuture ? showHint() : selectMonth(m)}
                      style={[s.monthItem, active && s.monthItemActive, isFuture && s.monthItemDisabled]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active, disabled: isFuture }}
                      accessibilityHint={isFuture ? '未来月份不可查看' : undefined}
                      accessibilityLabel={`${viewYear}年${no}月${isNow ? '，本月' : ''}${hasRecords ? '，有记录' : ''}${isFuture ? '，未来月份' : ''}`}>
                      <Text style={[s.monthNum, active && s.monthNumActive, isFuture && s.monthNumDisabled]}>{no}月</Text>
                      <View style={s.monthSub}>
                        {isNow
                          ? <Text style={[s.nowTag, active && s.nowTagActive]}>本月</Text>
                          : hasRecords ? <View style={[s.dot, active && s.dotActive]} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            {hint && visible && (
              <Animated.View pointerEvents="none" accessibilityLiveRegion="polite"
                style={[s.hintBubble, { opacity: hintOpacity, bottom: Math.max(insets.bottom, spacing.lg) + spacing.md }]}>
                <Text style={s.hintText}>{hint}</Text>
              </Animated.View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  titleBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { fontSize: 18, fontWeight: '600', color: c.text },
  backBtn: { alignSelf: 'center', marginBottom: spacing.sm, backgroundColor: c.primarySoftBg, paddingHorizontal: spacing.lg, paddingVertical: 6, borderRadius: radius.pill },
  backBtnText: { fontSize: fontSize.md, color: c.primaryText, fontWeight: '500' },
  rootRaised: { zIndex: 20, elevation: 8 }, // 让页头下方的提示条盖住后面的卡片/搜索框
  hintBubble: { position: 'absolute', alignSelf: 'center', zIndex: 20, backgroundColor: c.text, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  pageHint: { top: 46 },
  hintText: { fontSize: fontSize.md, color: c.background, fontWeight: '500' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: { backgroundColor: c.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, width: '100%', maxWidth: 480, alignSelf: 'center', maxHeight: '85%' },
  rightAction: { fontSize: fontSize.md, color: c.primaryText, fontWeight: '500' },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.subtle },
  yearText: { fontSize: fontSize.lg, fontWeight: '600', color: c.text },
  body: { flexShrink: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthItem: { width: '31%', height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  monthItemActive: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  monthItemDisabled: { opacity: 0.45, borderColor: c.subtle },
  monthNum: { fontSize: fontSize.lg, fontWeight: '500', color: c.text },
  monthNumActive: { color: c.primaryText, fontWeight: '700' },
  monthNumDisabled: { color: c.disabled },
  monthSub: { height: 14, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  nowTag: { fontSize: 10, color: c.hint },
  nowTagActive: { color: c.primaryText },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary },
  dotActive: { backgroundColor: c.primaryText },
});
