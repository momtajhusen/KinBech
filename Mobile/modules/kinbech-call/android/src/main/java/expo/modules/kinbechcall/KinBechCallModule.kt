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

  @Field
  val itemTitle: String = ""

  @Field
  val itemPrice: String = ""

  @Field
  val itemPlace: String = ""

  @Field
  val itemImage: String = ""
}

class ChatAlertOptions : Record {
  @Field
  val chatId: String = ""

  @Field
  val title: String = ""

  @Field
  val body: String = ""

  @Field
  val listingTitle: String = ""

  @Field
  val senderImage: String = ""

  @Field
  val itemImage: String = ""
}

class KinBechCallModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("KinBechCall")

    Events("onCallAction", "onChatOpen")

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

    Function("setSignedIn") { signedIn: Boolean ->
      IncomingCallNotifier.setSignedIn(context, signedIn)
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
        options.timeoutMs.toLong().coerceIn(10000L, 120000L),
        CallItem(options.itemTitle, options.itemPrice, options.itemPlace, options.itemImage)
      )
    }

    Function("dismissIncomingCall") { chatId: String ->
      if (chatId.isNotBlank()) IncomingCallNotifier.cancel(context, chatId)
    }

    Function("startOngoingCall") { options: IncomingCallOptions ->
      if (options.chatId.isBlank()) return@Function false
      OngoingCallService.start(context, options.chatId, options.callerName, options.callerImage)
    }

    Function("setOngoingCallSpeaker") { on: Boolean ->
      OngoingCallService.setSpeaker(context, on)
    }

    Function("stopOngoingCall") {
      OngoingCallService.stop(context)
    }

    Function("consumeLaunchAction") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      readAction(intent)
    }

    // Runs off the main thread, so the sender and item photos can be downloaded here.
    AsyncFunction("showChatAlert") { options: ChatAlertOptions ->
      ChatAlertNotifier.show(
        context,
        options.chatId,
        options.title,
        options.body,
        options.listingTitle,
        options.senderImage,
        options.itemImage
      )
    }

    Function("cancelChatAlert") { chatId: String ->
      if (chatId.isNotBlank()) ChatAlertNotifier.cancel(context, chatId)
    }

    Function("consumeChatLaunch") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      readChatOpen(intent)
    }

    OnNewIntent { intent ->
      readChatOpen(intent)?.let {
        sendEvent("onChatOpen", it)
        return@OnNewIntent
      }
      val action = readAction(intent) ?: return@OnNewIntent
      sendEvent("onCallAction", action)
    }
  }

  private fun readChatOpen(intent: Intent): Map<String, Any?>? {
    val chatId = intent.getStringExtra(ChatAlertNotifier.EXTRA_OPEN_CHAT_ID) ?: return null
    val name = intent.getStringExtra(ChatAlertNotifier.EXTRA_OPEN_CHAT_NAME) ?: ""
    intent.removeExtra(ChatAlertNotifier.EXTRA_OPEN_CHAT_ID)
    intent.removeExtra(ChatAlertNotifier.EXTRA_OPEN_CHAT_NAME)
    return mapOf("chatId" to chatId, "name" to name)
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
