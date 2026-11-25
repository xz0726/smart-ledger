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

export interface NotifyCaptureStatus {
  captureEnabled: boolean;
  listenerGranted: boolean;
  connected: boolean;
  eventCount: number;
  lastEventAt: number;
  lastPkg: string;
  lastOutcome: string;
}

/** 原生诊断状态（服务连接、回调次数、最近通知处理结果），仅 APK 可用 */
export async function getNotifyCaptureStatus(): Promise<NotifyCaptureStatus | null> {
  if (!native) return null;
  try { return await native.getCaptureStatus(); } catch { return null; }
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
  if (!native) return;
  try {
    // 关闭时同步原生开关并清掉缓冲，服务端立即停止捕获（不等 App 重启）
    await native.setCaptureEnabled(v && await isListenerEnabled());
    if (!v) stopNotifyCapture();
  } catch (e) {
    console.error('setCaptureEnabled failed:', e);
  }
}

let started = false;
let subscription: { remove(): void } | null = null;

/** App 启动时调用：同步原生开关，开启且已授权时开始捕获（含取出 App 被杀期间的落盘缓冲） */
export async function startNotifyCapture(): Promise<void> {
  if (!native) return;
  try {
    const enabled = await isNotifyCaptureEnabled();
    const granted = enabled && (await isListenerEnabled());
    await native.setCaptureEnabled(granted);
    if (!granted) { stopNotifyCapture(); return; }
    if (started) return;
    started = true;

    // App 被杀期间由原生落盘缓冲的通知，启动时一次性取出入库
    const buffered: Array<{ source: string; title: string; text: string; createdAt: number }> =
      await native.drainCaptureBuffer();
    for (const item of buffered) await ingest(item.source, item.title, item.text);

    subscription = DeviceEventEmitter.addListener('onPaymentCapture', (e: { source: string; title: string; text: string }) => {
      void ingest(e?.source, e?.title, e?.text);
    });
  } catch (e) {
    console.error('startNotifyCapture failed:', e);
  }
}

/** 停止监听并解绑 JS 事件（关开关时立即生效） */
export function stopNotifyCapture(): void {
  subscription?.remove();
  subscription = null;
  started = false;
}

async function ingest(source: string | undefined, title: string | undefined, text: string | undefined): Promise<void> {
  try {
    if (!source || (!title && !text)) return;
    if (!(await isNotifyCaptureEnabled())) return; // 开关已关，丢弃在途事件
    if (!isPaymentNotification(title, text)) return;
    const result = parsePaymentText(source as 'alipay' | 'wechat', title, text);
    if (result.refunded) return; // 退款等不入账
    const id = await addPendingCapture({ source: source as 'alipay' | 'wechat', title: title || '', text: text || '', amount: result.amount, direction: result.direction });
    if (id > 0) DeviceEventEmitter.emit('onPendingCaptureAdded'); // 仪表盘卡片实时刷新
  } catch (e) {
    console.error('ingest capture failed:', e);
  }
}
