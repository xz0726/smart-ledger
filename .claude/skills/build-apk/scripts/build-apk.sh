#!/usr/bin/env bash
# SmartLedger → APK 一键打包（本机环境适配版）
# 用法:
#   build-apk.sh                              # release 构建 + 产物校验
#   build-apk.sh --variant debug              # debug 构建（不内嵌 JS，仅供联调）
#   build-apk.sh --expect "api.deepseek.com" --forbid "localhost:11434,qwen2.5"
#   build-apk.sh --iterations 5               # 下载失败重试/预取循环次数（默认 3）
#   build-apk.sh --log /tmp/apk-build.log     # 指定构建日志路径
#   build-apk.sh --arch all                   # 打全部 ABI（默认只打 arm64-v8a，体积约减 65MB）
#   build-apk.sh --arch arm64-v8a,armeabi-v7a # 兼容 32 位老设备
#   build-apk.sh --keep-metro                 # 构建前不停 Expo dev server（默认会停）
#   build-apk.sh --use-daemon                 # 保留 Gradle 守护进程（默认 --no-daemon）
set -uo pipefail

# ---------- 默认值 / 环境事实（本机） ----------
PROJECT="${SMART_LEDGER_HOME:-$HOME/Desktop/ai开发/smart-ledger}"
NODE_DIR="/tmp/pw/playwright/driver"          # node 不在 PATH，需显式前缀（旧位置）
# 本机 node 曾迁移：优先 /tmp 旧路径，其次 ~/.local/node/bin
if [[ ! -x "$NODE_DIR/node" && -x "$HOME/.local/node/bin/node" ]]; then
  NODE_DIR="$HOME/.local/node/bin"
fi
JAVA_HOME_DIR="/home/lenovo/Android/jdk21"    # AGP 8.5 需要 JDK 21
ANDROID_SDK="$HOME/Android"
MIRROR_BASE="https://maven.aliyun.com/repository/google"   # dl.google.com 不可达时的兜底
CACHE_DIR="$HOME/.gradle/caches/modules-2/files-2.1"
VARIANT="release"
ARCH="arm64-v8a"      # 默认只打 arm64；真机几乎全是 arm64，省 ~65MB。all = 全部 ABI
EXPECT=""
FORBID=""
ITERATIONS=3
LOG="/tmp/apk-build.log"
KEEP_METRO=0   # 默认构建前停掉 Expo dev server/Metro，避免与本机 16G 内存争抢
USE_DAEMON=0   # 默认 --no-daemon，构建结束立即释放 JVM

while [[ $# -gt 0 ]]; do
  case "$1" in
    --variant)    VARIANT="$2"; shift 2 ;;
    --arch)       ARCH="$2";    shift 2 ;;
    --expect)     EXPECT="$2";  shift 2 ;;
    --forbid)     FORBID="$2";  shift 2 ;;
    --iterations) ITERATIONS="$2"; shift 2 ;;
    --log)        LOG="$2";     shift 2 ;;
    --keep-metro) KEEP_METRO=1; shift ;;
    --use-daemon) USE_DAEMON=1; shift ;;
    -h|--help)    sed -n '1,16p' "$0"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

fail() { echo "❌ $*" >&2; exit 1; }
info() { echo "• $*"; }

# 停掉 Expo dev server / Metro（node），避免构建时抢内存/CPU
# 本机没有 ss，按进程名扫描；node 进程的 comm 在某些环境下显示为 MainThread
stop_metro() {
  local pids="" pid cmd comm alive i killed=()
  if command -v ss >/dev/null 2>&1; then
    pids=$(ss -ltnp 2>/dev/null | awk '$4 ~ /:(8081|8083|19000|19001)$/ {print}' \
           | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
  fi
  if [[ -z "$pids" ]]; then
    for pid in $(pgrep -f "expo/bin/cli|@expo/cli|node_modules/.bin/expo|metro" 2>/dev/null); do
      comm=$(ps -o comm= -p "$pid" 2>/dev/null)
      [[ "$comm" == "node" || "$comm" == "MainThread" ]] || continue
      pids+="$pid "
    done
    pids=$(echo $pids | tr ' ' '\n' | sort -u)
  fi
  if [[ -z "$pids" ]]; then
    info "未发现 Metro/Expo dev server"
    return 0
  fi
  for pid in $pids; do
    cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
    if [[ "$cmd" == *expo* || "$cmd" == *metro* ]]; then
      info "停止 Expo dev server (pid=$pid)"
      if kill -TERM "$pid" 2>/dev/null; then killed+=("$pid"); fi
    fi
  done
  if [[ ${#killed[@]} -eq 0 ]]; then
    info "未发现 Metro/Expo dev server"
    return 0
  fi
  for i in $(seq 1 10); do
    alive=0
    for pid in "${killed[@]}"; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [[ "$alive" == 0 ]] && break
    sleep 1
  done
  for pid in "${killed[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      info "强制结束 pid=$pid"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
}

# ---------- 1. 环境检查 ----------
[[ -x "$NODE_DIR/node" ]]          || fail "Node 不存在: $NODE_DIR/node（本机 node 位于此处）"
[[ -x "$JAVA_HOME_DIR/bin/java" ]] || fail "JDK 21 不存在: $JAVA_HOME_DIR/bin/java"
[[ -d "$PROJECT/android" ]]        || fail "缺少 android/ 原生工程（先执行 npx expo prebuild）"
[[ -f "$PROJECT/android/gradlew" ]] || fail "缺少 gradlew"
info "环境检查通过: node=$( "$NODE_DIR/node" -v ) java=$("$JAVA_HOME_DIR/bin/java" -version 2>&1 | head -1)"

# ---------- 2. 仓库镜像兜底（幂等） ----------
BG="$PROJECT/android/build.gradle"
if ! grep -q "maven.aliyun.com/repository/google" "$BG"; then
  info "注入阿里云 Google 镜像兜底（dl.google.com 本机不可达）"
  cp "$BG" "$BG.bak"
  # 在每个 mavenCentral() 之后插入镜像（buildscript + allprojects 各一处）
  sed -i "/mavenCentral()/a\\    maven { url 'https://maven.aliyun.com/repository/google' }" "$BG"
  grep -q "maven.aliyun.com/repository/google" "$BG" || fail "镜像注入失败，请手动编辑 $BG"
else
  info "仓库镜像已就绪"
fi

# ---------- 3. 预清理：旧 Gradle 守护进程 + Expo dev server ----------
# 本机 16G 内存，多个 -Xmx2g 守护进程与 Metro 同时驻留会触发 swap 抖动（构建曾 21 分钟且整机卡）
info "停止已有 Gradle 守护进程"
JAVA_HOME="$JAVA_HOME_DIR" PATH="$NODE_DIR:$PATH" "$PROJECT/android/gradlew" --stop >/dev/null 2>&1 || true
if [[ "$KEEP_METRO" == 0 ]]; then
  stop_metro
else
  info "保留 Metro/Expo dev server（--keep-metro）"
fi

# ---------- 4. 预取缺失 artifact（curl 比 Gradle 更能扛 DNS 闪断） ----------
seed_one() {  # group artifact version file
  local g="$1" a="$2" v="$3" f="$4"
  local rel="${g//./\/}/$a/$v/$f"
  local url="$MIRROR_BASE/$rel"
  local out="/tmp/gradle-seed-$a-$v-$f"
  local i sz
  for i in $(seq 1 12); do
    if curl -fsSL --connect-timeout 10 -o "$out" "$url"; then
      sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
      [[ "$sz" -gt 10240 ]] && break
    fi
    rm -f "$out"; sleep 2
  done
  [[ -s "$out" ]] || { echo "  ✗ 预取失败: $g:$a:$v ($f)"; return 1; }
  sz=$(stat -c%s "$out"); echo "  ✓ 预取 $a-$v ($((sz/1024))KB)"
  local sha1; sha1=$(sha1sum "$out" | awk '{print $1}')
  mkdir -p "$CACHE_DIR/$g/$a/$v/$sha1"
  cp "$out" "$CACHE_DIR/$g/$a/$v/$sha1/$f"
  # 顺带缓存 pom
  local pom="$a-$v.pom" pomout="/tmp/gradle-seed-$a-$v.pom"
  if curl -fsSL --connect-timeout 10 -o "$pomout" "$MIRROR_BASE/$rel.pom" 2>/dev/null; then
    local psha1; psha1=$(sha1sum "$pomout" | awk '{print $1}')
    mkdir -p "$CACHE_DIR/$g/$a/$v/$psha1"
    cp "$pomout" "$CACHE_DIR/$g/$a/$v/$psha1/$pom"
  fi
  rm -f "$out" "$pomout"
  return 0
}

# 从 gradle 失败日志解析缺失的 artifact 并预取
prefetch_from_log() {  # $1 = 日志文件
  local missing ok=0
  missing=$(grep -oE "Could not download [^ ]+ \([^)]+\)" "$1" 2>/dev/null \
            | sed -E "s/Could not download ([^ ]+) \(([^:]+):([^:]+):([^)]+)\)/\2 \3 \4 \1/" | sort -u)
  [[ -z "$missing" ]] && return 0
  local spec g a v f
  while IFS= read -r spec; do
    [[ -z "$spec" ]] && continue
    read -r g a v f <<< "$spec"
    seed_one "$g" "$a" "$v" "$f" && ok=1
  done <<< "$missing"
  [[ "$ok" == 1 ]]
}

# ---------- 4. 构建（失败自动预取重试循环） ----------
cd "$PROJECT/android"
ARCH_ARGS=()
if [[ "$ARCH" != "all" ]]; then
  ARCH_ARGS=("-PreactNativeArchitectures=$ARCH")
  info "ABI 过滤: $ARCH（省略其它架构的原生库）"
fi
DAEMON_ARGS=("--no-daemon")   # 构建结束立即释放 JVM，避免守护进程长期占内存
[[ "$USE_DAEMON" == 1 ]] && DAEMON_ARGS=() && info "使用 Gradle 守护进程（--use-daemon）"
BUILD_OK=0
for attempt in $(seq 1 "$ITERATIONS"); do
  info "构建 attempt $attempt/$ITERATIONS (variant=$VARIANT)"
  JAVA_HOME="$JAVA_HOME_DIR" PATH="$NODE_DIR:$PATH" ./gradlew "assemble$VARIANT" "${ARCH_ARGS[@]}" "${DAEMON_ARGS[@]}" --console=plain > "$LOG" 2>&1
  if grep -q "BUILD SUCCESSFUL" "$LOG"; then BUILD_OK=1; break; fi
  if grep -qE "Could not download|Could not HEAD" "$LOG"; then
    info "网络/artifact 下载失败，预取后重试"
    prefetch_from_log "$LOG" >/dev/null 2>&1
    continue
  fi
  echo "--- 构建失败（日志尾部）---"; tail -20 "$LOG"
  break
done
[[ "$BUILD_OK" == 1 ]] || fail "构建未成功，完整日志: $LOG"

# ---------- 5. 产物定位 ----------
APK=$(ls -t "$PROJECT/android/app/build/outputs/apk/$VARIANT/"*.apk 2>/dev/null | head -1)
[[ -n "$APK" ]] || fail "未找到 APK 产物: outputs/apk/$VARIANT/"
info "产物: $APK  ($(du -h "$APK" | cut -f1))"

# ---------- 6. 校验 ----------
# 6a. JS bundle 是否内嵌
# 注意: set -o pipefail 下不能用 `grep -q`（其提前关闭管道会让 unzip 收到 SIGPIPE=141，整条管道判失败）。
# 用 `grep -F ... >/dev/null`（读完输入）替代。
BUNDLE_NAME=""
if unzip -l "$APK" 2>/dev/null | grep -F "assets/index.android.bundle" >/dev/null; then
  BUNDLE_NAME="assets/index.android.bundle"
fi
if [[ -n "$BUNDLE_NAME" ]]; then
  info "✓ JS bundle 已内嵌 → $VARIANT 包可独立运行（无需 Metro）"
else
  info "⚠ 未内嵌 JS bundle（$VARIANT 若为 debug 属正常，装上需连 Metro）"
fi

# 6b. 更新代码标记校验（注意: Hermes 字节码中非 ASCII 字符串无法被 grep 到）
if [[ -n "$EXPECT$FORBID" && -n "$BUNDLE_NAME" ]]; then
  rm -rf /tmp/apk-bundle-check; mkdir -p /tmp/apk-bundle-check
  unzip -o -q "$APK" "$BUNDLE_NAME" -d /tmp/apk-bundle-check 2>/dev/null
  B="/tmp/apk-bundle-check/$BUNDLE_NAME"
  [[ -n "$EXPECT" ]] && for m in ${EXPECT//,/ }; do
    grep -qF "$m" "$B" && info "✓ 含标记: $m" || info "⚠ 未找到标记: $m（若为中文串属正常，hbc 不暴露非 ASCII）"
  done
  RESIDUE=0
  [[ -n "$FORBID" ]] && for m in ${FORBID//,/ }; do
    grep -qF "$m" "$B" && { echo "❌ 残留标记: $m"; RESIDUE=1; } || info "✓ 无残留: $m"
  done
  [[ "$RESIDUE" == 1 ]] && fail "APK 内发现禁用字符串残留"
fi

# 6c. 签名校验（apksigner 需 java 在 PATH）
for bt in "$ANDROID_SDK"/build-tools/*/apksigner; do
  if [[ -x "$bt" ]] && PATH="$JAVA_HOME_DIR/bin:$PATH" "$bt" verify --print-certs "$APK" >/tmp/apk-sign.txt 2>&1; then
    info "✓ 签名有效: $(grep -oE 'certificate DN: .*' /tmp/apk-sign.txt | head -1)"
    break
  fi
done

# 6d. ABI 校验（确保只打入指定架构；--arch all 时跳过）
if [[ "$ARCH" != "all" ]]; then
  FOUND_ABIS=$(unzip -l "$APK" 2>/dev/null | grep -oE 'lib/[^/]+/' | sed -E 's|lib/([^/]+)/|\1|' | sort -u)
  BAD_ABIS=$(comm -23 <(echo "$FOUND_ABIS") <(echo "$ARCH" | tr ',' '\n' | sort -u) | tr '\n' ' ')
  if [[ -n "${BAD_ABIS// /}" ]]; then
    echo "❌ APK 内含未授权 ABI: $BAD_ABIS"
    fail "ABI 过滤未生效"
  fi
  info "✓ ABI 仅含: $(echo $FOUND_ABIS | tr '\n' ' ')"
fi

echo "✅ 打包完成"
