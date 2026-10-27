package expo.modules.kinbechcall

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * Phone-call foreground service that owns the ringing notification, so the process (and the
 * ringtone) survives the whole ring window even when the app was closed. Like WhatsApp's call ring.
 */
class IncomingCallService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { finishRinging() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = WeakReference(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val chatId = intent?.getStringExtra(IncomingCallNotifier.EXTRA_CHAT_ID).orEmpty()
    val name = intent?.getStringExtra(IncomingCallNotifier.EXTRA_CALLER_NAME).orEmpty()
    val image = intent?.getStringExtra(IncomingCallNotifier.EXTRA_CALLER_IMAGE).orEmpty()
    val timeoutMs = intent?.getLongExtra(EXTRA_TIMEOUT, DEFAULT_TIMEOUT_MS) ?: DEFAULT_TIMEOUT_MS
    val notification = IncomingCallNotifier.build(this, chatId, name, image, timeoutMs)

    // Every startForegroundService call must reach startForeground, even one we then drop.
    val foreground = try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(IncomingCallNotifier.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
      } else {
        startForeground(IncomingCallNotifier.NOTIFICATION_ID, notification)
      }
      true
    } catch (error: Exception) {
      false
    }

    if (chatId.isBlank()) {
      finishRinging()
      return START_NOT_STICKY
    }
    if (!foreground) {
      try {
        NotificationManagerCompat.from(this).notify(IncomingCallNotifier.NOTIFICATION_ID, notification)
      } catch (error: SecurityException) {
        // Notifications were turned off in between.
      }
    }

    ringingChatId = chatId
    CallRinger.start(this, chatId, timeoutMs)
    handler.removeCallbacks(timeout)
    handler.postDelayed(timeout, timeoutMs)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    ringingChatId?.let { CallRinger.stop(it) }
    ringingChatId = null
    if (instance?.get() === this) instance = null
    super.onDestroy()
  }

  private fun finishRinging() {
    handler.removeCallbacks(timeout)
    val chatId = ringingChatId
    ringingChatId = null
    if (chatId != null) {
      CallRinger.stop(chatId)
      IncomingCallActivity.dismiss(chatId)
    }
    stopForeground(STOP_FOREGROUND_REMOVE)
    NotificationManagerCompat.from(this).cancel(IncomingCallNotifier.NOTIFICATION_ID)
    stopSelf()
  }

  companion object {
    private const val EXTRA_TIMEOUT = "kinbechCallTimeoutMs"
    private const val DEFAULT_TIMEOUT_MS = 60000L

    @Volatile
    var ringingChatId: String? = null
      private set

    private var instance: WeakReference<IncomingCallService>? = null

    /** False when Android refuses a background start; the caller then rings without the service. */
    fun start(context: Context, chatId: String, name: String, image: String, timeoutMs: Long): Boolean = try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, IncomingCallService::class.java)
          .putExtra(IncomingCallNotifier.EXTRA_CHAT_ID, chatId)
          .putExtra(IncomingCallNotifier.EXTRA_CALLER_NAME, name)
          .putExtra(IncomingCallNotifier.EXTRA_CALLER_IMAGE, image)
          .putExtra(EXTRA_TIMEOUT, timeoutMs)
      )
      true
    } catch (error: Exception) {
      false
    }

    fun stop(chatId: String) {
      if (ringingChatId != chatId) return
      val service = instance?.get() ?: return
      Handler(Looper.getMainLooper()).post {
        if (ringingChatId == chatId) service.finishRinging()
      }
    }
  }
}
