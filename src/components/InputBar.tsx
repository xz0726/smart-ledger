import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, TextInput, TouchableOpacity, Text, ActivityIndicator, Alert, StyleSheet, Keyboard, Animated, Platform, Dimensions } from 'react-native';
import { Send } from 'lucide-react-native';
import { useThemeColors, type ThemeColors } from '../theme';
import type { AIConfig, ParsedExpense } from '../types';
import { parseWithRules } from '../services/ruleEngine';
import { loadAIConfig, parseWithAI } from '../services/ai';
import { getCategories, getCustomRules } from '../services/db';
import ParsePreviewModal from './ParsePreviewModal';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  onAddExpense: (amount: number, categoryId: number, date: string, description?: string, rawInput?: string) => Promise<void>;
}

/**
 * 规则命中但分类为「其他」→ 配置了 AI 则逐条重分类（仅改分类，金额/描述/日期用规则引擎结果）。
 * 未配置 AI → 直接返回保持「其他」；AI 调用失败 → 保持「其他」并置 failed 标记（轻提示后照常入账）。
 */
async function reclassifyOthers(items: ParsedExpense[], fallbackInput: string): Promise<{ items: ParsedExpense[]; failed: boolean; error?: string }> {
  if (!items.some(i => i.category === '其他')) return { items, failed: false };
  let cfg: AIConfig;
  try { cfg = await loadAIConfig(); } catch { return { items, failed: false }; }
  if (!cfg.apiUrl || !cfg.apiUrl.trim()) return { items, failed: false }; // 未配置 AI → 按「其他」直接入账
  const out: ParsedExpense[] = [];
  let failed = false;
  let error = '';
  for (const item of items) {
    if (item.category !== '其他') { out.push(item); continue; }
    try {
      const ai = await parseWithAI(item.rawInput || fallbackInput, cfg);
      out.push(ai.category && ai.category !== '其他' ? { ...item, category: ai.category } : item);
    } catch (e: any) {
      failed = true; // AI 配置了但调用失败 → 保持「其他」，轻提示后照常入账
      error = e?.message || '未知错误';
      out.push(item);
    }
  }
  return { items: out, failed, error };
}

export default function InputBar({ onAddExpense }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [previewItems, setPreviewItems] = useState<ParsedExpense[] | null>(null);
  const inputRef = useRef<TextInput>(null);
  const wrapRef = useRef<View>(null);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => {
        const kb = e.endCoordinates.height;
        // edge-to-edge（SDK 53+ 默认，Expo Go 与 APK 均是）下 adjustResize 不缩窗，
        // 键盘直接覆盖在窗口之上 → 输入条必须自行上移。
        // 仅当窗口真的因键盘收缩（非 edge-to-edge 构建的原生 adjustResize）时才免补偿。
        const winH = Dimensions.get('window').height;
        const screenH = Dimensions.get('screen').height;
        if (screenH - winH >= kb * 0.5) { setKeyboardPad(0); return; }
        // 补偿量 = 键盘高 − 输入条下沿到窗口底的距离（= tab 栏高 + 底部安全区），
        // 使输入条恰好落在键盘上沿（全量补偿会多出 tab 栏高度的空白）。
        wrapRef.current?.measureInWindow((_x, y, _w, h) => {
          const distToBottom = winH - (y + h);
          setKeyboardPad(Math.max(0, kb - distToBottom));
        });
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardPad(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  /** 把解析结果逐条写入账本（按分类名找 category_id，找不到降级「其他」/首分类） */
  const writeItems = async (items: ParsedExpense[], fallbackRawInput: string) => {
    const categories = await getCategories();
    for (const item of items) {
      let category = categories.find(c => c.name === item.category);
      if (!category) category = categories.find(c => c.name === '其他') || categories[0];
      await onAddExpense(item.amount, category!.id, item.date, item.description, item.rawInput || fallbackRawInput);
    }
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const customRules = await getCustomRules();
      let parsed = parseWithRules(trimmed, customRules);
      if (parsed.length === 0) {
        try { parsed = [await parseWithAI(trimmed)]; }
        catch (e: any) { Alert.alert('无法识别', `AI 解析失败（${e?.message || '未知错误'}）\n请手动输入金额和分类，例如：\n"午饭花了35元"`, [{ text: '好的' }]); setLoading(false); return; }
      } else {
        const { items, failed, error } = await reclassifyOthers(parsed, trimmed);
        parsed = items;
        if (failed) Alert.alert('提示', `AI 分类失败，已按「其他」记录${error ? `（${error}）` : ''}`, [{ text: '好的' }]); // 轻提示，不中断记账
      }
      setText('');
      Keyboard.dismiss();
      // 多项 → 预览确认；单项 → 直接入账（保持原有体验）
      if (parsed.length > 1) {
        setPreviewItems(parsed);
      } else {
        await writeItems(parsed, trimmed);
      }
    } catch (e: any) { Alert.alert('记账失败', e.message || '请稍后重试'); }
    finally { setLoading(false); }
  };

  const handleConfirmPreview = async () => {
    if (!previewItems) return;
    const items = previewItems;
    setPreviewItems(null);
    try {
      await writeItems(items, text);
    } catch (e: any) { Alert.alert('记账失败', e.message || '请稍后重试'); }
  };

  return (
    <View ref={wrapRef} style={[s.wrap, { paddingBottom: keyboardPad }]}>
      <View style={s.bar}>
        <View style={s.inputWrap}>
          <TextInput ref={inputRef} style={s.input} placeholder="输入消费，如：午饭花了35元"
            placeholderTextColor={c.hint} value={text} onChangeText={setText}
            onSubmitEditing={handleSubmit} returnKeyType="send" editable={!loading} />
        </View>
        {loading ? <ActivityIndicator size="small" color={c.primary} style={{ marginLeft: spacing.md }} /> :
          <TouchableOpacity onPress={handleSubmit} disabled={!text.trim()}
            style={[s.sendBtn, { backgroundColor: text.trim() ? c.primary : c.disabled }]}>
            <Send size={18} color="white" />
          </TouchableOpacity>}
      </View>
      <ParsePreviewModal visible={previewItems !== null} items={previewItems || []}
        onConfirm={handleConfirmPreview} onCancel={() => setPreviewItems(null)} />
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  wrap: { backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.subtle },
  bar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center' },
  inputWrap: { flex: 1, backgroundColor: c.inputBg, borderRadius: 24, paddingHorizontal: spacing.lg, paddingVertical: Platform.OS === 'ios' ? 10 : 8, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontSize: fontSize.base, color: c.text },
  sendBtn: { marginLeft: spacing.md, width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
