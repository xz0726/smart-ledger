/**
 * 依赖原生模块的操作（文件导出 / 文件选择读取 / 邮件）统一收口到这里。
 * web 端由同名 nativeActions.web.ts 提供兜底实现（Metro 按平台解析），
 * 使 expo-file-system / expo-sharing / expo-mail-composer 不进 web bundle。
 */
import { Alert } from 'react-native';
import { Paths, File } from 'expo-file-system';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
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

export interface PickedBillFile {
  name: string;
  bytes: Uint8Array;
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i]);
    const c1 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c2 = i + 2 < clean.length ? BASE64_CHARS.indexOf(clean[i + 2]) : 0;
    const c3 = i + 3 < clean.length ? BASE64_CHARS.indexOf(clean[i + 3]) : 0;
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (o < length) out[o++] = (n >> 16) & 0xff;
    if (o < length) out[o++] = (n >> 8) & 0xff;
    if (o < length) out[o++] = n & 0xff;
  }
  return out;
}

/**
 * 读取选择器返回的文件字节。
 * 新 File API 对 content:// 直接放行（走 ContentResolver），优先用它；
 * 失败时回退到 legacy readAsStringAsync（对 externalstorage 的 SAF URI 也能读），
 * 按 base64 解回字节。
 */
async function readPickedBytes(uri: string): Promise<Uint8Array> {
  try {
    return await new File(uri).bytes();
  } catch {
    const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    return base64ToBytes(base64);
  }
}

/** 选择微信/支付宝账单文件并按字节读取（xlsx 二进制 / csv 编码都需要原始字节） */
export async function pickBillFileBytes(): Promise<PickedBillFile | null> {
  // 不复制到缓存：Expo Go / Android 15 下 expo-file-system 会把 DocumentPicker
  // 复制到缓存目录的 file:// 文件判为不可读；直接用原始 content:// URI 读取。
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: false });
  if (result.canceled) return null;
  const asset = result.assets[0];

  const size = asset.size ?? 0;
  if (size > 20 * 1024 * 1024) {
    throw new Error('文件超过 20MB，请缩短账单时间范围后再导出');
  }

  const bytes = await readPickedBytes(asset.uri);
  return { name: asset.name || '账单文件', bytes };
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
