---
name: build-apk
description: 把 SmartLedger（Expo SDK 57 / RN 0.86）本地打包成独立可安装的 Android APK。封装了本机环境适配（JDK 21、node 不在 PATH、dl.google.com 不可达、DNS 闪断）与产物校验。使用: /build-apk
---

# 打包 APK

## 何时使用
用户要求「打包成 APK」「构建安卓安装包」「生成 app-release.apk」时使用。本 skill 产出**独立可安装**的 APK（内嵌 JS bundle、含签名）。

## 关键决策

- **必须构建 release 变体**（`assembleRelease`）。debug 变体因 `debuggableVariants` 默认跳过 JS 打包，**不内嵌 bundle**，装上手机无法独立运行（需连 Metro）。产物比 debug 小一半（约 96MB vs 195MB）。
- **默认只打 arm64-v8a**（脚本传 `-PreactNativeArchitectures=arm64-v8a`），APK 约 45MB；四架构全打约 110MB。真机几乎全是 arm64。需兼容 32 位老设备时用 `--arch arm64-v8a,armeabi-v7a`；需 x86 模拟器或全架构用 `--arch all`。
- 产物路径：`android/app/build/outputs/apk/release/app-release.apk`
- release 使用 debug 证书签名（`android/app/build.gradle` 的 `release { signingConfig signingConfigs.debug }`），可直接「未知来源」安装，无需自备 keystore。
- **控制内存峰值**：本机 16G 内存会因构建卡顿（实测 release 构建 21 分钟且整机卡）。脚本默认在构建前 `./gradlew --stop`、停掉 Expo dev server，并用 `--no-daemon`；`gradle.properties` 已设 `org.gradle.parallel=false` 与 `org.gradle.workers.max=4`。需要保留 Metro 或守护进程时用 `--keep-metro` / `--use-daemon`。

## 本机环境事实（重要）

| 项 | 值 | 说明 |
|---|---|---|
| JDK | `/home/lenovo/Android/jdk21` | AGP 8.5 不兼容系统 JDK 26，必须用 21。已写入 `android/gradle.properties` 的 `org.gradle.java.home`；但 `gradlew` 启动仍需显式设 `JAVA_HOME` |
| Node | `~/.local/node/bin/node`（v24；旧路径 `/tmp/pw/playwright/driver/node` 已不存在） | 不在 PATH。gradle react 插件与 `export:embed` 都要调用 `node`，构建时须前置 PATH。脚本已自动探测两处 |
| Android SDK | `/home/lenovo/Android` | 已写入 `android/local.properties` (`sdk.dir`) |
| Gradle | wrapper 9.3.1（已缓存） | 用 `./gradlew`，勿直接调 `gradle` |
| **网络** | `dl.google.com` DNS 不可达 | Google Maven artifact 无法从官方源下载 |
| **网络** | `maven.aliyun.com` 可用但构建期 DNS 间歇闪断 | 长构建中偶发 "Name or service not known" |
| **内存** | 15.9GB RAM + 16GB swap | 构建叠加 3 个 Gradle 守护进程、Kotlin 守护进程、16 路 clang、Hermes node、aapt2，峰值超过物理内存 → swap 抖动、整机卡顿。脚本已默认降并发/停 Metro/`--no-daemon` |

## 标准流程

### 1. 环境检查
```bash
[[ -x ~/.local/node/bin/node ]] && echo ok   # 或旧路径 /tmp/pw/playwright/driver/node
[[ -x /home/lenovo/Android/jdk21/bin/java ]] && echo ok
[[ -d android ]] && echo ok
```

### 2. 仓库镜像兜底（幂等）
本机无法访问 `dl.google.com`。需在 `android/build.gradle` 的 `buildscript.repositories` 与 `allprojects.repositories` 各加一行镜像，**置于 `google()` 和 `mavenCentral()` 之后**（关键！）：

```gradle
maven { url 'https://maven.aliyun.com/repository/google' }
```

> 顺序即一切：镜像放前面会导致 Gradle 对所有已缓存模块重新归因并触发全量网络校验（上次因此多跑 30 分钟并踩 DNS 闪断）。放最后则只对真正缺失的 Google artifact 生效。

### 3. 构建（先清理内存占用）
```bash
cd android
JAVA_HOME=/home/lenovo/Android/jdk21 PATH=~/.local/node/bin:$PATH ./gradlew --stop   # 释放旧守护进程
# 停掉 Expo dev server / Metro（占用 1GB+，与本构建争内存）
JAVA_HOME=/home/lenovo/Android/jdk21 PATH=~/.local/node/bin:$PATH \
  ./gradlew assembleRelease --no-daemon --console=plain
```
- 一键脚本已自动完成上述两步（`--stop` + 停 Metro），并传 `--no-daemon`。
- `gradle.properties` 已设 `org.gradle.parallel=false`、`org.gradle.workers.max=4`，避免 16 线程 + 多 JVM 打满内存。
- 用 `run_in_background` 跑，日志写到 `/tmp/apk-build.log`；正常约 5-10 分钟。内存受控后可避免实测出现的 21 分钟 + 整机卡顿。
- 初次构建需要为 release 变体重新编译 CMake 原生模块（当前只打 arm64-v8a），无法复用 debug 缓存。

### 4. 失败自动处理（脚本已内置，手动构建时参考）
- **`Could not download X (group:artifact:version)`**：该 jar 不在 Gradle 缓存且 dl.google.com 不可达。用 curl 从 aliyun 预取并塞进缓存（Gradle 缓存按 `files-2.1/<group>/<artifact>/<version>/<sha1>/<file>` 存放，sha1 为文件内容 sha1），然后重试。
- **`Could not HEAD ...  Name or service not known`**：DNS 闪断，直接重试构建即可（多为瞬时）。
- **网络外的真实编译错误**：不要盲目重试，先看日志尾部。

### 5. 产物校验（清单）
1. 日志含 `BUILD SUCCESSFUL`。
2. `ls android/app/build/outputs/apk/release/app-release.apk` 存在。
3. **JS bundle 内嵌**：`unzip -l <apk> | grep assets/index.android.bundle`（Hermes 字节码，约 4MB）。
3b. **ABI 过滤生效**：`unzip -l <apk> | grep -oE 'lib/[^/]+/' | sort -u` 只应出现指定架构（默认 `lib/arm64-v8a/`）。脚本已自动校验。
4. **更新代码确认**：解出 bundle 后检查 ASCII 标记串（如新占位符 `api.deepseek.com`），并确认无禁用串残留（如 `localhost:11434` / `qwen2.5`）。
   - ⚠ 限制：Hermes 字节码中**非 ASCII 字符串（中文）无法被 grep/strings 找到**，只能校验 ASCII 标记。
5. **签名**：`PATH=/home/lenovo/Android/jdk21/bin:$PATH /home/lenovo/Android/build-tools/*/apksigner verify --print-certs <apk>`，应显示 `CN=Android Debug`。

## 一键脚本

```bash
.claude/skills/build-apk/scripts/build-apk.sh
# 校验更新代码标记:
.claude/skills/build-apk/scripts/build-apk.sh \
  --expect "api.deepseek.com" \
  --forbid "localhost:11434,qwen2.5"
# 保留 Metro / Gradle 守护进程（默认都会被停用）
.claude/skills/build-apk/scripts/build-apk.sh --keep-metro --use-daemon
```
脚本自动执行：环境检查 → 镜像兜底 → 构建（失败自动预取缺失 artifact 并重试，默认 3 轮）→ 产物定位 → bundle/标记/签名校验。

**项目路径**：默认 `$HOME/Desktop/ai开发/smart-ledger`，可用环境变量 `SMART_LEDGER_HOME` 覆盖（skill 也可用于其它 Expo 工程）。

## 调试速查

| 现象 | 处理 |
|---|---|
| `JAVA_HOME is not set and no 'java' command` | 构建时设 `JAVA_HOME=/home/lenovo/Android/jdk21` |
| `Cannot run program "node"` | PATH 前加 `/tmp/pw/playwright/driver` |
| `extractReleaseAnnotations FAILED` + `dl.google.com` | 是缺 lint 工具 jar；补镜像 + 预取，任务本身非致命但会终止构建 |
| `generateReleaseLintModel FAILED` | 同上，release 变体 runtime classpath 里未缓存的 Google artifact 需预取 |
| Hermes 中文串查不到 | 正常，hbc 串表编码，用 ASCII 标记校验 |
