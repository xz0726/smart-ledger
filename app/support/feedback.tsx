import { useMemo, useState } from 'react';
import {
  ScrollView, View, Text, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Send, Bookmark, PenLine, Mail } from 'lucide-react-native';
import CardTitle from '../../src/components/CardTitle';
import { cardShadow, useThemeColors, type ThemeColors } from '../../src/theme';
import { SUPPORT } from '../../src/constants/support';
import { composeMail } from '../../src/services/nativeActions';
import { spacing, radius, fontSize } from '../../src/theme/spacing';

const FEEDBACK_TYPES = ['功能建议', '问题反馈', '数据问题', '其他','找作者聊天'] as const;
const MAX_CONTENT_LENGTH = 500;

export default function Feedback() {
  const [type, setType] = useState<string>(FEEDBACK_TYPES[0]);
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const c = useThemeColors();
  const st = useMemo(() => createStyles(c), [c]);

  const submitFeedback = async () => {
    const body = content.trim();
    if (!body) {
      Alert.alert('提示', '请填写反馈内容');
      return;
    }
    setSubmitting(true);
    try {
      const subject = `【智记账反馈】${type}`;
      const mailBody = [
        `反馈类型：${type}`,
        `联系方式：${contact.trim() || '（未填写）'}`,
        `App 版本：${Constants.expoConfig?.version ?? '未知'}`,
        '',
        body,
      ].join('\n');

      await composeMail({
        recipients: [SUPPORT.feedbackEmail],
        subject,
        body: mailBody,
      });
      // 返回值 {status: 'sent' | 'saved' | 'cancelled'}，无需额外处理
    } catch {
      // Android 无邮件 App / iOS 未配置邮件账户时会抛错
      Alert.alert('无法打开邮件客户端', `请复制作者邮箱到邮件 App 手动发送：${SUPPORT.feedbackEmail}`, [
        { text: '取消', style: 'cancel' },
        { text: '复制邮箱', onPress: () => Clipboard.setStringAsync(SUPPORT.feedbackEmail) },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  // 备选实现（零依赖）：mailto 拼 URL 调起系统邮件
  // const url = `mailto:${SUPPORT.feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;
  // await Linking.openURL(url);

  return (
    <KeyboardAvoidingView style={st.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.flex1} keyboardShouldPersistTaps="handled" contentContainerStyle={st.content}>
        {/* 反馈类型 */}
        <View style={st.card}>
          <CardTitle icon={Bookmark} text="反馈类型" />
          <View style={st.chipRow}>
            {FEEDBACK_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[st.chip, type === t && st.chipActive]}
                onPress={() => setType(t)}>
                <Text style={[st.chipText, type === t && st.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 反馈内容 */}
        <View style={st.card}>
          <CardTitle icon={PenLine} text="反馈内容" />
          <TextInput
            style={st.textarea}
            value={content}
            onChangeText={setContent}
            placeholder="来吧 说说看 我在听……"
            placeholderTextColor={c.hint}
            multiline
            maxLength={MAX_CONTENT_LENGTH}
            textAlignVertical="top"
          />
          <Text style={st.counter}>{content.length}/{MAX_CONTENT_LENGTH}</Text>
        </View>

        {/* 联系方式 */}
        <View style={st.card}>
          <CardTitle icon={Mail} text="联系方式（可选）" />
          <TextInput
            style={st.input}
            value={contact}
            onChangeText={setContact}
            placeholder="QQ / 微信 / 邮箱"
            placeholderTextColor={c.hint}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={st.hint}>方便作者需要进一步沟通时联系你</Text>
        </View>

        <TouchableOpacity style={st.btnPrimary} onPress={submitFeedback} disabled={submitting}>
          <Send size={16} color="#fff" />
          <Text style={st.btnPrimaryText}>提交反馈</Text>
        </TouchableOpacity>

        <Text style={st.tip}>提交后将调起你的邮件客户端，内容会发送到作者邮箱。</Text>
        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  flex1: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  card: { backgroundColor: c.card, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.md, padding: spacing.lg, ...cardShadow },
  cardTitle: { fontSize: fontSize.base, fontWeight: '600', color: c.text, marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.lg,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
  },
  chipActive: { borderColor: c.primary, backgroundColor: c.primarySoftBg },
  chipText: { fontSize: fontSize.md, color: c.textSecondary },
  chipTextActive: { color: c.primaryText, fontWeight: '600' },
  textarea: {
    backgroundColor: c.inputBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: fontSize.base, color: c.text, borderWidth: 1, borderColor: c.border,
    minHeight: 120,
  },
  counter: { fontSize: fontSize.sm, color: c.hint, textAlign: 'right', marginTop: spacing.xs },
  input: {
    backgroundColor: c.inputBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: fontSize.base, color: c.text, borderWidth: 1, borderColor: c.border,
  },
  hint: { fontSize: fontSize.sm, color: c.hint, marginTop: 6 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: spacing.lg, marginTop: 20, paddingVertical: spacing.md, borderRadius: radius.sm, backgroundColor: c.primary,
  },
  btnPrimaryText: { color: '#fff', fontSize: fontSize.base, fontWeight: '600', marginLeft: 6 },
  tip: { fontSize: fontSize.sm, color: c.hint, marginHorizontal: spacing.lg, marginTop: 10, textAlign: 'center' },
});
