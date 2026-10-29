# SmartLedger 开发日志

## 2026-10-29 — 界面布局/图标优化 + 页头统一 + 弹窗规范 + 键盘修复 ✅（v1.6.0）

### 目标
- 以「web 预览 + Playwright 截图」建立 UI 可视化审查管线（容器内 adb 不可用），并据此系统性优化界面布局与图标
- 统一设置页页头与仪表盘/账单（消除顶部空白）、统一全部弹窗样式、修复键盘弹出时输入条下沿的大空隙
- 清理无用的旧布局与配色

### 变更
- **web 预览管线**（纯开发设施，不影响原生端）：
  - 新增 `react-native-web`，metro 增加 `wasm` assetExts + COOP/COEP 加头代理；`patches/`（patch-package）修复 expo-sqlite web 的同步自旋超时与同源 worker blob 包装问题
  - 新增 `src/services/db.web.ts`：web 平台内存数据层（Metro 平台解析自动生效），内置种子数据供 UI 审查
  - 新增 `src/services/nativeActions(.web).ts`：文件导出/文件读取/邮件/图片分享统一收口，原生模块不进 web bundle
- **A 组视觉微调**：
  - theme 新增 `cardShadow`（iOS/web 卡片阴影，13 文件统一）；Toast 反色主题化；ExpenseCard 圆角 8→12
  - Tab 图标 `List`→`ReceiptText`，tab 栏高度 60→64 修复 RNW 下标签裁切；3 个 lucide ColorValue 历史 tsc 错误消除
  - 新增 `src/components/CardTitle.tsx`（lucide 图标+文字），替换全部 17 处 emoji 前缀标题（📈→TrendingUp、🎯→Target、⚡→Zap 等）
  - 分类 emoji 渲染统一为 `category_color+'20'` 圆形 chip（占比图例/预算行/管理列表与账单列表同一语言）
- **B 组 token 重构**：
  - theme 新增语义色 `primary/success/danger/warning/info`（深色用提亮变体），22 文件约 98 处硬编码色收敛
  - 新增 `src/theme/spacing.ts`（间距/圆角/字号阶梯），25 文件字面量替换
  - 删除 NativeWind 死文件（tailwind.config.js / global.css / nativewind-env.d.ts）
- **设置页页头统一**：设置页改 `headerShown: false` + 自绘居中标题（规格照抄 MonthSwitcher），三 tab 页头节奏一致；原生 header 与 SafeArea 的顶部双重 inset 随之消除
- **弹窗样式统一**：新增 `src/components/ModalHeader.tsx`（左关闭 X · 绝对居中标题 · 右插槽），5 个底部弹窗套用；标题 15/16 混用、分隔线有无不一、按钮圆角 10/8 混用全部对齐；面板底部接入 `useSafeAreaInsets().bottom`；删除分类弹窗补点背景关闭
- **键盘空隙修复**（`InputBar.tsx`）：原逻辑全量叠加键盘高度（Android adjustResize 再缩窗 → 双重补偿，空隙 ≈ 键盘高）；改为运行时自适应——窗口因键盘收缩则免补偿，未收缩（edge-to-edge 覆盖模式）则补偿 `键盘高 − 输入条下沿到窗口底距离`，输入条恰好落在键盘上沿
- **清理**：删除零引用的 `src/utils/colors.ts`、一次性脚本 `test-day3.mjs`、4 个未引用资源 png、8 处死样式定义
- **版本**：1.5.3 → 1.6.0（app.json + 设置页「关于」显示同步）

### 结果
- 测试：285/285 通过；`tsc --noEmit` 现存 1 个历史错误（ColorValue 3 个已随 Tab 改动消除，29→1）
- 截图回归：v1→v6 六轮 12 页 × 浅深主题全绿；弹窗交互截图（解析/编辑/月份）确认统一效果

### 待真机验证
- 键盘弹出：输入条下沿贴键盘上沿、无遮挡无大空隙（覆盖模式与 adjustResize 构建两种环境）
- 设置页顶部空白消失、三页页头节奏一致；深色模式主色提亮后各屏观感
- 弹窗底部与手势条的安全间距；删除分类弹窗点背景可关闭

---

## 2026-10-26 — 快捷记账金额显示一致 + standalone 主题跟随系统 ✅（v1.5.3）

### 目标
- 修复快捷记账金额在仪表盘与设置页显示不一致（设置 3.5 → 仪表盘显示 4）
- 修复本地安装 APK 后「主题 · 跟随系统」不响应系统深色切换（Expo Go 无线调试正常）

### 变更
- **快捷记账金额**（`src/components/QuickAddBar.tsx`）：
  - 根因：按钮用 `item.amount.toFixed(0)` 显示，3.5 被四舍五入成 4；设置页用 `toFixed(2)` 显示 3.50
  - 修复：改用共享 `formatAmount(item.amount)`（两位小数），与设置页 / Toast / 统计口径一致
- **standalone 主题不跟随系统**（`android/app/src/main/res/values/strings.xml` + `app.json`）：
  - 根因：`expo-system-ui` 的 Android 生命周期监听读取资源 `expo_system_ui_user_interface_style` 决定 `AppCompatDelegate` 夜间模式。该资源由 `expo-system-ui` 配置插件写入；本地 `android/` 工程此前未经过带插件的 prebuild，资源缺失 → 落到库内默认值 `light` → `MODE_NIGHT_NO` 强制浅色，`useColorScheme()` 恒返回 light（Expo Go 宿主工程配置为 automatic，所以调试时正常）
  - 修复：`app.json` 的 `plugins` 补 `expo-system-ui`（后续 prebuild 自动写资源）；并在现有 `android/.../values/strings.xml` 直接补该资源为 `automatic`，当前工程 Gradle 打包立即生效
  - 注意：需重新构建安装 APK 才能生效
- **版本**：1.5.2 → 1.5.3（app.json + 设置页「关于」显示同步）

### 结果
- 测试：285/285 通过（纯展示/原生资源修复，无逻辑变更）
- `tsc --noEmit`：本次改动文件无新增错误（现存 4 个均为既有历史问题）
- Metro bundle 编译通过

### 待真机验证
- 设置快捷记账 3.5 → 仪表盘按钮与设置页均显示 ¥3.50；点击入账金额为 3.5
- 重新打包安装 APK → 主题「跟随系统」时切换手机深 / 浅色，App 实时跟随；浅色 / 深色固定档仍正常

---

## 2026-10-22 — 深色模式修复②：support 退出白屏 + 弹窗键盘吃掉首次点击 ✅（v1.5.2）

### 目标
- 修复深色模式下从骚扰作者 / 意见反馈 / 投喂作者三个页面退出仍闪白屏；分类管理添加关键词键盘弹出时点「添加」只收键盘需点两次

### 变更
- **support 退出白屏**（`app/_layout.tsx`）：
  - 根因：v1.5.1 的 `contentStyle` 只染 native-stack 的内容容器 `View`，转场动画在 Fragment 层发生，背后是**白色窗口背景**（Android 默认 fade pop 转场含 alpha，出栈屏半透明 + 下层屏重挂 → 白窗透出）
  - 修复（根因层）：新增 `expo-system-ui`，根布局 effect 里 `SystemUI.setBackgroundColorAsync(c.background)` 把 `window.decorView` 背景染成主题背景，深浅自适应，转场透明处露出的是主题色而非白
  - 原计划中的全不透明滑动动画（`animation: 'slide_from_right'`）已按用户要求回退，仅保留窗口背景修复
- **键盘吃掉首次点击**：
  - 根因：ScrollView 默认 `keyboardShouldPersistTaps="never"`，聚焦输入框时首次触点被 ScrollView 收去关键盘（`ScrollView.js` `_handleTouchEnd` blur 逻辑）——按钮点击根本收不到；弹窗按钮原先在 ScrollView 外、`onPressIn` 也被 Dialog 窗口层吞掉
  - 修复：所有含「输入框+按钮」的滚动容器加 `keyboardShouldPersistTaps="handled"`（ScrollView 在 start 阶段认领 responder，首次触点先交 JS）——设置页 ScrollView（AI 保存配置 + 各管理器按钮）、`CategoryKeywordsModal`（「添加」行移入 body ScrollView）、`EditExpenseModal`（header+表单整体包入 handled ScrollView）
  - 按钮动作保留 `onPressIn`（touch-down 即触发）+ 同 handler `Keyboard.dismiss()`；列表 `onScrollBeginDrag` 顺手收键盘
- **版本**：1.5.1 → 1.5.2（app.json + 设置页「关于」显示同步）

### 结果
- 测试：285/285 通过（纯 UI/样式修复，无逻辑变更，用例数不变）
- `tsc --noEmit`：本次改动文件无新增错误（现存 4 个均为既有历史问题）
- Metro bundle 编译通过

### 待真机验证
- 深色下 骚扰作者 / 意见反馈 / 投喂作者 三个页面退出均无白屏
- 设置页 AI 保存配置 / 分类关键词弹窗「添加」/ 编辑账单弹窗「保存」：键盘弹出时点击**一次**即生效

---

## 2026-10-22 — 深色模式修复三连 ✅（v1.5.1）

### 目标
- 修复深色模式下三个问题：退回设置页白屏闪过、三个管理卡片分类名黑色、编辑/关键词弹窗不能点空白关闭

### 变更
- **白屏闪**（`app/_layout.tsx`）：根 `<Stack>` 补 `screenOptions.contentStyle.backgroundColor = c.background`——native-stack 不自动套用导航主题背景色，Android 默认容器背景为白，pop 回根栈场景（设置页）时动画期间露白；support 栈此前已设所以只有跨栈返回才闪
- **黑色分类名**（`BudgetManager` / `FixedItemsManager` / `QuickItemsManager`）：4 处行内 `<Text style={{ fontSize: 12 }}>` 分类/星期 chips 无颜色定义（RN 默认黑字），补 `color: c.text`
- **弹窗点空白关闭**（`EditExpenseModal` / `CategoryKeywordsModal`）：overlay 补 `backdrop`（flex:1 按压层，点击收起键盘并关闭，复用 ParsePreviewModal 范式）；EditExpenseModal 顺带补 `onRequestClose`（Android 返回键）
- **版本**：1.5.0 → 1.5.1（app.json + 设置页「关于」显示同步）

### 结果
- 测试：285/285 通过（纯 UI/样式修复，无逻辑变更，用例数不变）
- `tsc --noEmit`：本次改动文件无新增错误（现存 4 个均为既有历史问题）
- Metro bundle 编译通过

### 待真机验证
- 深色下 意见反馈 → 返回设置页无白屏；预算 / 固定收支 / 快捷记账分类 chips 深色可读
- 编辑账单 / 分类关键词弹窗点空白关闭、Android 返回键关闭、键盘展开时点空白同时收键盘

---

## 2026-10-22 — 深色模式：浅色 / 深色 / 跟随系统 ✅（v1.5.0）

### 目标
- 新增主题切换：浅色 / 深色 / 跟随系统三档，全应用由裸色值改为语义 token，深色下逐屏可读

### 变更
- **主题模块**（新建 `src/theme/index.ts`）：
  - 15 个语义色 token（背景 / 卡片 / 文字 / 次要文字 / 提示 / 边框 / 输入底 / 轨道分隔 / 主色浅底 / 主色浅底文字 / 历史月提示条 / 禁用 / tab 栏 / tab 未选中），配浅色、深色两套取值（slate 系同族色板）
  - `resolveTheme`（偏好 × 系统主题 → 实际主题，纯函数）+ `useResolvedTheme` / `useThemeColors` / `getNavigationTheme`（spread expo-router 内置主题保留 fonts，仅覆盖 colors）
- **持久化**（`src/stores/settingsStore.ts`）：`theme` 偏好（默认 `'system'`）写入 `settings` 表，`loadSettings` 载入，非法值兜底 `'system'`
- **布局**（3 个 `_layout`）：
  - 根布局 `ThemeProvider` 包裹导航（深色下 header / 场景背景 / 转场跟随主题），`StatusBar` 随主题翻转；`app.json` `userInterfaceStyle` → `automatic`（否则 `useColorScheme` 恒为浅色，系统主题不可感知）
  - Tab / Support 布局：tabBar、header、内容背景全部 token 化
- **全组件 token 化**（25 个文件）：每组件 `createStyles(c) + useMemo` 模式（`useThemeColors()` 返回模块级常量，仅主题翻转时重建样式）；行内色值（图标 / 占位 / 条件三元）同步替换；固定色保留字面量（品牌主色 `#6366f1`、收入 / 危险 / 警告、弹窗遮罩、Toast、分类数据色）
- **设置页主题卡**：顶部「🎨 主题」三档分段控件（跟随系统 / 浅色 / 深色），切换即时生效并持久化
- **图表适配**：甜圈图楔形间隔色 `#fff` → 卡片 token（深色下不再画白线）；趋势图零值柱 / 日期标签 token 化
- **版本**：1.4.0 → 1.5.0（app.json + 设置页「关于」显示同步）

### 结果
- 测试：285/285 通过（100%）——新增 `tests/theme.test.mjs`（resolveTheme 真值表 9 例 + 非法偏好兜底 + 色板常量断言，16 例）与 `store.test.mjs` 主题用例 6 例（263 → 285）
- `tsc --noEmit`：本次改动文件无新增错误（现存 4 个均为既有历史问题）
- Metro bundle 编译通过

### 待真机验证
- 设置 → 主题三档即时切换；跟随系统时随手机系统深色 / 浅色实时翻转
- 深色下逐屏检查可读性：仪表盘 / 账单 / 设置 / support 三页 / 全部弹窗 / 甜圈图楔形间隔色 / tabBar / header / 状态栏图标

---

### 目标
- 新增「快捷记账」：预设「名称 + 分类 + 金额」，在仪表盘点一下即入账一笔（记入今天），解决停车费、奶茶这类金额固定但日期随机的记账需求；并给出轻提示

### 变更
- **数据层**（`src/services/db.ts`）：
  - 新表 `quick_items`（id / name / category_id / amount / created_at）
  - 新增 `getQuickItemsWithCategory` / `addQuickItem` / `deleteQuickItem` 三个 API（仿固定收支写法）
  - `deleteCategoryWithData` 事务内连带删除引用该分类的快捷记账，避免悬空按钮
  - `src/utils/format.ts` 新增共享的 `getTodayDate()`（今天日期 `YYYY-MM-DD`，此前 db/ruleEngine 各有私有实现）
- **仪表盘按钮条**（新建 `src/components/QuickAddBar.tsx`）：
  - 月份切换下方横向滚动一排 pill 按钮（分类图标 + 名称 + 金额，如「🚇 停车 ¥10」），空配置时整卡片隐藏
  - 切回仪表盘 / 分类变更（revision）自动刷新
- **一键记账 + 轻提示**（`app/(tabs)/index.tsx`）：
  - 点按钮 → 复用现有 `handleAddExpense` 刷新链（add + reloadStats + reloadBudgets）记入**今天**，浏览历史月也记今天（与既有提示一致）
  - 新增轻提示 Toast：RN 核心 `Animated` 实现（零新增依赖），深色胶囊「已记 · 停车 ¥10」淡入约 1.6s 后自动淡出，不可点击不挡操作
- **设置页管理**（新建 `src/components/QuickItemsManager.tsx`）：
  - 「⚡ 快捷记账」卡片（仿固定收支）：名称 + 支出分类 chips + 金额 → 添加；列表删除带确认
  - 设置页 `<FixedItemsManager />` 后插入
- **版本**：1.3.0 → 1.4.0（app.json + 设置页「关于」显示同步）

### 结果
- 测试：263/263 通过（100%）——新增 getTodayDate 3 例、quick_items 表字段 / SQL 构造 / 删除分类连带清理 7 例（253 → 263）
- `tsc --noEmit`：本次改动文件无新增错误（现存 4 个均为既有历史问题）
- Metro bundle 编译通过，新模块（QuickAddBar / QuickItemsManager / quick_items / getTodayDate）均已打入

### 待真机验证
- 设置页添加「停车 10 / 交通」→ 仪表盘出现按钮条；点按钮入账且统计/趋势/预算即时刷新、Toast 弹出自动消失
- 历史月浏览时点按钮仍记入今天；按钮多时横向可滑动；删除分类后对应按钮消失

---

## 2026-10-22 — 仪表盘与账单页优化 ✅（v1.3.0）

### 目标
- 仪表盘支持历史月份浏览、分类占比「条形 ↔ 饼图」切换、每日支出趋势图；账单页与仪表盘共享同一可选月份；修复饼图扇区点击误判等交互问题

### 变更
- **共享月份状态**（新建 `src/stores/monthStore.ts`，zustand）：
  - 仪表盘与账单页读写同一 `month`，任一页切换月份，另一页数据联动刷新（`useStats`/`useExpenses`/`useBudget` 的 load 本就依赖 month 自动重载）
  - 新增 `src/utils/format.ts`：`getNextMonth` / `isCurrentMonth` / `getRecentMonths`
- **月份切换 UI**（新建 `src/components/MonthSwitcher.tsx`）：
  - 头部左右箭头逐月步进（当前月右箭头禁用灰显）+ 点标题弹底部月份选择器（最近 12 个月、选中高亮、当前月标注）
  - **「回到本月」按钮移至页面**：浏览历史月时头部下方显示 pill，已从弹窗内移出
  - 弹窗点击空白区域即收回（overlay Pressable + 内部 stopPropagation）
- **仪表盘**（`app/(tabs)/index.tsx`）：
  - 关闭原生「仪表盘」标题（`_layout.tsx`），MonthSwitcher 成为页头
  - 统计区补「结余」卡 → 总支出|总收入 / 日均|结余 对称 2×2
  - 新增「📈 每日支出趋势」柱状图（新建 `src/components/charts/DailyTrendChart.tsx`，手写 SVG，稀疏日自动补零、当前月只补到今日、X 轴每 5 天标签、标出峰值日金额）——`dailyTrend` 此前已查询但从未渲染，本次补上
  - 区块顺序：统计 → 趋势 → 分类占比 → 固定收支 → 预算预警
  - 查看历史月时输入条上方提示「新记账默认记入今天」
  - 日均按当前月已过天数计算（月中不偏小）；上月无支出时显示「无上月数据」而非误导性环比 `+0.0%`（`db.ts` `getStatsOverview` 返回 `hasPrevData`）
- **分类占比**（新建 `src/components/CategoryBreakdownCard.tsx` + `src/components/charts/CategoryDonutChart.tsx`）：
  - 卡片头部「条形 | 饼图」分段切换（默认条形）
  - 补合计金额、`<1%` 分类归并「其他」、空态兜底；金额超 1 万用 `formatShortAmount` 缩写
  - 饼图手写 SVG 环形（零新增依赖）：每扇区独立 **Path 环形扇形路径**，点击高亮精确对应选中扇区（外扩 +4 + 其余降透明 + 下方详情显示金额/百分比/笔数），中心显示总支出
  - **修复扇区点击误判**：原 `strokeDasharray` 圆环的命中测试不识别虚线分段（环形上任意点击都命中最上层扇区），已重写为逐扇区 Path 命中
- **账单页**（`app/(tabs)/records.tsx`）：接入共享月份 + MonthSwitcher，关闭原生「账单」标题；历史月浏览时分组头带年份前缀（如「2025年8月」）便于区分跨月同日
- **清理**：删除引用未安装 `react-native-gifted-charts` / NativeWind 的死代码组件（`CategoryPieChart.tsx`、`DailyLineChart.tsx`、`BudgetProgressBar.tsx`）

### 结果
- 测试：253/253 通过（100%）——format 新增月份工具函数用例 8 个（245 → 253）
- `tsc --noEmit`：本次改动文件无新增错误（现存 4 个均为既有历史问题）
- 版本 1.2.0 → 1.3.0（app.json 同步更新）

### 待真机验证
- 仪表盘/账单页切历史月数据联动；饼图逐个扇区点击高亮对应（重点相邻小扇区与「其他」）；月份选择器点空白收回；「回到本月」pill；历史月账单分组头年份前缀

---

## 2026-10-16 — AI 兼容性 & 分类管理增强 ✅（v1.2.0）

### 目标
- 修复 DeepSeek 思考模式不兼容 Function Calling 导致的 AI 解析 400 错误；规则归「其他」时用 AI 重分类；分类关键词改为在分类管理中编辑；删除分类时妥善处置账单数据

### 变更
- **AI 解析兼容性修复**（`src/services/ai.ts`）：
  - 放弃 Function Calling（`tools` + 强制 `tool_choice`），改为**纯对话 + 系统提示强制 JSON 输出**，兼容 DeepSeek Thinking 等推理模型（此前返回 400 "Thinking mode does not support this tool_choice"）
  - 新增 `extractJSON`：容忍 markdown 代码块 / 前后说明文字 / 纯 JSON 三种回复形态
  - 空 apiKey 改用占位符，修复「配置了 AI 却未调用」（openai-node v6 对空 key 构造时同步抛错、零网络请求）
- **「其他」分类 AI 重分类**（`InputBar.tsx`）：规则引擎命中但归「其他」的条目，已配置 AI 时逐条用 AI 重新分类（仅取分类），未配置则按「其他」入账；调用失败轻提示后照常入账
- **AI 提示词动态化**：`buildSystemPrompt(todayStr, categoryNames)` 分类列表动态取自数据库（去重 + 空/失败兜底默认 10 个），新增 / 删除分类后 AI 解析即时生效
- **分类关键词管理重构**：
  - 新增 `CategoryKeywordsModal`：分类管理中点击任意分类，查看 / 添加 / 删除该分类的关键词（内置默认词固定不可编辑）；同词跨分类时弹确认移动
  - `RuleManager` 只保留展示 + 删除，按分类分组展示（孤儿规则容错排最后）；新增入口收敛到分类管理
  - 删除分类时一并清理其自定义关键词；分类行显示关键词计数；删除后各设置页经 revision 联动刷新
- **删除分类的数据处置**（`db.ts` + `CategoryDeleteModal.tsx`）：
  - 新增 `getCategoryDataCounts` 与 `deleteCategoryWithData`（`withTransactionSync` 事务）
  - 删除有账单的分类时弹窗选择「转移账单到其他分类」或「连带删除账单」；预算自动删除、固定收支自动停用（enabled=0）
- **测试**：`tests/ai.test.mjs` 镜像同步到新 AI 逻辑（JSON 提取 + 动态分类提示词），229 → 245 用例

### 结果
- 测试：245/245 通过（100%）
- `tsc --noEmit`：无新增错误（29 个均为既有历史问题）
- 版本 1.1.0 → 1.2.0（app.json 同步更新）

### 待真机验证
- DeepSeek 思考模式下「无金额输入」与「其他重分类」两条路径 AI 均可用；删除有账单的分类弹窗转移 / 连带删除；自定义规则删除后分类计数即时更新

---

## 2026-10-15 — 五大功能增强 ✅（v1.1.0）

### 目标
- 仪表盘显示总收入；规则引擎支持中文金额与一次输入多项；新增固定收支、自定义分类规则、分类管理输入法图标

### 变更
- **仪表盘总收入**：新增绿色「总收入」统计卡，日均独立一行（2+1 布局防拥挤）
- **规则引擎重构**（`src/services/ruleEngine.ts`）：
  - `cnToNum` 中文数字转换：二十五→25、一百五→150、两万→20000、三块五→3.5
  - `scanAmounts` 正则扫描器（日期备选置前 + 量词守卫），多项输入按金额 token 切分成多笔记录
  - `parseWithRules` 返回 `ParsedExpense[]`（空数组 = 规则失败走 AI 兜底）；段文本吸收金额后紧跟的单位字（「花了35元」完整保留）
- **多项输入预览确认**：新增 `ParsePreviewModal`，一次输入多项时弹底部面板逐条核对后入账；单项保持直接入账
- **固定收支模块**：
  - 新表 `fixed_items`（每天 / 工作日 / 每周 / 每月频率），`FixedItemsManager` 设置页管理
  - `syncFixedItems()` 打开 App 自动补账：`[固定] #id 日期` 标记幂等去重、追溯到本月月初、跳过已删分类、不生成未来日期
  - 生成的记录即普通账单，自动计入统计 / 预算 / 账单 / 导出
  - 仪表盘新增「🔁 固定收支」本月汇总卡；`getFixedSummary(month)` 分支出/收入汇总
- **自定义分类规则**：新表 `custom_rules`（keyword UNIQUE），`RuleManager` 设置页管理；规则优先于内置关键词，InputBar 提交时实时读取
- **分类管理输入法图标**：图标输入框 + 实时预览，支持任意文字/表情
- **备份恢复**：JSON 备份新增 `custom_rules` / `fixed_items` 字段；导入保留固定项 id（依赖 `[固定] #id` 标记一致性）

### 结果
- 测试：229/229 通过（100%）——中文金额、多项切分、固定收支幂等、自定义规则全链路覆盖
- `tsc --noEmit`：无新增错误（29 个均为既有历史问题）
- 版本 1.0.1 → 1.1.0

### 待真机验证
- 冷启动生成到期固定记录且二次打开不重复；「打球30买水5」弹预览面板；「台球→娱乐」自定义规则；总收入卡显示

---

## 2026-10-14 — APK Release 打包成功 ✅

### 目标
- 将「移除本地 Ollama、AI 仅云端 API」的更新项目打包为独立可安装 APK

### 构建
- 本地 Gradle `assembleRelease`：**BUILD SUCCESSFUL in 7m 1s**（JDK 21 / Gradle 9.3.1）
- 产物：`android/app/build/outputs/apk/release/app-release.apk`（约 96MB，V2 签名，Android Debug 证书）
- 含 4 架构（armeabi-v7a / arm64-v8a / x86 / x86_64）+ 内嵌 Hermes 字节码 bundle（4MB）
- 校验：bundle 含 `api.deepseek.com`（新占位符）、无 `localhost:11434`/`qwen2.5` 残留

### 备注（本机网络限制）
- `dl.google.com` 无法访问（DNS 失败）→ 依赖的 Google Maven artifact 无法下载
- `android/build.gradle` 追加阿里云 Google 镜像兜底（`maven.aliyun.com/repository/google`）
- 缺失的 `kotlin-compiler-31.12.0.jar` / `activity-ktx-1.7.0.aar` 用 curl 预取入 Gradle 缓存（构建期 DNS 闪断问题）

---

## 2026-10-14 — 移除本地 Ollama，AI 仅云端 API

### 目标
- 移除本地 Ollama AI 支持，AI 解析仅保留「规则引擎 + 云端 OpenAI 兼容 API」

### 变更
- AI 默认配置（apiUrl / apiKey / model）由本地 Ollama 改为空值：**apiUrl 留空 = AI 未启用**
- `parseWithAI` / `testConnection` 新增快速失败：未配置 API 地址时不发起任何网络请求、不等待超时
- 设置页占位符与说明改为云端示例（DeepSeek `https://api.deepseek.com/v1` / `deepseek-chat` 等）
- 清理应用介绍 / 日志中的 Ollama 引用；测试更新（171 → 170 用例）

---

## 2026-09-30 — APK 本地打包成功 ✅

### 目标
- 将应用打包为安卓可安装的独立 APK 安装包

### EAS 云构建（已放弃）
- 累计 10+ 次失败：Node IPv6 超时、npm ci 锁文件冲突、上传缓存不刷新（详见 07-21 Day 6 日志）
- 转本地 Gradle 构建：`expo prebuild` 生成 `android/` 原生工程（Gradle 9.3.1 + AGP 8.5 + SDK 35）

### 构建阻塞点：JDK 26 与 AGP 8.5 不兼容
- 系统唯一完整 JDK 为 Oracle JDK 26.0.1（`/run/host/rootfs/usr/lib/jvm/`）
- JDK 26 的 `jlink` 新增「工作版本」签名检查，拒绝处理 AGP 8.5 从 Android SDK 生成的 `java.base.jmod`
- 现象：所有模块编译在 JdkImageTransform 阶段 5 秒内必挂（`react-native-safe-area-context`、`screens`、`svg` 等全部模块）
- 排查确认：VS Code 自带 JDK 21 残缺（有 javac 但无 jlink/jmods），不可用

### 解决方案
1. 清华 TUNA 镜像下载 **Temurin JDK 21.0.12.1**（完整版，~207MB）→ 解压到 `/home/lenovo/Android/jdk21`
2. `gradle.properties`：守护进程 `org.gradle.java.home` 指向 JDK 21（AGP 8.5 标准配置）
3. RN Gradle 插件 6 处 `jvmToolchain(26)` → `(21)`（含 `JdkConfiguratorUtils.kt`）
   - 顺带避开陷阱：旧配置下 Gradle 不识别已装的 Oracle 26.0.1，改为从仓库缓慢自动下载新版 JDK 26.0.2.1（卡死数十分钟）
4. 清理 `~/.gradle/jdks` 残留的 `.part`/`.lock` 下载文件

### 结果
- **BUILD SUCCESSFUL in 7m 13s**（267 个任务：130 执行 / 137 缓存命中）
- 产物：`android/app/build/outputs/apk/debug/app-debug.apk`（195MB，debug 版，含 armeabi-v7a / arm64-v8a / x86 / x86_64 四种架构）
- 安装方式：传输到手机直接安装（需允许「未知来源」）

### 备注
- debug 版体积较大（195MB）；后续可用同一 debug 签名配置打 release 版（约 40-60MB）
- JDK 21 保留于 `/home/lenovo/Android/jdk21`，下载压缩包已删除

---

## 2026-07-21 — 真机调试 & 稳定性修复

### 崩溃修复
- **Hermes 引擎 SIGSEGV**：移除 `react-native-reanimated`、`react-native-worklets`、`react-native-gesture-handler`、`react-native-gifted-charts` 等 native 模块
- **NativeWind 移除**：全部组件改用 `StyleSheet`，消除 native CSS 依赖
- **JS 引擎**：最终使用 Hermes（去掉 reanimated babel 插件避免 worklets 崩溃）

### SQLite 修复
- **异步→同步 API**：`openDatabaseAsync` → `openDatabaseSync`，`prepareAsync` → `runSync`/`getFirstSync`/`getAllSync`
- **分类去重**：`name` 列加 `UNIQUE` 约束 + 种子清理重复 + `INSERT OR IGNORE`
- **预算删除**：新增 `deleteBudget` API，真正删除行（不再归零占位）

### 键盘避让
- 移除嵌套 `KeyboardAvoidingView`（组件与父级冲突）
- InputBar 改用 `Keyboard.addListener` 监听键盘高度，手动设置 `paddingBottom`

### 多页面同步
- 仪表盘 + 账单页 + 设置页：全部使用 `useFocusEffect` 自动刷新数据
- 记账 → 预算进度条立即更新 → 切页自动同步

### 新增文件
- `tests/` 目录：171 个单元测试（100% 通过）
- `tests/run.mjs`：轻量测试运行器
- `tests/ruleEngine.test.mjs`（50 用例）
- `tests/format.test.mjs`（24 用例）
- `tests/db.test.mjs`（38 用例）
- `tests/ai.test.mjs`（9 用例）
- `tests/integration.test.mjs`（25 用例）
- `tests/colors.test.mjs`（6 用例）
- `tests/store.test.mjs`（14 用例）
- `force-ipv4.js`：Node.js IPv4 修复脚本

### 真机测试
- ADB 无线调试连接 Honor LGE-AN00
- 应用成功运行，无崩溃

---

## 2026-07-21 (Day 7) — 第二阶段：功能增强 ✅

### 2.1 账单编辑
- 新增 `EditExpenseModal` 组件：点击账单卡片弹出编辑弹窗
- 支持修改：金额、分类（Picker 选择）、描述、日期
- 点击保存 → `updateExpense` → 刷新列表

### 2.2 分类管理
- 新增 `CategoryManager` 组件（设置页）
- 添加自定义分类：名称 + emoji 图标 + 颜色 + 支出/收入类型
- 删除自定义分类（默认分类保护，不可删除）
- 新增 `deleteCategory` API

### 2.3 数据备份恢复
- **JSON 完整备份**：导出全部数据（分类 + 账单 + 预算 + 设置）
- **JSON 恢复**：导入备份文件，自动去重，确认对话框
- 新增 `exportAllData` / `importAllData` API

### 2.4 预算周期管理
- 新增 `BudgetManager` 组件（设置页）
- 支持周/月/年三种周期
- 预算进度条 + 超支/预警提示
- 可删除已设预算

### 新增文件
- `src/components/EditExpenseModal.tsx`
- `src/components/CategoryManager.tsx`
- `src/components/BudgetManager.tsx`

---

## 2026-07-21 (Day 6) — 转向单元测试 & 完善核心逻辑

### 决策
- 经过 5 种真机/模拟器测试方案后，全部因网络或环境限制失败
- **决定放弃 UI 环境测试，聚焦纯逻辑单元测试和代码完善**

### 测试策略
- 规则引擎测试（`test-day3.mjs`）：44/44 通过 ✅
- 扩展测试覆盖：数据库操作、格式化工具、AI 服务 Mock、Zustand Store

### 当前状态
- 代码：完整可运行 ✅
- 规则引擎：44/44 测试通过 ✅
- 本地 Metro：打包成功 ✅

---

## 2026-07-21 (Day 6) — EAS 云构建 & 网络问题（已放弃）

### EAS 云构建尝试
- **环境**：安装 `eas-cli@21.0.2`，通过 Access Token 登录 `@lumos0726/smart-ledger`
- **Node.js IPv6 问题**：Node.js 默认 IPv6 优先，`api.expo.dev` 的 IPv6 超时（ETIMEDOUT），需要 `force-ipv4.js` 脚本强制 IPv4
- **依赖冲突**：EAS 云端 `npm ci` 严格模式下，`react-dom@19.2.7` 与 `react@19.2.3` 版本冲突
  - 移除 `react-dom` → 锁文件不匹配
  - 版本对齐 `react-dom@19.2.3` → 上传缓存问题
- **上传缓存**：EAS 项目压缩包大小始终为 597KB，疑似云端缓存不刷新
- 累计 10+ 次构建均失败 ❌

### 发现的其他问题
- UEngine 系统 Android 7.1.2（SDK 25），Expo SDK 57 需要 SDK 26+，不兼容
- Google Cloud Storage 部分 IP 被墙（`142.250.73.155:443` 拒绝连接）
- 无 `/dev/kvm`，Android 模拟器不可用

### 当前状态
- 代码：完整可运行 ✅
- 规则引擎：44/44 测试通过 ✅
- 本地 Metro：打包成功 ✅
- 真机/模拟器测试：0/5 方案可用 ❌

---

## 2026-07-20 (Day 5) — UEngine 模拟器测试

### UEngine 环境搭建
- **UEngine**：Deepin/UOS 的 Android 容器（基于 Anbox），x86_64 架构
- **ADB 连接**：`adb connect 192.168.250.2:5555` → 成功，设备 `uengine / anbox_x86_64`
- **ADB 授权**：将公钥写入 `/data/uengine/data/data/misc/adb/adb_keys`
- **端口转发**：`adb reverse tcp:8081 tcp:8081`

### Expo Go 安装
- **下载**：GitHub `Expo-Go-57.0.2.apk`（208MB），网速慢多次超时，最终手动下载到 `/home/lenovo/迅雷下载/`
- **安装**：`adb install` → Success
- **启动**：`adb shell am start exp://localhost:8081` → Metro 打包成功（4058 modules, 20s）

### Bug 修复
- 修复 `settings.tsx:129` 模板字符串语法错误（反引号开头单引号结尾）

### 基础设施
- Android SDK 安装到 `/home/lenovo/Android/`（cmdline-tools + platform-tools）
- `./android` 原生项目已生成（expo prebuild）

---

## 2026-07-16 (Day 4) — 真机调试 & 多方案探索

### Expo Go 连接调试（未解决）
- **USB 网络共享** (`192.168.233.125:8081`)：手机可发现服务器，Metro 打包正常（HTTP 200），但应用无法加载
- **Tunnel 模式**：安装 `@expo/ngrok@^4.1.0`，隧道 URL `exp://iq_5owg-anonymous-8081.exp.direct`，问题依旧
- **最小化测试**：简化 `_layout.tsx` 和三个 Tab 页面为纯 Text（移除 NativeWind/Zustand/SQLite/Gifted Charts 等），仍无法打开
- **结论**：非代码问题，Expo Go 与 SDK 57 或当前网络环境存在兼容问题

### Web 平台尝试
- 安装 `react-native-web` + `react-dom`（`--legacy-peer-deps`）
- 因 `expo-sqlite` 依赖 WASM 文件 (`wa-sqlite.wasm`) 无法在 web 平台解析，且 react 版本不一致（19.2.3 vs react-dom 19.2.7），放弃

### Android 模拟器尝试
- **SDK 安装**：下载 Android SDK command-line tools → 安装到 `/home/lenovo/Android/`
  - `platform-tools` (8.8MB) — curl 直接下载
  - `emulator` (819MB) — sdkmanager
  - `system-images;android-35;google_apis;x86_64` (1.7GB) — curl 直接下载（sdkmanager 超时）
- **AVD 创建**：Pixel 6 + Android 35 + Google APIs x86_64
- **启动结果**：无 `/dev/kvm`（容器环境），软件模拟极慢，10+ 分钟未完成引导，放弃
- **ADB TCP/IP**：尝试 `adb connect 192.168.233.1:5555` 超时，手机未开启 USB 调试

### 新增依赖
- `react-native-web`、`react-dom`、`@expo/metro-runtime`（web 测试，未成功）
- `@expo/ngrok@^4.1.0`（tunnel 模式）

### 当前状态
- 规则引擎：44/44 测试通过 ✅
- AI 服务：代码就绪 ✅
- Expo Go：无法加载 ❌
- Web：expo-sqlite 不支持 ❌
- Android 模拟器：无 KVM 不可用 ❌
- **测试方案：待定（USB 调试 / EAS 云构建）**

---

## 2026-07-16 (Day 3) — 规则引擎 & 测试

### 完成内容
- **规则引擎** (`src/services/ruleEngine.ts`)：用正则 + 关键词匹配实现离线自然语言解析
  - 金额提取：支持 `X元/块/¥`、`花了X`、`¥X` 等格式
  - 分类匹配：10 大类共 100+ 关键词覆盖
  - 日期识别：支持「昨天」「前天」「X月X日」
  - 描述提取：自动去除金额和日期词
- **解析流程**：`InputBar` 先走规则引擎（离线），失败再降级到 AI，再失败弹手动提示
- **测试脚本** (`test-day3.mjs`)：44 个测试用例，覆盖全部 10 个分类
- **关键词修复**：修复 `充值`、`红包`、`洗发水`、`日用品`、`宽带`、`菜市场` 等误分类问题

### 当前状态
- 规则引擎：44/44 测试通过 ✅
- AI 服务：代码就绪，接入云端 OpenAI 兼容 API（DeepSeek / OpenAI / 通义千问）；API 地址留空即仅使用规则引擎
- 设置页：支持配置 API 地址/Key/模型，支持测试连接

---

## 2026-07-15 (Day 2) — 核心功能 & UI

### 完成内容
- **三个自定义 Hook**：
  - `useExpenses`：账单 CRUD + 分页查询 + 搜索
  - `useBudget`：预算读写 + 已消费金额统计
  - `useStats`：统计概览 + 分类占比 + 日趋势
- **UI 组件**：
  - `ExpenseCard`：账单卡片，长按删除
  - `StatCard`：统计指标卡，支持环比趋势箭头
  - `InputBar`：底部智能输入框，支持规则引擎 + AI 双通道解析
- **图表组件**：(基于 react-native-gifted-charts)
  - `CategoryPieChart`：环形图，分类占比 + 中心总金额
  - `DailyLineChart`：折线图，每日消费趋势
  - `BudgetProgressBar`：预算进度条，80%/100% 阈值变色
- **三个 Tab 页面**：
  - 仪表盘 (`index.tsx`)：统计卡片 + 分类饼图 + 日趋势 + 预算预警
  - 账单 (`records.tsx`)：按月分组列表 + 搜索 + 长按删除
  - 设置 (`settings.tsx`)：AI 配置 + CSV 导入/导出 + 关于
- **AI 服务** (`src/services/ai.ts`)：OpenAI 兼容 API 调用，Function Calling 结构化输出
- **Zustand 状态管理** (`stores/settingsStore.ts`)：AI 配置持久化到 SQLite

---

## 2026-07-14 (Day 1) — 项目初始化

### 完成内容
- 使用 `create-expo-app` 初始化 Expo SDK 57 项目
- 安装依赖：NativeWind、expo-router、expo-sqlite、zustand、gifted-charts、openai、lucide-react-native 等
- **TypeScript 类型定义** (`src/types/index.ts`)：Category、Expense、Budget、StatsOverview、CategoryStats、DailyTrend、AIConfig、ParsedExpense
- **SQLite 数据库** (`src/services/db.ts`)：
  - 建表：categories、expenses、budgets、settings
  - 索引：expense_date + category_id
  - 种子数据：10 个默认分类（8 支出 + 1 收入 + 1 其他）
  - CRUD 操作：账单增删改查、分类管理、预算管理、统计查询、设置读写
- **工具函数** (`src/utils/`)：format.ts（金额/日期/月份格式化）、colors.ts（分类颜色映射）
- **Tailwind 主题配置**：自定义色板（primary、danger、success、warning、bg、card、text 等）
- Expo Router 路由框架：`app/_layout.tsx` + `app/(tabs)/_layout.tsx`（lucide 图标 TabBar）