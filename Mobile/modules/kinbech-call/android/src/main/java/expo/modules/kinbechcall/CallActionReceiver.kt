package expo.modules.kinbechcall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != IncomingCallNotifier.ACTION_DECLINE) return
    val chatId = intent.getStringExtra(IncomingCallNotifier.EXTRA_CHAT_ID) ?: return
    decline(context, chatId)
  }

  companion object {
    fun decline(context: Context, chatId: String) {
      IncomingCallNotifier.cancel(context, chatId)
      // The decline still has to reach the server when the app is closed, so JS runs as a headless task.
      try {
        context.startService(
          Intent(context, CallDeclineService::class.java).putExtra("chatId", chatId)
        )
        HeadlessJsTaskService.acquireWakeLockNow(context)
      } catch (error: Exception) {
        KinBechCallModule.emit(mapOf("action" to "decline", "chatId" to chatId))
      }
    }
  }
}
