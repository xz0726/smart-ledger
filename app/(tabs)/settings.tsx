import { useMemo, useState, useEffect } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Save, Wifi, Download, Upload, Database, MessageCircle, MessageSquareText, Coffee, Palette, Bot, Folder, Smartphone } from 'lucide-react-native';
import { router } from 'expo-router';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { cardShadow, useThemeColors, type ThemeColors, type ThemePreference } from '../../src/theme';
import { testConnection } from '../../src/services/ai';
import CategoryManager from '../../src/components/CategoryManager';
import NotifyCaptureCard from '../../src/components/NotifyCaptureCard';
import CardTitle from '../../src/components/CardTitle';
import BudgetManager from '../../src/components/BudgetManager';
import FixedItemsManager from '../../src/components/FixedItemsManager';
import QuickItemsManager from '../../src/components/QuickItemsManager';
import RuleManager from '../../src/components/RuleManager';
import { getExpenses, getCategories, addExpense, exportAllData, importAllData } from '../../src/services/db';
import { shareTextFile, readPickedFile } from '../../src/services/nativeActions';
import { getCurrentMonth } from '../../src/utils/format';
import { APP_VERSION } from '../../src/constants/app';
import { spacing, radius, fontSize } from '../../src/theme/spacing';

const THEME_OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: 'system', label: '跟随系统' },
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
];

export default function Settings() {
  const { aiConfig, loaded, saveAIConfig, theme, setThemePreference } = useSettingsStore();
  const [apiUrl, setApiUrl] = useState(aiConfig.apiUrl);
  const [apiKey, setApiKey] = useState(aiConfig.apiKey);
  const [model, setModel] = useState(aiConfig.model);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loaded) { setApiUrl(aiConfig.apiUrl); setApiKey(aiConfig.apiKey); setModel(aiConfig.model); }
  }, [loaded]);

  const c = useThemeColors();
  const st = useMemo(() => createStyles(c), [c]);

  const handleTestConnection = async () => {
    if (!apiUrl.trim()) { Alert.alert('提示', '请先填写 API 地址'); return; }
    setTesting(true);
    try {
      const ok = await testConnection({ apiUrl, apiKey, model });
      Alert.alert(ok ? '✅ 连接成功' : '❌ 连接失败', ok ? 'AI 服务连接正常' : '无法连接到 AI 服务，请检查配置');
    } catch (e: any) { Alert.alert('❌ 连接失败', e.message); }
    finally { setTesting(false); }
  };

  const handleSave = async () => {
    Keyboard.dismiss();
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
      await shareTextFile(`smartledger_export_${getCurrentMonth()}.csv`, csv, 'text/csv');
    } catch (e: any) { Alert.alert('导出失败', e.message); }
  };

  const handleImportCSV = async () => {
    try {
      const content = await readPickedFile('text/csv');
      if (content === null) return;
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
      await shareTextFile(`smartledger_backup_${getCurrentMonth()}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (e: any) { Alert.alert('备份失败', e.message); }
  };

  const handleRestoreJSON = async () => {
    try {
      const content = await readPickedFile('application/json');
      if (content === null) return;
      const data = JSON.parse(content);
      if (!data.version || !data.expenses) { Alert.alert('格式错误', '不是有效的智记账备份文件'); return; }
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
      {/* 自绘页头：与仪表盘/账单的 MonthSwitcher 头部同规格（居中 18/600），避免原生 header + SafeArea 双重 inset */}
      <View style={st.pageHeader}>
        <Text style={st.pageTitle}>设置</Text>
      </View>
      <KeyboardAvoidingView style={st.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={st.flex1} keyboardShouldPersistTaps="handled">
          {/* 主题：跟随系统 / 浅色 / 深色 */}
          <View style={st.card}>
            <CardTitle icon={Palette} text="主题" />
            <View style={st.seg}>
              {THEME_OPTIONS.map(o => (
                <TouchableOpacity key={o.key} onPress={() => setThemePreference(o.key)}
                  style={[st.segItem, theme === o.key && st.segItemActive]}>
                  <Text style={[st.segText, theme === o.key && st.segTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* AI 配置 */}
          <View style={st.card}>
            <CardTitle icon={Bot} text="AI 配置" />
            <Text style={{ fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.md }}>支持任意 OpenAI 兼容 API（DeepSeek / OpenAI / 通义千问）。留空则不启用 AI 解析，仅使用本地规则引擎。</Text>
            <Text style={st.label}>API 地址</Text>
            <TextInput style={st.input} value={apiUrl} onChangeText={setApiUrl} placeholder="https://api.deepseek.com/v1" placeholderTextColor={c.hint} autoCapitalize="none" autoCorrect={false} />
            <Text style={st.label}>API Key（可选）</Text>
            <TextInput style={st.input} value={apiKey} onChangeText={setApiKey} placeholder="sk-..." placeholderTextColor={c.hint} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Text style={st.label}>模型</Text>
            <TextInput style={st.input} value={model} onChangeText={setModel} placeholder="deepseek-chat" placeholderTextColor={c.hint} autoCapitalize="none" autoCorrect={false} />
            <View style={st.btnRow}>
              <TouchableOpacity style={st.btnOutline} onPress={handleTestConnection} disabled={testing}>
                {testing ? <ActivityIndicator size="small" color={c.primary} /> : <><Wifi size={16} color={c.primary} /><Text style={st.btnOutlineText}>测试连接</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={st.btnPrimary} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="white" /> : <><Save size={16} color="white" /><Text style={st.btnPrimaryText}>保存配置</Text></>}
              </TouchableOpacity>
            </View>
          </View>

          {/* 自动记账（通知捕获，仅 Android） */}
          <NotifyCaptureCard />

          {/* 预算管理 */}
          <BudgetManager />

          {/* 固定收支 */}
          <FixedItemsManager />

          {/* 快捷记账 */}
          <QuickItemsManager />

          {/* 分类管理 */}
          <CategoryManager />

          {/* 自定义规则 */}
          <RuleManager />

          {/* 数据管理 */}
          <View style={st.card}>
            <CardTitle icon={Folder} text="数据管理" />
            <TouchableOpacity style={st.menuItem} onPress={handleExportCSV}>
              <Upload size={18} color={c.primary} /><Text style={st.menuText}>导出 CSV</Text><Text style={st.menuHint}>分享文件</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.menuItem} onPress={handleImportCSV}>
              <Download size={18} color={c.primary} /><Text style={st.menuText}>导入 CSV</Text><Text style={st.menuHint}>选择文件</Text>
            </TouchableOpacity>
            <View style={st.divider} />
            <TouchableOpacity style={st.menuItem} onPress={handleBackupJSON}>
              <Database size={18} color={c.success} /><Text style={st.menuText}>完整备份 (JSON)</Text><Text style={st.menuHint}>含分类+预算</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.menuItem} onPress={handleRestoreJSON}>
              <Download size={18} color={c.success} /><Text style={st.menuText}>恢复备份 (JSON)</Text><Text style={st.menuHint}>选择文件</Text>
            </TouchableOpacity>
          </View>

          {/* 关于 */}
          <View style={st.card}>
            <CardTitle icon={Smartphone} text="关于" />
            <Text style={{ fontSize: fontSize.base, color: c.text }}>智记账</Text>
            <Text style={{ fontSize: fontSize.sm, color: c.textSecondary, marginTop: spacing.xs }}>版本 {APP_VERSION || '未知'}</Text>
            <Text style={{ fontSize: fontSize.sm, color: c.textSecondary, marginTop: spacing.sm }}>智能记账，轻松管理每一笔消费。
{'\n'}· 自然语言记账：「午饭花了35元」自动入账
{'\n'}· 规则引擎 + AI 分类，中文金额（两万/三块五）也认识
{'\n'}· 一次输入多项，逐条核对再入账
{'\n'}· 固定收支自动补账、快捷记账一键入账
{'\n'}· 自定义分类 / 关键词规则自由管理
{'\n'}· 趋势图 · 分类占比 · 预算预警 · 深色模式 · 备份恢复</Text>
            <View style={st.divider} />
            <TouchableOpacity style={st.menuItem} onPress={() => router.push('/support/contact')}>
              <MessageCircle size={18} color={c.primary} /><Text style={st.menuText}>骚扰作者</Text><Text style={st.menuHint}>QQ 交流群</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.menuItem} onPress={() => router.push('/support/feedback')}>
              <MessageSquareText size={18} color={c.info} /><Text style={st.menuText}>意见反馈</Text><Text style={st.menuHint}>邮件反馈</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.menuItem} onPress={() => router.push('/support/donate')}>
              <Coffee size={18} color="#ec4899" /><Text style={st.menuText}>投喂作者</Text><Text style={st.menuHint}>支持一下</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  flex1: { flex: 1 },
  // 页头规格照抄 MonthSwitcher 的 s.header：居中标题、页面底色
  pageHeader: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: spacing.md },
  pageTitle: { fontSize: 18, fontWeight: '600', color: c.text },
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.md, padding: spacing.lg, ...cardShadow },
  seg: { flexDirection: 'row', backgroundColor: c.subtle, borderRadius: radius.sm, padding: 2 },
  segItem: { flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  segItemActive: { backgroundColor: c.card },
  segText: { fontSize: fontSize.md, color: c.textSecondary },
  segTextActive: { color: c.primary, fontWeight: '600' },
  label: { fontSize: fontSize.sm, color: c.textSecondary, marginBottom: spacing.xs },
  input: { backgroundColor: c.inputBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSize.base, color: c.text, borderWidth: 1, borderColor: c.border, marginBottom: spacing.md },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  btnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: c.primary },
  btnOutlineText: { color: c.primary, fontSize: fontSize.base, fontWeight: '500', marginLeft: 6 },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: radius.sm, backgroundColor: c.primary },
  btnPrimaryText: { color: '#fff', fontSize: fontSize.base, fontWeight: '500', marginLeft: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.subtle },
  menuText: { fontSize: fontSize.base, color: c.text, marginLeft: spacing.md, flex: 1 },
  menuHint: { fontSize: fontSize.sm, color: c.textSecondary },
  divider: { borderBottomWidth: 1, borderBottomColor: c.subtle, marginVertical: spacing.xs },
});
