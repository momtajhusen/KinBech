package expo.modules.kinbechcall

import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.lang.ref.WeakReference

class IncomingCallOptions : Record {
  @Field
  val chatId: String = ""

  @Field
  val callerName: String = ""

  @Field
  val callerImage: String = ""

  @Field
  val timeoutMs: Double = 60000.0
}

class KinBechCallModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("KinBechCall")

    Events("onCallAction")

    OnCreate {
      instance = WeakReference(this@KinBechCallModule)
    }

    OnDestroy {
      if (instance?.get() === this@KinBechCallModule) instance = null
      appVisible = false
    }

    OnActivityEntersForeground {
      appVisible = true
    }

    OnActivityEntersBackground {
      appVisible = false
    }

    OnActivityDestroys {
      appVisible = false
    }

    Function("setMediaBase") { base: String ->
      if (base.startsWith("http://") || base.startsWith("https://")) IncomingCallNotifier.setMediaBase(context, base)
    }

    Function("getCallReadiness") {
      CallReadiness.read(context)
    }

    Function("openCallSetting") { kind: String ->
      CallReadiness.open(appContext.currentActivity ?: context, kind)
    }

    AsyncFunction("showIncomingCall") { options: IncomingCallOptions ->
      if (options.chatId.isBlank()) return@AsyncFunction false
      IncomingCallNotifier.show(
        context,
        options.chatId,
        options.callerName,
        options.callerImage,
        options.timeoutMs.toLong().coerceIn(10000L, 120000L)
      )
    }

    Function("dismissIncomingCall") { chatId: String ->
      if (chatId.isNotBlank()) IncomingCallNotifier.cancel(context, chatId)
    }

    Function("consumeLaunchAction") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      readAction(intent)
    }

    OnNewIntent { intent ->
      val action = readAction(intent) ?: return@OnNewIntent
      sendEvent("onCallAction", action)
    }
  }

  private fun readAction(intent: Intent): Map<String, Any?>? {
    val action = intent.getStringExtra(IncomingCallNotifier.EXTRA_ACTION) ?: return null
    val chatId = intent.getStringExtra(IncomingCallNotifier.EXTRA_CHAT_ID) ?: return null
    val result = mapOf(
      "action" to action,
      "chatId" to chatId,
      "callerName" to (intent.getStringExtra(IncomingCallNotifier.EXTRA_CALLER_NAME) ?: ""),
      "callerImage" to (intent.getStringExtra(IncomingCallNotifier.EXTRA_CALLER_IMAGE) ?: "")
    )
    intent.removeExtra(IncomingCallNotifier.EXTRA_ACTION)
    intent.removeExtra(IncomingCallNotifier.EXTRA_CHAT_ID)
    intent.removeExtra(IncomingCallNotifier.EXTRA_CALLER_NAME)
    intent.removeExtra(IncomingCallNotifier.EXTRA_CALLER_IMAGE)
    // Answering stops the ringtone right away; "open" leaves it ringing until the in-app screen takes over.
    if (action == "answer") appContext.reactContext?.let { IncomingCallNotifier.cancel(it, chatId) }
    return result
  }

  companion object {
    private var instance: WeakReference<KinBechCallModule>? = null

    /** True while a KinBech screen is in front of the user; the screen being off or locked counts as hidden. */
    @Volatile
    var appVisible = false

    fun emit(body: Map<String, Any?>) {
      instance?.get()?.sendEvent("onCallAction", body)
    }
  }
}
