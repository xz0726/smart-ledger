import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, ActivityIndicator, Alert, StyleSheet, Keyboard, Animated, Platform } from 'react-native';
import { Send } from 'lucide-react-native';
import type { ParsedExpense } from '../types';
import { parseWithRules } from '../services/ruleEngine';
import { parseWithAI } from '../services/ai';
import { getCategories } from '../services/db';

interface Props {
  onAddExpense: (amount: number, categoryId: number, date: string, description?: string, rawInput?: string) => Promise<void>;
}

export default function InputBar({ onAddExpense }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      e => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      let parsed: ParsedExpense | null = parseWithRules(trimmed);
      if (!parsed) {
        try { parsed = await parseWithAI(trimmed); }
        catch { Alert.alert('无法识别', '请手动输入金额和分类，例如：\n"午饭花了35元"', [{ text: '好的' }]); setLoading(false); return; }
      }
      const categories = await getCategories();
      let category = categories.find(c => c.name === parsed!.category);
      if (!category) category = categories.find(c => c.name === '其他') || categories[0];
      await onAddExpense(parsed!.amount, category!.id, parsed!.date, parsed!.description, trimmed);
      setText('');
      Keyboard.dismiss();
    } catch (e: any) { Alert.alert('记账失败', e.message || '请稍后重试'); }
    finally { setLoading(false); }
  };

  return (
    <View style={[s.wrap, { paddingBottom: keyboardHeight }]}>
      <View style={s.bar}>
        <View style={s.inputWrap}>
          <TextInput ref={inputRef} style={s.input} placeholder="输入消费，如：午饭花了35元"
            placeholderTextColor="#94a3b8" value={text} onChangeText={setText}
            onSubmitEditing={handleSubmit} returnKeyType="send" editable={!loading} />
        </View>
        {loading ? <ActivityIndicator size="small" color="#6366f1" style={{ marginLeft: 12 }} /> :
          <TouchableOpacity onPress={handleSubmit} disabled={!text.trim()}
            style={[s.sendBtn, { backgroundColor: text.trim() ? '#6366f1' : '#cbd5e1' }]}>
            <Send size={18} color="white" />
          </TouchableOpacity>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  bar: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  inputWrap: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 24, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 8, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontSize: 14, color: '#1e293b' },
  sendBtn: { marginLeft: 12, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});