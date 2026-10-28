/**
 * nativeActions 的 web 兜底实现：文件导入导出与系统邮件依赖原生能力，
 * web 端仅提示（Alert 在 web 上不渲染 UI，只 console，不会崩溃）。
 */
import { Alert } from 'react-native';

const ONLY_NATIVE = '该功能仅在手机端可用，请在手机 App 中使用';

export async function shareTextFile(_filename: string, _content: string, _mimeType: string): Promise<void> {
  Alert.alert('提示', ONLY_NATIVE);
}

export async function readPickedFile(_mimeType: string): Promise<string | null> {
  Alert.alert('提示', ONLY_NATIVE);
  return null;
}

export async function composeMail(_opts: { recipients: string[]; subject: string; body: string }): Promise<void> {
  Alert.alert('提示', ONLY_NATIVE);
}

export async function shareAssetFile(_assetModule: number, _filename: string, _dialogTitle: string): Promise<void> {
  Alert.alert('提示', ONLY_NATIVE);
}
