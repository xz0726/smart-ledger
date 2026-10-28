/**
 * 依赖原生模块的操作（文件导出 / 文件选择读取 / 邮件）统一收口到这里。
 * web 端由同名 nativeActions.web.ts 提供兜底实现（Metro 按平台解析），
 * 使 expo-file-system / expo-sharing / expo-mail-composer 不进 web bundle。
 */
import { Alert } from 'react-native';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as MailComposer from 'expo-mail-composer';
import * as Haptics from 'expo-haptics';
import { Asset } from 'expo-asset';

/** 把文本内容写入文档目录并通过系统分享面板导出 */
export async function shareTextFile(filename: string, content: string, mimeType: string): Promise<void> {
  const file = new File(Paths.document, filename);
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType });
}

/** 打开系统文件选择器并读取所选文本文件内容；用户取消返回 null */
export async function readPickedFile(mimeType: string): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: mimeType, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  return await file.text();
}

/** 调起系统邮件客户端发送反馈 */
export async function composeMail(opts: { recipients: string[]; subject: string; body: string }): Promise<void> {
  await MailComposer.composeAsync({ ...opts, isHtml: false });
}

/** 把打包内置的图片资源落到缓存文件，再调起系统分享（分享面板可保存到相册/文件） */
export async function shareAssetFile(assetModule: number, filename: string, dialogTitle: string): Promise<void> {
  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync(); // 开发(从 Metro 拉取)与生产(从内置资源拷贝)都落到本地，得到 file:// localUri
  if (!asset.localUri) throw new Error('无法获取图片文件');

  const dest = new File(Paths.cache, filename);
  const src = new File(asset.localUri);
  if (src.uri !== dest.uri) await src.copy(dest, { overwrite: true });

  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest.uri, { mimeType: 'image/png', dialogTitle });
  } else {
    Alert.alert('分享不可用', '当前设备不支持系统分享');
  }
}
