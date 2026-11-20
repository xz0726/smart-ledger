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
  '1.7.0': {
    title: '更新内容',
    intro: '这次更新了几个你大概会用得上的小东西：',
    items: [
      '月份选择界面焕新',
      '底部导航适配三键 / 手势导航',
    ],
  },
};
