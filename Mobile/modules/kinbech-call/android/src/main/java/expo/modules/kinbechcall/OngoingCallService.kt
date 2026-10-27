package expo.modules.kinbechcall

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * Runs for the whole answered call, like WhatsApp's "Ongoing voice call". Android only lets a
 * backgrounded app (screen off, locked, or another app on top) keep using the microphone and
 * stay unfrozen while a microphone/phone-call foreground service is running.
 */
class OngoingCallService : Service() {
  private var proximityLock: PowerManager.WakeLock? = null
  private var cpuLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_SPEAKER) {
      setProximity(!intent.getBooleanExtra(EXTRA_SPEAKER, false))
      return START_NOT_STICKY
    }
    val chatId = intent?.getStringExtra(IncomingCallNotifier.EXTRA_CHAT_ID).orEmpty()
    if (chatId.isBlank()) {
      stopSelf()
      return START_NOT_STICKY
    }
    val name = intent?.getStringExtra(IncomingCallNotifier.EXTRA_CALLER_NAME).orEmpty().ifBlank { "KinBech user" }
    val image = intent?.getStringExtra(IncomingCallNotifier.EXTRA_CALLER_IMAGE).orEmpty()
    if (!enterForeground(build(chatId, name, image))) {
      stopSelf()
      return START_NOT_STICKY
    }
    activeChatId = chatId
    holdCpu()
    setProximity(true)
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiping KinBech away tears down the call screen, so nothing is left to keep alive.
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    setProximity(false)
    cpuLock?.let { if (it.isHeld) it.release() }
    cpuLock = null
    activeChatId = null
    super.onDestroy()
  }

  private fun enterForeground(notification: Notification): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return try {
        startForeground(NOTIFICATION_ID, notification)
        true
      } catch (error: Exception) {
        false
      }
    }
    val types = mutableListOf<Int>()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      types.add(ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    }
    types.add(ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
    for (type in types) {
      try {
        startForeground(NOTIFICATION_ID, notification, type)
        return true
      } catch (error: Exception) {
        // Microphone type is refused when the app was not visible; phone-call alone still keeps the process.
      }
    }
    return false
  }

  private fun holdCpu() {
    if (cpuLock?.isHeld == true) return
    val power = getSystemService(PowerManager::class.java) ?: return
    cpuLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "KinBech:OngoingCall").apply {
      setReferenceCounted(false)
      acquire(MAX_CALL_MS)
    }
  }

  /** Screen goes dark at the ear, like a phone call; off while the speaker is on. */
  private fun setProximity(enabled: Boolean) {
    if (!enabled) {
      proximityLock?.let { if (it.isHeld) it.release() }
      return
    }
    if (proximityLock?.isHeld == true) return
    val power = getSystemService(PowerManager::class.java) ?: return
    if (!power.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return
    val lock = proximityLock
      ?: power.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "KinBech:CallProximity").apply {
        setReferenceCounted(false)
      }.also { proximityLock = it }
    lock.acquire(MAX_CALL_MS)
  }

  private fun build(chatId: String, name: String, image: String): Notification {
    ensureChannel(this)
    val avatar = IncomingCallNotifier.cachedAvatar(image) ?: IncomingCallNotifier.initialsAvatar(name)
    val person = Person.Builder()
      .setName(name)
      .setIcon(IconCompat.createWithBitmap(avatar))
      .setImportant(true)
      .build()
    val open = PendingIntent.getActivity(
      this,
      REQUEST_OPEN,
      (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
        setPackage(packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val hangUp = PendingIntent.getBroadcast(
      this,
      REQUEST_HANG_UP,
      Intent(this, CallActionReceiver::class.java)
        .setAction(ACTION_HANG_UP)
        .putExtra(IncomingCallNotifier.EXTRA_CHAT_ID, chatId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.kinbech_call_notification)
      .setContentTitle(name)
      .setContentText("Ongoing voice call")
      .setLargeIcon(avatar)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setUsesChronometer(true)
      .setWhen(System.currentTimeMillis())
      .setContentIntent(open)
      .addPerson(person)
      .setStyle(NotificationCompat.CallStyle.forOngoingCall(person, hangUp))
    return try {
      builder.build()
    } catch (error: Exception) {
      builder.setStyle(null).addAction(0, "Hang up", hangUp).build()
    }
  }

  companion object {
    const val ACTION_HANG_UP = "expo.modules.kinbechcall.HANG_UP"
    private const val ACTION_SPEAKER = "expo.modules.kinbechcall.SPEAKER"
    private const val EXTRA_SPEAKER = "kinbechCallSpeaker"
    private const val CHANNEL_ID = "kinbech-ongoing-call"
    private const val NOTIFICATION_ID = 7302
    private const val REQUEST_OPEN = 7310
    private const val REQUEST_HANG_UP = 7311
    private const val MAX_CALL_MS = 4L * 60 * 60 * 1000

    @Volatile
    var activeChatId: String? = null
      private set

    fun start(context: Context, chatId: String, name: String, image: String): Boolean = try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, OngoingCallService::class.java)
          .putExtra(IncomingCallNotifier.EXTRA_CHAT_ID, chatId)
          .putExtra(IncomingCallNotifier.EXTRA_CALLER_NAME, name)
          .putExtra(IncomingCallNotifier.EXTRA_CALLER_IMAGE, image)
      )
      true
    } catch (error: Exception) {
      false
    }

    fun setSpeaker(context: Context, on: Boolean) {
      if (activeChatId == null) return
      try {
        context.startService(
          Intent(context, OngoingCallService::class.java)
            .setAction(ACTION_SPEAKER)
            .putExtra(EXTRA_SPEAKER, on)
        )
      } catch (error: Exception) {
        // The service already stopped with the call.
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, OngoingCallService::class.java))
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java) ?: return
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      val channel = NotificationChannel(CHANNEL_ID, "Ongoing calls", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shows while a KinBech voice call is in progress"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        setSound(null, null)
        enableVibration(false)
      }
      manager.createNotificationChannel(channel)
    }
  }
}
