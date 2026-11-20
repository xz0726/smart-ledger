# SmartLedger 智记账

用一句话记一笔账。智能记账 App：自然语言输入、规则引擎 + AI 双通道解析、消费分析、预算与固定收支管理。

基于 **Expo SDK 57 / React Native 0.86 / TypeScript**，数据完全本地存储在 SQLite，不依赖账号与云服务。

## 功能

- **智能记账**：输入「午饭花了 35 元」「昨天加油 200」「收到工资两万」，自动识别金额（含中文数字）、分类、日期，支持一条输入拆成多笔
- **双通道解析**：离线规则引擎优先（毫秒级）；未命中且配置了云端 AI 时调用 AI，兼容 OpenAI 兼容接口与推理模型
- **消费分析**：月度统计、日均/环比、每日支出趋势图、分类占比（条形 ↔ 环形图）、预算预警
- **账单管理**：按月分组、搜索、编辑、删除
- **预算 / 固定收支 / 快捷记账**：按分类设预算；每天/工作日/每周/每月自动补生成固定收支；仪表盘一键记固定金额
- **分类管理**：自定义分类与关键词，删除分类时可选转移或连带删除账单
- **数据备份**：CSV 导出/导入、JSON 完整备份与恢复
- **深色模式**：浅色 / 深色 / 跟随系统，全界面语义色 token 适配
- **Android 通知捕获**（半自动）：监听支付通知，生成待确认记录

详细功能说明见 [应用介绍.md](应用介绍.md)。

## 技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Expo SDK 57 · React Native 0.86 |
| 语言 | TypeScript |
| 路由 | Expo Router（文件路由） |
| 数据库 | SQLite（expo-sqlite） |
| 状态管理 | Zustand |
| 图表 | 手写 SVG（react-native-svg） |
| 图标 | Lucide React Native |
| AI | OpenAI 兼容 API（纯对话 + JSON 结构化输出） |
| 补丁 | patch-package |

## 快速开始

```bash
npm install
npx expo start
```

用手机上的 Expo Go 扫码连接。web 预览（数据为内存演示数据）：

```bash
npx expo start --web
```

> web 预览依赖 `postinstall` 自动应用的 patch-package 补丁；文件导入导出、邮件、分享等原生能力在 web 端为兜底提示，完整体验以手机端为准。

## AI 配置

在设置页填写 OpenAI 兼容接口地址与 API Key，API 地址留空则纯离线运行、不发起任何网络请求。

| 服务 | API 地址示例 |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 腾讯云 TokenHub | `https://tokenhub.tencentmaas.com/plan/v3` |

## 项目结构

```
app/          Expo Router 页面（仪表盘 / 账单 / 设置）
src/
  components/  UI 组件（输入条、图表、各类管理弹窗）
  hooks/       数据 Hook
  services/    业务逻辑（SQLite、规则引擎、AI、原生能力收口）
  stores/      Zustand 状态
  theme/       语义色 token 与间距/圆角/字号阶梯
patches/       patch-package 补丁（expo-sqlite web 同步问题）
tests/         单元测试
android/       原生工程（通知监听等手工定制）
```

更完整的目录说明见 [应用介绍.md](应用介绍.md#项目结构)。

## 打包 APK

推荐用 GitHub Actions 构建（公开仓库免费）：在仓库 **Actions → Android Release APK → Run workflow** 手动触发，产物在该次运行的 Artifacts 中下载；也可推一个 `v*` tag 自动构建并发布 Release。

本地构建见 [.claude/skills/build-apk](.claude/skills/build-apk/)（含本机 JDK/SDK/镜像适配）。

## 测试

```bash
node tests/run.mjs
```

## 开发日志

版本变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

[MIT](LICENSE)
