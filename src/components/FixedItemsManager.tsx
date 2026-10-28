import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, StyleSheet } from 'react-native';
import { Plus, Trash2, RefreshCw, Repeat } from 'lucide-react-native';
import CardTitle from './CardTitle';
import { useFocusEffect } from 'expo-router';
import { cardShadow, useThemeColors, type ThemeColors } from '../theme';
import type { Category, FixedItemWithCategory } from '../types';
import { getCategories, getFixedItemsWithCategory, addFixedItem, deleteFixedItem, syncFixedItems } from '../services/db';
import { useCategoryStore } from '../stores/categoryStore';

const FREQUENCIES = [
  { key: 'daily', label: '每天' },
  { key: 'workday', label: '工作日' },
  { key: 'weekly', label: '每周' },
  { key: 'monthly', label: '每月' },
] as const;

const WEEKDAYS = [
  { key: 0, label: '日' }, { key: 1, label: '一' }, { key: 2, label: '二' }, { key: 3, label: '三' },
  { key: 4, label: '四' }, { key: 5, label: '五' }, { key: 6, label: '六' },
];

function frequencyLabel(f: FixedItemWithCategory['frequency'], weekday: number | null, dayOfMonth: number | null): string {
  switch (f) {
    case 'daily': return '每天';
    case 'workday': return '工作日';
    case 'weekly': return `每周${weekday !== null ? WEEKDAYS.find(w => w.key === weekday)?.label || weekday : ''}`;
    case 'monthly': return `每月${dayOfMonth ?? ''}日`;
    default: return '';
  }
}

/**
 * 固定收支管理：工作日通勤、每月话费等周期项。添加后调用 syncFixedItems 补生成记录。
 */
export default function FixedItemsManager() {
  const [items, setItems] = useState<FixedItemWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [selectedCategory, setSelectedCategory] = useState<number>(0);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<FixedItemWithCategory['frequency']>('workday');
  const [weekday, setWeekday] = useState<number | null>(null);
  const [dayOfMonth, setDayOfMonth] = useState('');
  const [syncing, setSyncing] = useState(false);
  const revision = useCategoryStore(s => s.revision);
  const c = useThemeColors();
  const s = useMemo(() => createStyles(c), [c]);

  const load = useCallback(async () => {
    try {
      const [list, catList] = await Promise.all([getFixedItemsWithCategory(), getCategories()]);
      setItems(list);
      // 同名去重（旧版本遗留重复行，避免选择器里出现两个「餐饮」）
      const seen = new Set<string>();
      setCategories(catList.filter(c => seen.has(c.name) ? false : (seen.add(c.name), true)));
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load, revision]));

  async function handleSync() {
    setSyncing(true);
    try {
      const n = await syncFixedItems();
      await load();
      Alert.alert('同步完成', n > 0 ? `已补生成 ${n} 笔固定收支记录` : '没有需要生成的新记录');
    } catch (e: any) { Alert.alert('同步失败', e.message); }
    finally { setSyncing(false); }
  }

  async function handleAdd() {
    if (!name.trim()) { Alert.alert('请输入名称'); return; }
    if (selectedCategory === 0) { Alert.alert('请选择分类'); return; }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { Alert.alert('请输入有效金额'); return; }
    if (frequency === 'weekly' && weekday === null) { Alert.alert('请选择星期几'); return; }
    let dom: number | null = null;
    if (frequency === 'monthly') {
      dom = parseInt(dayOfMonth);
      if (isNaN(dom) || dom < 1 || dom > 31) { Alert.alert('请输入 1-31 的日期'); return; }
    }
    try {
      await addFixedItem({ name: name.trim(), type, category_id: selectedCategory, amount: amountNum, frequency, weekday: frequency === 'weekly' ? weekday : null, day_of_month: frequency === 'monthly' ? dom : null });
      await syncFixedItems();
      setName(''); setAmount(''); setSelectedCategory(0); setFrequency('workday'); setWeekday(null); setDayOfMonth(''); setShowAdd(false);
      await load();
    } catch (e: any) { Alert.alert('添加失败', e.message); }
  }

  async function handleDelete(item: FixedItemWithCategory) {
    Alert.alert('删除确认', `确定删除固定收支「${item.name}」吗？已生成的记录不会被删除。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { try { await deleteFixedItem(item.id); await load(); } catch (e: any) { Alert.alert('删除失败', e.message); } } },
    ]);
  }

  const catOptions = categories.filter(c => c.type === type);

  return (
    <View style={s.card}>
      <View style={s.header}>
        <CardTitle icon={Repeat} text="固定收支" />
        <TouchableOpacity onPress={() => setShowAdd(!showAdd)}>
          <Plus size={20} color={showAdd ? '#ef4444' : '#6366f1'} />
        </TouchableOpacity>
      </View>
      <Text style={s.hint}>自动生成到期记录：如工作日通勤 7 元/天、每月话费 20 元</Text>

      {showAdd && (
        <View style={s.addPanel}>
          <Text style={s.label}>名称</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="如：通勤 / 话费" placeholderTextColor={c.hint} />
          <Text style={s.label}>类型</Text>
          <View style={s.typeRow}>
            <TouchableOpacity onPress={() => { setType('expense'); setSelectedCategory(0); }}
              style={[s.typeBtn, type === 'expense' && { backgroundColor: '#6366f1' }]}>
              <Text style={[s.typeText, type === 'expense' && { color: '#fff' }]}>支出</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setType('income'); setSelectedCategory(0); }}
              style={[s.typeBtn, type === 'income' && { backgroundColor: '#22c55e' }]}>
              <Text style={[s.typeText, type === 'income' && { color: '#fff' }]}>收入</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.label}>分类</Text>
          <View style={s.catRow}>
            {catOptions.length === 0 ? <Text style={{ fontSize: 12, color: c.hint }}>该类型暂无分类</Text> :
              catOptions.map(cat => (
                <TouchableOpacity key={cat.id} onPress={() => setSelectedCategory(cat.id)}
                  style={[s.catItem, selectedCategory === cat.id && s.catItemActive]}>
                  <Text style={{ fontSize: 12, color: c.text }}>{cat.icon} {cat.name}</Text>
                </TouchableOpacity>
              ))}
          </View>
          <Text style={s.label}>金额</Text>
          <View style={s.amountRow}>
            <Text style={s.yuan}>¥</Text>
            <TextInput style={s.amountInput} value={amount} onChangeText={setAmount}
              keyboardType="decimal-pad" placeholder="如：7 / 20" placeholderTextColor={c.hint} />
          </View>
          <Text style={s.label}>频率</Text>
          <View style={s.freqRow}>
            {FREQUENCIES.map(f => (
              <TouchableOpacity key={f.key} onPress={() => setFrequency(f.key)}
                style={[s.freqItem, frequency === f.key && s.freqActive]}>
                <Text style={[s.freqText, frequency === f.key && s.freqTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {frequency === 'weekly' && (
            <>
              <Text style={s.label}>星期几</Text>
              <View style={s.catRow}>
                {WEEKDAYS.map(w => (
                  <TouchableOpacity key={w.key} onPress={() => setWeekday(w.key)}
                    style={[s.catItem, weekday === w.key && s.catItemActive]}>
                    <Text style={{ fontSize: 12, color: c.text }}>周{w.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          {frequency === 'monthly' && (
            <>
              <Text style={s.label}>每月几日</Text>
              <TextInput style={s.input} value={dayOfMonth} onChangeText={setDayOfMonth}
                keyboardType="number-pad" placeholder="如：1 / 20" placeholderTextColor={c.hint} />
            </>
          )}
          <TouchableOpacity onPress={handleAdd} style={s.addBtn}>
            <Text style={s.addBtnText}>添加固定收支</Text>
          </TouchableOpacity>
        </View>
      )}

      {items.length === 0 ? (
        <Text style={s.empty}>暂无固定收支，点击 + 添加</Text>
      ) : items.map(item => (
        <View key={item.id} style={s.item}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={[s.iconWrap, { backgroundColor: (item.category_color || '#64748b') + '20' }]}>
              <Text style={{ fontSize: 15 }}>{item.category_icon || '📦'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: c.text }}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: c.textSecondary }}>
                {frequencyLabel(item.frequency, item.weekday, item.day_of_month)} · {item.category_name || '未知分类'}
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: item.type === 'income' ? '#22c55e' : '#6366f1', marginRight: 8 }}>
              ¥{item.amount.toFixed(2)}
            </Text>
            <TouchableOpacity onPress={() => handleDelete(item)}>
              <Trash2 size={14} color={c.hint} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {items.length > 0 && (
        <TouchableOpacity style={s.syncBtn} onPress={handleSync} disabled={syncing}>
          <RefreshCw size={14} color="#6366f1" />
          <Text style={s.syncText}>{syncing ? '同步中…' : '立即同步补账'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16, ...cardShadow },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '600', color: c.text },
  hint: { fontSize: 12, color: c.textSecondary, marginBottom: 12 },
  addPanel: { backgroundColor: c.inputBg, borderRadius: 8, padding: 12, marginBottom: 12 },
  label: { fontSize: 12, color: c.textSecondary, marginBottom: 4 },
  input: { backgroundColor: c.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: c.text, borderWidth: 1, borderColor: c.border, marginBottom: 12 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: c.border },
  typeText: { fontSize: 12, fontWeight: '500', color: c.textSecondary },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  catItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: c.border },
  catItemActive: { borderColor: '#6366f1', backgroundColor: c.primarySoftBg },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  yuan: { fontSize: 14, color: c.text, marginRight: 8 },
  amountInput: { flex: 1, backgroundColor: c.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: c.text, borderWidth: 1, borderColor: c.border },
  freqRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  freqItem: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: c.border },
  freqActive: { backgroundColor: '#6366f1' },
  freqText: { fontSize: 12, fontWeight: '500', color: c.textSecondary },
  freqTextActive: { color: '#fff' },
  addBtn: { backgroundColor: '#6366f1', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  empty: { color: c.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.subtle },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, marginTop: 8, borderRadius: 8, backgroundColor: c.inputBg },
  syncText: { color: '#6366f1', fontSize: 13, fontWeight: '500', marginLeft: 6 },
});
