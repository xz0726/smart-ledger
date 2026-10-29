package com.smartledger.app.notification

import android.content.Context
import android.content.SharedPreferences
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
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

    fun addListener(listener: (source: String, title: String?, text: String?) -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: (source: String, title: String?, text: String?) -> Unit) {
        listeners.remove(listener)
    }

    fun emit(source: String, title: String?, text: String?) {
        for (l in listeners) l(source, title, text)
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
        // 支付宝 / 微信包名
        private val TARGET_PACKAGES = setOf("com.eg.android.AlipayGphone", "com.tencent.mm")
        // 支付类关键词：命中才捕获（收付款 / 交易凭证类文案）
        private val PAYMENT_KEYWORDS = listOf("支付", "付款", "收款", "到账", "扣款", "交易")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try {
            val pkg = sbn.packageName ?: return
            if (pkg !in TARGET_PACKAGES) return

            val extra = sbn.notification.extras
            val title = extra.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString()
            val text = extra.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString()
            val full = listOfNotNull(title, text).joinToString(" ").trim()
            if (full.isEmpty()) return
            if (PAYMENT_KEYWORDS.none { full.contains(it) }) return

            val source = if (pkg == "com.tencent.mm") "wechat" else "alipay"
            PaymentCaptureBus.emit(source, title, text)
            PaymentCaptureBus.appendBuffer(applicationContext, source, title, text)
        } catch (e: Exception) {
            // 通知解析失败不影响系统服务
        }
    }
}
