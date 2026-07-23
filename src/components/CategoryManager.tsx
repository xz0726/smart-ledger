import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ScrollView, StyleSheet } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import type { Category } from '../types';
import { getCategories, addCategory, deleteCategory } from '../services/db';

const EMOJI_OPTIONS = ['🍔','🚇','🛒','🎮','🏠','💊','📚','💬','💰','✏️','🎁','🐱','🎵','✈️','💻','📱','🚗','⚽','🧘','🎂'];
const COLOR_OPTIONS = ['#f97316','#3b82f6','#ec4899','#8b5cf6','#14b8a6','#ef4444','#06b6d4','#6366f1','#22c55e','#64748b','#f59e0b','#84cc16','#a855f7','#e11d48','#0891b2'];

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📦');
  const [newColor, setNewColor] = useState('#6366f1');
  const [newType, setNewType] = useState<'expense' | 'income'>('expense');

  const loadCategories = useCallback(async () => {
    try {
      const cats = await getCategories();
      const seen = new Set<string>();
      setCategories(cats.filter(c => seen.has(c.name) ? false : (seen.add(c.name), true)));
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { loadCategories(); }, [loadCategories]));

  async function handleAdd() {
    const name = newName.trim();
    if (!name) { Alert.alert('请输入分类名称'); return; }
    if (categories.some(c => c.name === name)) { Alert.alert('分类已存在'); return; }
    try { await addCategory(name, newIcon, newColor, newType); setNewName(''); setShowAdd(false); await loadCategories(); }
    catch (e: any) { Alert.alert('添加失败', e.message); }
  }

  async function handleDelete(cat: Category) {
    if (cat.is_default === 1) { Alert.alert('无法删除', '默认分类不可删除'); return; }
    Alert.alert('删除确认', `确定删除分类"${cat.name}"吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { try { await deleteCategory(cat.id); await loadCategories(); } catch (e: any) { Alert.alert('删除失败', e.message); } } },
    ]);
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>🏷️ 分类管理</Text>
        <TouchableOpacity onPress={() => setShowAdd(!showAdd)}>
          <Plus size={20} color={showAdd ? '#ef4444' : '#6366f1'} />
        </TouchableOpacity>
      </View>

      {showAdd && (
        <View style={s.addPanel}>
          <TextInput style={s.nameInput} value={newName} onChangeText={setNewName} placeholder="分类名称" placeholderTextColor="#94a3b8" />
          <View style={s.typeRow}>
            <TouchableOpacity onPress={() => setNewType('expense')}
              style={[s.typeBtn, newType === 'expense' && { backgroundColor: '#6366f1' }]}>
              <Text style={[s.typeText, newType === 'expense' && { color: '#fff' }]}>支出</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setNewType('income')}
              style={[s.typeBtn, newType === 'income' && { backgroundColor: '#22c55e' }]}>
              <Text style={[s.typeText, newType === 'income' && { color: '#fff' }]}>收入</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.label}>图标</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {EMOJI_OPTIONS.map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => setNewIcon(emoji)}
                  style={[s.emojiItem, newIcon === emoji && s.emojiActive]}>
                  <Text style={{ fontSize: 18 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Text style={s.label}>颜色</Text>
          <View style={s.colorRow}>
            {COLOR_OPTIONS.map(color => (
              <TouchableOpacity key={color} onPress={() => setNewColor(color)}
                style={[s.colorDot, { backgroundColor: color }, newColor === color && s.colorActive]} />
            ))}
          </View>
          <TouchableOpacity onPress={handleAdd} style={s.addBtn}>
            <Text style={s.addBtnText}>添加分类</Text>
          </TouchableOpacity>
        </View>
      )}

      {categories.map(cat => (
        <View key={cat.id} style={s.catItem}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[s.catIcon, { backgroundColor: cat.color + '20' }]}>
              <Text>{cat.icon}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 14, color: '#1e293b' }}>{cat.name}</Text>
              <Text style={{ fontSize: 12, color: '#64748b' }}>
                {cat.type === 'income' ? '收入' : '支出'}{cat.is_default === 1 ? ' · 默认' : ' · 自定义'}
              </Text>
            </View>
          </View>
          {cat.is_default === 0 && (
            <TouchableOpacity onPress={() => handleDelete(cat)}>
              <Trash2 size={16} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16, elevation: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  addPanel: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 12 },
  nameInput: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1e293b', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  typeBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: '#e2e8f0' },
  typeText: { fontSize: 12, fontWeight: '500', color: '#64748b' },
  label: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  emojiItem: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#fff' },
  emojiActive: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#6366f1' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorActive: { borderWidth: 2, borderColor: '#1e293b', transform: [{ scale: 1.1 }] },
  addBtn: { backgroundColor: '#6366f1', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  catItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  catIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
});