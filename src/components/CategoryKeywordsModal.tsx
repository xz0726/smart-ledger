import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Keyboard, Alert, StyleSheet } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import ModalHeader from './ModalHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, type ThemeColors } from '../theme';
import type { Category, CustomRule } from '../types';
import { getCustomRules, addCustomRule, deleteCustomRule } from '../services/db';
import { useCategoryStore } from '../stores/categoryStore';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Props {
  visible: boolean;
  category: Category | null;
  onClose: () => void;
}

/**
 * 分类关键词编辑弹窗：管理某分类的用户自定义关键词（内置默认词不可编辑）。
 * 增删后 bump revision → 设置页各分类选择器/自定义规则页联动刷新。
 */
export default function CategoryKeywordsModal({ visible, category, onClose }: Props) {
  const [allRules, setAllRules] = useState<CustomRule[]>([]);
  const [keyword, setKeyword] = useState('');
  const [saving, setSaving] = useState(false);
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(c), [c]);

  useEffect(() => {
    if (visible && category) {
      getCustomRules().then(setAllRules).catch(console.error);
      setKeyword('');
    }
  }, [visible, category?.id]);

  if (!category) return null;
  const cat = category; // 守卫后的非空副本：闭包内 TS 窄化可靠

  const rules = allRules.filter(r => r.category === cat.name);

  const refresh = async () => {
    const list = await getCustomRules();
    setAllRules(list);
    useCategoryStore.getState().bump();
  };

  async function handleAdd() {
    const kw = keyword.trim();
    if (!kw) { Alert.alert('请输入关键词'); return; }
    // keyword 全局 UNIQUE：同分类重复 → 提示；已属于其他分类 → 确认后移动
    const existing = allRules.find(r => r.keyword === kw);
    if (existing) {
      if (existing.category === cat.name) { Alert.alert('该关键词已存在'); return; }
      Alert.alert('关键词冲突', `「${kw}」已属于「${existing.category}」，是否移动到「${cat.name}」？`, [
        { text: '取消', style: 'cancel' },
        { text: '移动', style: 'destructive', onPress: async () => {
            try { await addCustomRule(kw, cat.name); setKeyword(''); await refresh(); }
            catch (e: any) { Alert.alert('添加失败', e.message); }
          } },
      ]);
      return;
    }
    setSaving(true);
    try {
      await addCustomRule(kw, cat.name);
      setKeyword('');
      await refresh();
    } catch (e: any) { Alert.alert('添加失败', e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(rule: CustomRule) {
    Alert.alert('删除确认', `确定删除关键词「${rule.keyword}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
          try { await deleteCustomRule(rule.id); await refresh(); }
          catch (e: any) { Alert.alert('删除失败', e.message); }
        } },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.overlay}>
          <TouchableOpacity style={s.backdrop} onPress={() => { Keyboard.dismiss(); onClose(); }} activeOpacity={1} />
          <View style={s.modal}>
            <ModalHeader title={`${category.icon} ${category.name} · 关键词`} onClose={onClose} />
            <Text style={s.hint}>内置关键词固定不可编辑，此处管理该分类的用户自定义关键词</Text>
            {/* 「添加」行必须在 keyboardShouldPersistTaps="handled" 的 ScrollView 内：
                键盘弹出时点击按钮，'never' 默认会把首次触点交给收键盘而吞掉按钮点击 */}
            <ScrollView style={[s.body, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => Keyboard.dismiss()}>
              <View style={s.addRow}>
                <TextInput style={s.input} value={keyword} onChangeText={setKeyword} placeholder="输入关键词，如：猫粮"
                  placeholderTextColor={c.hint} onSubmitEditing={handleAdd} returnKeyType="done" editable={!saving} />
                <TouchableOpacity onPressIn={() => { Keyboard.dismiss(); handleAdd(); }} disabled={saving} style={s.addBtn}>
                  <Text style={s.addBtnText}>{saving ? '添加中…' : '添加'}</Text>
                </TouchableOpacity>
              </View>
              {rules.length === 0 ? (
                <Text style={s.empty}>暂无自定义关键词</Text>
              ) : rules.map(rule => (
                <View key={rule.id} style={s.ruleItem}>
                  <Text style={s.keyword}>{rule.keyword}</Text>
                  <TouchableOpacity onPress={() => handleDelete(rule)} style={s.deleteBtn}>
                    <Trash2 size={16} color={c.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  flex1: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdrop: { flex: 1 },
  modal: { backgroundColor: c.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%' },
  hint: { fontSize: fontSize.sm, color: c.textSecondary, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  input: { flex: 1, backgroundColor: c.inputBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.base, color: c.text, borderWidth: 1, borderColor: c.border },
  addBtn: { backgroundColor: c.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.sm },
  addBtnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500' },
  body: { paddingHorizontal: spacing.lg },
  empty: { color: c.textSecondary, fontSize: fontSize.base, textAlign: 'center', paddingVertical: 20 },
  ruleItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.subtle },
  keyword: { flex: 1, fontSize: fontSize.base, fontWeight: '500', color: c.text },
  deleteBtn: { padding: spacing.xs },
});
