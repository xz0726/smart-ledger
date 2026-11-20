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
      '月份选择器焕新：按年翻看，哪个月有账单一眼就知道',
      '选中月份不再自动关弹窗，页面数据实时跟着变',
      '底部导航适配三键 / 手势导航，图标不再和系统按键打架',
      '支持页面补齐底部留白，内容不再被系统栏挡住',
      '偷偷点未来月份，会被温柔拦下 👀',
    ],
  },
};
