package com.smartledger.app.notification

import android.content.Context
import android.content.SharedPreferences
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.CopyOnWriteArrayList
import org.json.JSONArray

/**
 * 通知捕获事件总线：Service 与 JS 桥模块解耦。
 * - emit：通知使用权 Service 收到支付类通知时调用，分发给已注册的 JS 桥
 * - buffer：SharedPreferences 落盘缓冲——App 被杀时收到通知也能在下次打开时取出（防丢）
 */
object PaymentCaptureBus {
    private val listeners = CopyOnWriteArrayList<(source: String, title: String?, text: String?) -> Unit>()

    const val PREFS = "payment_capture"
    const val PREF_BUFFER = "buffer_json"
    const val PREF_ENABLED = "capture_enabled"

    // 运行状态（同进程内共享，供 JS 诊断显示）
    @Volatile var connected = false
    @Volatile var eventCount = 0L
    @Volatile var lastEventAt = 0L
    @Volatile var lastPkg = ""
    @Volatile var lastOutcome = ""
    // 只统计微信/支付宝的通知，避免被其它 App 的高频通知覆盖
    @Volatile var targetCount = 0L
    @Volatile var lastTargetAt = 0L
    @Volatile var lastTargetPkg = ""
    @Volatile var lastTargetOutcome = ""
    @Volatile var lastTargetText = ""
    // JS 是否已订阅事件（桥存在 ≠ 有人监听；有人监听时才直投，否则落缓冲）
    @Volatile var jsListening = false

    fun setJsListening(listening: Boolean) {
        jsListening = listening
    }

    fun markEvent(pkg: String, outcome: String) {
        eventCount++
        lastEventAt = System.currentTimeMillis()
        lastPkg = pkg
        lastOutcome = outcome
    }

    fun markTarget(pkg: String, outcome: String, text: String) {
        targetCount++
        lastTargetAt = System.currentTimeMillis()
        lastTargetPkg = pkg
        lastTargetOutcome = outcome
        lastTargetText = if (text.length > 80) text.substring(0, 80) else text
    }

    fun addListener(listener: (source: String, title: String?, text: String?) -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: (source: String, title: String?, text: String?) -> Unit) {
        listeners.remove(listener)
    }

    /** 分发事件；返回 JS 是否真的在监听（否则调用方落盘缓冲，避免丢通知） */
    fun emit(source: String, title: String?, text: String?): Boolean {
        val snapshot = listeners.toList()
        for (l in snapshot) l(source, title, text)
        return jsListening && snapshot.isNotEmpty()
    }

    /** 捕获总开关（持久化在原生侧，App 未启动/被杀时也能生效） */
    fun isEnabled(context: Context): Boolean =
        prefs(context).getBoolean(PREF_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(PREF_ENABLED, enabled).apply()
    }

    fun clearBuffer(context: Context) {
        prefs(context).edit().putString(PREF_BUFFER, "[]").apply()
    }

    /** 把一条捕获追加进落盘缓冲（上限 50 条，超出丢最旧） */
    fun appendBuffer(context: Context, source: String, title: String?, text: String?) {
        val arr = readBuffer(context)
        arr.put(
            org.json.JSONObject()
                .put("source", source)
                .put("title", title ?: "")
                .put("text", text ?: "")
                .put("createdAt", System.currentTimeMillis())
        )
        while (arr.length() > 50) arr.remove(0)
        prefs(context).edit().putString(PREF_BUFFER, arr.toString()).apply()
    }

    fun readBuffer(context: Context): JSONArray {
        return try {
            JSONArray(prefs(context).getString(PREF_BUFFER, "[]") ?: "[]")
        } catch (e: Exception) {
            JSONArray()
        }
    }

    /** 取出并清空缓冲 */
    fun drainBuffer(context: Context): JSONArray {
        val arr = readBuffer(context)
        prefs(context).edit().putString(PREF_BUFFER, "[]").apply()
        return arr
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}

/**
 * 通知使用权 Service：监听支付宝 / 微信通知，过滤支付关键词后分发 + 落盘缓冲。
 * 只读取文本、只本地处理，不发起任何网络请求。
 */
class PaymentNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "SmartLedgerCapture"
        // 支付宝 / 微信包名
        private val TARGET_PACKAGES = setOf("com.eg.android.AlipayGphone", "com.tencent.mm")
        // 支付类关键词：命中才捕获（收付款 / 交易凭证类文案）
        private val PAYMENT_KEYWORDS = listOf("支付", "付款", "收款", "到账", "扣款", "交易")
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        PaymentCaptureBus.connected = true
        PaymentCaptureBus.markEvent("", "connected")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        PaymentCaptureBus.connected = false
        PaymentCaptureBus.markEvent("", "disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            val pkg = sbn.packageName ?: return
            if (pkg !in TARGET_PACKAGES) {
                PaymentCaptureBus.markEvent(pkg, "not_target")
                return
            }

            // 开关关闭时直接在服务端丢弃，App 被杀/未启动也生效
            if (!PaymentCaptureBus.isEnabled(this)) {
                Log.d(TAG, "skip: capture disabled pkg=$pkg")
                PaymentCaptureBus.markEvent(pkg, "disabled")
                PaymentCaptureBus.markTarget(pkg, "disabled", "")
                return
            }

            val extra = sbn.notification?.extras ?: run {
                PaymentCaptureBus.markEvent(pkg, "no_extras")
                PaymentCaptureBus.markTarget(pkg, "no_extras", "")
                return
            }
            val title = extra.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString()
            // 展开态/折叠态正文：BIG_TEXT 优先，补 TEXT + TEXT_LINES（微信服务通知折叠时金额常在这两处）
            val text = extra.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString()
            val bigText = extra.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT)?.toString()
            val subText = extra.getCharSequence(android.app.Notification.EXTRA_SUB_TEXT)?.toString()
            val lines = extra.getCharSequenceArray(android.app.Notification.EXTRA_TEXT_LINES)
                ?.mapNotNull { it?.toString() }
                ?.joinToString("  ")
            val body = listOfNotNull(bigText, text, subText, lines)
                .filter { it.isNotBlank() }
                .joinToString("  ")
            val full = listOfNotNull(title, body).joinToString(" ").trim()
            if (full.isEmpty()) {
                Log.d(TAG, "skip: empty content pkg=$pkg")
                PaymentCaptureBus.markEvent(pkg, "empty")
                PaymentCaptureBus.markTarget(pkg, "empty", "")
                return
            }
            if (PAYMENT_KEYWORDS.none { full.contains(it) }) {
                Log.d(TAG, "skip: no payment keyword pkg=$pkg")
                PaymentCaptureBus.markEvent(pkg, "no_keyword")
                PaymentCaptureBus.markTarget(pkg, "no_keyword", full)
                return
            }

            val source = if (pkg == "com.tencent.mm") "wechat" else "alipay"
            // 只有 JS 侧没人接住（App 被杀/桥未注册）才落盘，避免下次启动重复入库
            val delivered = PaymentCaptureBus.emit(source, title, body)
            if (!delivered) PaymentCaptureBus.appendBuffer(applicationContext, source, title, body)
            Log.d(TAG, "captured pkg=$pkg delivered=$delivered")
            PaymentCaptureBus.markEvent(pkg, if (delivered) "captured_js" else "captured_buffer")
            PaymentCaptureBus.markTarget(pkg, if (delivered) "captured_js" else "captured_buffer", full)
        } catch (e: Exception) {
            // 通知解析失败不影响系统服务
        }
    }
}
