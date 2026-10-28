import { useMemo, useState } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, Modal, Pressable, Image, Alert, StyleSheet,
} from 'react-native';
import { useThemeColors, type ThemeColors } from '../../src/theme';
import { QR_IMAGES, type QrKey } from '../../src/constants/support';
import { shareAssetFile } from '../../src/services/nativeActions';

// 把打包内置的收款码图落到本地缓存文件，再调起系统分享（分享面板可保存到相册/文件）
const saveOrShareQr = async (key: QrKey) => {
  const item = QR_IMAGES[key];
  try {
    await shareAssetFile(item.module, item.file, `保存/分享${item.label}`);
  } catch (e: any) {
    Alert.alert('操作失败', e?.message ?? '请稍后重试');
  }
};

export default function Donate() {
  const [preview, setPreview] = useState<QrKey | null>(null);
  const c = useThemeColors();
  const st = useMemo(() => createStyles(c), [c]);

  return (
    <ScrollView style={st.safe} contentContainerStyle={st.content}>
      {/* 感谢文案 */}
      <View style={st.card}>
        <Text style={st.cardTitle}>💝 感谢支持</Text>
        <Text style={st.desc}>
          智记账是个人独立开发的作品。如果它帮你理清了每一笔账，欢迎投喂作者，1块钱也是对作者最大的鼓励！
        </Text>
        <Text style={st.hint}>投喂时可附言备注，或到「骚扰作者」页与作者沟通。</Text>
      </View>

      {/* 微信收款码 */}
      <View style={st.card}>
        <Text style={st.cardTitle}>💚 微信收款码</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setPreview('wechat')}
          onLongPress={() => saveOrShareQr('wechat')}
          delayLongPress={350}
          style={st.qrWrap}>
          <Image source={QR_IMAGES.wechat.module} style={st.qrImg} resizeMode="contain" />
        </TouchableOpacity>
        <Text style={st.qrHint}>长按保存 / 分享 · 点击查看大图</Text>
      </View>

      {/* 支付宝收款码 */}
      <View style={st.card}>
        <Text style={st.cardTitle}>💙 支付宝收款码</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setPreview('alipay')}
          onLongPress={() => saveOrShareQr('alipay')}
          delayLongPress={350}
          style={st.qrWrap}>
          <Image source={QR_IMAGES.alipay.module} style={st.qrImg} resizeMode="contain" />
        </TouchableOpacity>
        <Text style={st.qrHint}>长按保存 / 分享 · 点击查看大图</Text>
      </View>

      <View style={{ height: 32 }} />

      {/* 全屏大图预览 */}
      <Modal
        visible={preview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}>
        <Pressable style={st.previewBackdrop} onPress={() => setPreview(null)}>
          <Image
            source={preview ? QR_IMAGES[preview].module : undefined}
            style={st.previewImg}
            resizeMode="contain"
          />
          <Text style={st.previewHint}>点击任意处关闭</Text>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  content: { paddingBottom: 24 },
  card: { backgroundColor: c.card, marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 12 },
  desc: { fontSize: 14, color: c.textSecondary, lineHeight: 22 },
  hint: { fontSize: 12, color: c.hint, marginTop: 8 },
  qrWrap: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderRadius: 8, borderWidth: 1, borderColor: c.border,
    padding: 8,
  },
  qrImg: { width: 220, height: 220 },
  qrHint: { fontSize: 12, color: c.hint, textAlign: 'center', marginTop: 10 },
  previewBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewImg: { width: '85%', height: '70%' },
  previewHint: { color: '#ffffff', fontSize: 13, marginTop: 20 },
});
