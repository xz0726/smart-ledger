/**
 * 更新介绍文案：key 为 app.json 的 version。
 * 每次发版在对应版本下加一条即可；没有条目的版本不会弹「更新介绍」。
 */
export interface ReleaseNotes {
  title: string;
  intro: string;
  items: string[];
}

export const RELEASE_NOTES: Record<string, ReleaseNotes> = {
  '1.8.0': {
    title: '更新内容',
    intro: '这次可以把微信、支付宝账单直接导进来了：',
    items: [
      '支持微信 xlsx / 支付宝 csv 账单导入',
      '自动分类、按月预览、批量勾选入账',
      '交易单号 + 同金额同日同分类双重去重',
      '退款按净额入账，跨月退款自动冲减原支出',
      '导入账目带来源标签，支持整批撤销',
    ],
  },
  '1.7.0': {
    title: '更新内容',
    intro: '这次更新了几个你大概会用得上的小东西：',
    items: [
      '月份选择界面焕新',
      '底部导航适配三键 / 手势导航',
    ],
  },
};
