package com.smartledger.app.notification

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * JS 桥：
 * - 事件 onPaymentCapture：通知使用权 Service 捕获的支付通知（source/title/text/createdAt）
 * - drainCaptureBuffer(promise)：取出 App 被杀期间落盘缓冲的通知并清空
 * - isListenerEnabled(promise)：系统「通知使用权」是否已授权本应用
 */
class PaymentCaptureModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "PaymentCapture"

    private val bridge = { source: String, title: String?, text: String? ->
        val params: WritableMap = Arguments.createMap()
        params.putString("source", source)
        params.putString("title", title ?: "")
        params.putString("text", text ?: "")
        params.putDouble("createdAt", System.currentTimeMillis().toDouble())
        try {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onPaymentCapture", params)
        } catch (e: Exception) {
            // JS 侧未就绪时事件丢弃——落盘缓冲保证不丢数据
        }
    }

    override fun initialize() {
        super.initialize()
        PaymentCaptureBus.addListener(bridge)
    }

    override fun onCatalystInstanceDestroy() {
        PaymentCaptureBus.removeListener(bridge)
    }

    @ReactMethod
    fun drainCaptureBuffer(promise: Promise) {
        try {
            val arr = PaymentCaptureBus.drainBuffer(reactContext)
            val out: WritableArray = Arguments.createArray()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val map: WritableMap = Arguments.createMap()
                map.putString("source", obj.optString("source"))
                map.putString("title", obj.optString("title"))
                map.putString("text", obj.optString("text"))
                map.putDouble("createdAt", obj.optDouble("createdAt", 0.0))
                out.pushMap(map)
            }
            promise.resolve(out)
        } catch (e: Exception) {
            promise.reject("DRAIN_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun isListenerEnabled(promise: Promise) {
        try {
            val enabled = android.provider.Settings.Secure.getString(
                reactContext.contentResolver, "enabled_notification_listeners"
            )?.contains(reactContext.packageName) == true
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}

class PaymentCapturePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(PaymentCaptureModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<com.facebook.react.uimanager.ViewManager<*, *>> =
        emptyList()
}
