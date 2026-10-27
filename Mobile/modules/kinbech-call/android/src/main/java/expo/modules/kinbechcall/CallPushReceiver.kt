package expo.modules.kinbechcall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlin.concurrent.thread

/**
 * Sees the raw FCM broadcast next to React Native Firebase's receiver, so a call rings
 * even when the JS runtime is not running or the OEM delays the headless task.
 * While the app is on screen JS shows its own call UI instead.
 */
class CallPushReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val type = intent.getStringExtra("type") ?: return
    val chatId = intent.getStringExtra("chatId").orEmpty()
    if (chatId.isBlank()) return

    when (type) {
      "call_ended" -> IncomingCallNotifier.cancel(context, chatId)
      "incoming_call" -> {
        if (KinBechCallModule.appVisible) return
        if (!IncomingCallNotifier.isSignedIn(context)) return
        val ringMs = remainingRing(intent.getStringExtra("sentAt")) ?: return
        val app = context.applicationContext
        val callerName = intent.getStringExtra("callerName").orEmpty()
        val callerImage = IncomingCallNotifier.resolveMedia(app, intent.getStringExtra("callerImage").orEmpty())
        val item = CallItem(
          title = intent.getStringExtra("itemTitle").orEmpty(),
          price = intent.getStringExtra("itemPrice").orEmpty(),
          place = intent.getStringExtra("itemPlace").orEmpty(),
          image = IncomingCallNotifier.resolveMedia(app, intent.getStringExtra("itemImage").orEmpty())
        )
        val pending = goAsync()
        // The avatar download needs the network, which is not allowed on the main thread.
        thread(name = "kinbech-call-push") {
          try {
            IncomingCallNotifier.show(app, chatId, callerName, callerImage, ringMs, item)
          } catch (error: Exception) {
            // JS still gets the same push and retries the notification.
          } finally {
            pending.finish()
          }
        }
      }
    }
  }

  /** Null when a delayed push arrives after the caller's ring window; a wildly off phone clock gets the full ring. */
  private fun remainingRing(sentAt: String?): Long? {
    val sent = sentAt?.toLongOrNull() ?: return RING_MS
    val age = System.currentTimeMillis() - sent
    if (age < -CLOCK_SKEW_MS || age > CLOCK_SKEW_MS) return RING_MS
    if (age >= RING_MS - MIN_RING_MS) return null
    return (RING_MS - age.coerceAtLeast(0L))
  }

  companion object {
    private const val RING_MS = 60000L
    private const val MIN_RING_MS = 5000L
    private const val CLOCK_SKEW_MS = 5 * 60 * 1000L
  }
}
