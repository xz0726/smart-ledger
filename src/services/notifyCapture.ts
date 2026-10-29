/**
 * 通知捕获自动记账（Android，半自动）：
 * 原生 NotificationListenerService 捕获支付类通知 → 本地解析 → 写入待确认列表（pending_captures），
 * 用户在 App 内点确认才入账。只本地解析，不上云不送 AI。
 */
import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import { getSetting, setSetting, addPendingCapture } from './db';
import { parsePaymentText, isPaymentNotification } from './paymentParser';

const MODULE_NAME = 'PaymentCapture';
export const NOTIFY_CAPTURE_SETTING_KEY = 'notify_capture_enabled';

// web 端无原生模块；db.web 环境下不启用
const native = Platform.OS === 'android' ? (NativeModules[MODULE_NAME] ?? null) : null;

/** 原生桥是否可用（Expo Go 里为 false，自建 APK 里为 true） */
export function isNotifyCaptureAvailable(): boolean {
  return !!native;
}

/** 系统「通知使用权」是否已授权本应用 */
export async function isListenerEnabled(): Promise<boolean> {
  if (!native) return false;
  try { return await native.isListenerEnabled(); } catch { return false; }
}

/** 用户开关（默认关） */
export async function isNotifyCaptureEnabled(): Promise<boolean> {
  try { return (await getSetting(NOTIFY_CAPTURE_SETTING_KEY)) === '1'; } catch { return false; }
}

export async function setNotifyCaptureEnabled(v: boolean): Promise<void> {
  await setSetting(NOTIFY_CAPTURE_SETTING_KEY, v ? '1' : '0');
}

let started = false;

/** App 启动时调用：开关开启且已授权时开始捕获（含取出 App 被杀期间的落盘缓冲） */
export async function startNotifyCapture(): Promise<void> {
  if (!native || started) return;
  try {
    if (!(await isNotifyCaptureEnabled())) return;
    if (!(await isListenerEnabled())) return;
    started = true;

    // App 被杀期间由原生落盘缓冲的通知，启动时一次性取出入库
    const buffered: Array<{ source: string; title: string; text: string; createdAt: number }> =
      await native.drainCaptureBuffer();
    for (const item of buffered) ingest(item.source, item.title, item.text);

    DeviceEventEmitter.addListener('onPaymentCapture', (e: { source: string; title: string; text: string }) => {
      ingest(e?.source, e?.title, e?.text);
    });
  } catch (e) {
    console.error('startNotifyCapture failed:', e);
  }
}

function ingest(source: string | undefined, title: string | undefined, text: string | undefined): void {
  try {
    if (!source || (!title && !text)) return;
    if (!isPaymentNotification(title, text)) return;
    const result = parsePaymentText(source as 'alipay' | 'wechat', title, text);
    if (result.refunded) return; // 退款等不入账
    addPendingCapture({ source: source as 'alipay' | 'wechat', title: title || '', text: text || '', amount: result.amount, direction: result.direction })
      .catch(e => console.error('addPendingCapture failed:', e));
  } catch (e) {
    console.error('ingest capture failed:', e);
  }
}
