import { useState, useEffect } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Save, Wifi, Download, Upload, Database } from 'lucide-react-native';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { testConnection } from '../../src/services/ai';
import CategoryManager from '../../src/components/CategoryManager';
import BudgetManager from '../../src/components/BudgetManager';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getExpenses, getCategories, addExpense, exportAllData, importAllData } from '../../src/services/db';
import { getCurrentMonth } from '../../src/utils/format';

export default function Settings() {
  const { aiConfig, loaded, saveAIConfig } = useSettingsStore();
  const [apiUrl, setApiUrl] = useState(aiConfig.apiUrl);
  const [apiKey, setApiKey] = useState(aiConfig.apiKey);
  const [model, setModel] = useState(aiConfig.model);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loaded) { setApiUrl(aiConfig.apiUrl); setApiKey(aiConfig.apiKey); setModel(aiConfig.model); }
  }, [loaded]);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const ok = await testConnection({ apiUrl, apiKey, model });
      Alert.alert(ok ? '✅ 连接成功' : '❌ 连接失败', ok ? 'AI 服务连接正常' : '无法连接到 AI 服务，请检查配置');
    } catch (e: any) { Alert.alert('❌ 连接失败', e.message); }
    finally { setTesting(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try { await saveAIConfig({ apiUrl, apiKey, model }); Alert.alert('保存成功', 'AI 配置已保存'); }
    catch (e: any) { Alert.alert('保存失败', e.message); }
    finally { setSaving(false); }
  };

  const handleExportCSV = async () => {
    try {
      const { data: expenses } = await getExpenses({ pageSize: 10000 });
      if (expenses.length === 0) { Alert.alert('无数据', '没有可导出的记录'); return; }
      let csv = '日期,分类,金额,描述,原始输入\n';
      for (const e of expenses) csv += `${e.expense_date},${e.category_name},${e.amount},${e.description || ''},${e.raw_input || ''}\n`;
      const file = new File(Paths.document, `smartledger_export_${getCurrentMonth()}.csv`);
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
    } catch (e: any) { Alert.alert('导出失败', e.message); }
  };

  const handleImportCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = new File(result.assets[0].uri);
      const content = await file.text();
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 2) { Alert.alert('格式错误', 'CSV 文件中没有数据行'); return; }
      let imported = 0;
      const categories = await getCategories();
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length >= 3) {
          const date = cols[0].trim(), categoryName = cols[1].trim(), amount = parseFloat(cols[2].trim());
          if (isNaN(amount)) continue;
          const category = categories.find(c => c.name === categoryName);
          if (category) { await addExpense(amount, category.id, date, cols[3]?.trim() || '', `导入: ${cols[3]?.trim() || ''}`); imported++; }
        }
      }
      Alert.alert('导入完成', `成功导入 ${imported} 条记录`);
    } catch (e: any) { Alert.alert('导入失败', e.message); }
  };

  const handleBackupJSON = async () => {
    try {
      const data = await exportAllData();
      const file = new File(Paths.document, `smartledger_backup_${getCurrentMonth()}.json`);
      file.write(JSON.stringify(data, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
    } catch (e: any) { Alert.alert('备份失败', e.message); }
  };

  const handleRestoreJSON = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = new File(result.assets[0].uri);
      const data = JSON.parse(await file.text());
      if (!data.version || !data.expenses) { Alert.alert('格式错误', '不是有效的 SmartLedger 备份文件'); return; }
      Alert.alert('恢复确认', `将导入 ${data.expenses.length} 条记录、${data.categories.length} 个分类、${data.budgets.length} 条预算`, [
        { text: '取消', style: 'cancel' },
        { text: '恢复', onPress: async () => {
          const { imported, skipped } = await importAllData(data);
          Alert.alert('恢复完成', `成功导入 ${imported} 条，跳过 ${skipped} 条重复`);
        }},
      ]);
    } catch (e: any) { Alert.alert('恢复失败', e.message); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <KeyboardAvoidingView style={st.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={st.flex1}>
          {/* AI 配置 */}
          <View style={st.card}>
            <Text style={st.cardTitle}>🤖 AI 配置</Text>
            <Text style={st.label}>API 地址</Text>
            <TextInput style={st.input} value={apiUrl} onChangeText={setApiUrl} placeholder="http://localhost:11434/v1" placeholderTextColor="#94a3b8" autoCapitalize="none" autoCorrect={false} />
            <Text style={st.label}>API Key（可选）</Text>
            <TextInput style={st.input} value={apiKey} onChangeText={setApiKey} placeholder="ollama" placeholderTextColor="#94a3b8" secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Text style={st.label}>模型</Text>
            <TextInput style={st.input} value={model} onChangeText={setModel} placeholder="qwen2.5:7b" placeholderTextColor="#94a3b8" autoCapitalize="none" autoCorrect={false} />
            <View style={st.btnRow}>
              <TouchableOpacity style={st.btnOutline} onPress={handleTestConnection} disabled={testing}>
                {testing ? <ActivityIndicator size="small" color="#6366f1" /> : <><Wifi size={16} color="#6366f1" /><Text style={st.btnOutlineText}>测试连接</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={st.btnPrimary} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="white" /> : <><Save size={16} color="white" /><Text style={st.btnPrimaryText}>保存配置</Text></>}
              </TouchableOpacity>
            </View>
          </View>

          {/* 预算管理 */}
          <BudgetManager />

          {/* 分类管理 */}
          <CategoryManager />

          {/* 数据管理 */}
          <View style={st.card}>
            <Text style={st.cardTitle}>📂 数据管理</Text>
            <TouchableOpacity style={st.menuItem} onPress={handleExportCSV}>
              <Upload size={18} color="#6366f1" /><Text style={st.menuText}>导出 CSV</Text><Text style={st.menuHint}>分享文件</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.menuItem} onPress={handleImportCSV}>
              <Download size={18} color="#6366f1" /><Text style={st.menuText}>导入 CSV</Text><Text style={st.menuHint}>选择文件</Text>
            </TouchableOpacity>
            <View style={st.divider} />
            <TouchableOpacity style={st.menuItem} onPress={handleBackupJSON}>
              <Database size={18} color="#22c55e" /><Text style={st.menuText}>完整备份 (JSON)</Text><Text style={st.menuHint}>含分类+预算</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.menuItem} onPress={handleRestoreJSON}>
              <Download size={18} color="#22c55e" /><Text style={st.menuText}>恢复备份 (JSON)</Text><Text style={st.menuHint}>选择文件</Text>
            </TouchableOpacity>
          </View>

          {/* 关于 */}
          <View style={st.card}>
            <Text style={st.cardTitle}>📱 关于</Text>
            <Text style={{ fontSize: 14, color: '#1e293b' }}>SmartLedger 智记账</Text>
            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>版本 1.0.1</Text>
            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>智能记账，轻松管理每一笔消费。支持自然语言输入、AI 自动分类、消费分析与可视化。</Text>
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  flex1: { flex: 1 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 16 },
  label: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  input: { backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#6366f1' },
  btnOutlineText: { color: '#6366f1', fontSize: 14, fontWeight: '500', marginLeft: 6 },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: '#6366f1' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '500', marginLeft: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  menuText: { fontSize: 14, color: '#1e293b', marginLeft: 12, flex: 1 },
  menuHint: { fontSize: 12, color: '#64748b' },
  divider: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9', marginVertical: 4 },
});