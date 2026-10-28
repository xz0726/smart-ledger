// 联系 / 反馈 / 打赏相关配置。
// ⚠️ 所有值均为占位，发布前请替换为真实内容。

export const SUPPORT = {
  // QQ 群号（替换为真实群号）
  qqGroupId: '960613007',
  // QQ 群名称（用于展示与介绍文案）
  qqGroupName: '智记账官方交流群',
  // 反馈接收邮箱（替换为真实邮箱）
  feedbackEmail: '2186498892@qq.com',
};

export type QrKey = 'wechat' | 'alipay';

export interface QrItem {
  /** require() 返回的资源模块 */
  module: number;
  /** 落盘文件名（打赏页分享/保存用） */
  file: string;
  /** 展示用名称 */
  label: string;
}

// 收款码图片。assets/ 下当前为占位图，正式图就位后直接替换同名文件即可。
export const QR_IMAGES: Record<QrKey, QrItem> = {
  wechat: { module: require('../../assets/qr-wechat.png'), file: 'qr-wechat.png', label: '微信收款码' },
  alipay: { module: require('../../assets/qr-alipay.png'), file: 'qr-alipay.png', label: '支付宝收款码' },
};

// 一键加群（腾讯官方"群推广"链接格式，群无需前置设置即可拉起）
export const mqqGroupUrl = () =>
  `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${SUPPORT.qqGroupId}&card_type=group&source=qrcode`;
