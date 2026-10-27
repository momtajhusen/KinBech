package expo.modules.kinbechcall

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import java.net.HttpURLConnection
import java.net.URL

object IncomingCallNotifier {
  const val CHANNEL_ID = "kinbech-incoming-call-v2"
  const val ACTION_DECLINE = "expo.modules.kinbechcall.DECLINE"
  const val EXTRA_ACTION = "kinbechCallAction"
  const val EXTRA_CHAT_ID = "kinbechCallChatId"
  const val EXTRA_CALLER_NAME = "kinbechCallCallerName"
  const val EXTRA_CALLER_IMAGE = "kinbechCallCallerImage"
  const val NOTIFICATION_ID = 7301

  private const val LEGACY_CHANNEL_ID = "kinbech-incoming-call"
  private const val TAG_PREFIX = "kinbech-call:"
  private const val AVATAR_SIZE = 256

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(LEGACY_CHANNEL_ID) != null) manager.deleteNotificationChannel(LEGACY_CHANNEL_ID)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Rings when someone calls you on KinBech"
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
      // CallRinger plays the ringtone and vibration, so they loop for the whole ring and never double up.
      setSound(null, null)
      enableVibration(false)
    }
    manager.createNotificationChannel(channel)
  }

  fun canPost(context: Context): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    return NotificationManagerCompat.from(context).areNotificationsEnabled()
  }

  fun show(
    context: Context,
    chatId: String,
    callerName: String,
    callerImage: String,
    timeoutMs: Long
  ): Boolean {
    if (!canPost(context)) return false
    ensureChannel(context)
    val name = callerName.ifBlank { "KinBech user" }
    downloadAvatar(callerImage)?.let { lastAvatar = callerImage to it }
    if (IncomingCallService.start(context, chatId, name, callerImage, timeoutMs)) return true

    // Android refused the background service start: post the notification and ring from this process.
    val posted = try {
      NotificationManagerCompat.from(context)
        .notify(TAG_PREFIX + chatId, NOTIFICATION_ID, build(context, chatId, name, callerImage, timeoutMs))
      true
    } catch (error: SecurityException) {
      false
    }
    if (posted) CallRinger.start(context, chatId, timeoutMs)
    return posted
  }

  fun build(context: Context, chatId: String, callerName: String, callerImage: String, timeoutMs: Long): Notification {
    ensureChannel(context)
    val name = callerName.ifBlank { "KinBech user" }
    val avatar = cachedAvatar(callerImage) ?: initialsAvatar(name)
    val person = Person.Builder()
      .setName(name)
      .setIcon(IconCompat.createWithBitmap(avatar))
      .setImportant(true)
      .build()

    // Android shows this as a heads-up banner while the phone is in use, and as the full-screen
    // ringing screen when it is locked or asleep.
    val ringScreen = PendingIntent.getActivity(
      context,
      requestCode(chatId, 1),
      Intent(context, IncomingCallActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
        .putExtra(EXTRA_CHAT_ID, chatId)
        .putExtra(EXTRA_CALLER_NAME, name)
        .putExtra(EXTRA_CALLER_IMAGE, callerImage)
        .putExtra(IncomingCallActivity.EXTRA_RING_UNTIL, System.currentTimeMillis() + timeoutMs),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val answer = activityIntent(context, chatId, name, callerImage, "answer", 2)
    val decline = PendingIntent.getBroadcast(
      context,
      requestCode(chatId, 3),
      Intent(context, CallActionReceiver::class.java)
        .setAction(ACTION_DECLINE)
        .putExtra(EXTRA_CHAT_ID, chatId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.kinbech_call_notification)
      .setContentTitle(name)
      .setContentText("Incoming voice call")
      .setLargeIcon(avatar)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setTimeoutAfter(timeoutMs)
      .setContentIntent(ringScreen)
      .setFullScreenIntent(ringScreen, true)
      .addPerson(person)
      .addExtras(Bundle().apply { putString(EXTRA_CHAT_ID, chatId) })
      .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer))

    return try {
      builder.build()
    } catch (error: Exception) {
      builder.setStyle(null)
        .addAction(0, "Decline", decline)
        .addAction(0, "Answer", answer)
        .build()
    }
  }

  fun cancel(context: Context, chatId: String) {
    NotificationManagerCompat.from(context).cancel(TAG_PREFIX + chatId, NOTIFICATION_ID)
    IncomingCallService.stop(chatId)
    CallRinger.stop(chatId)
    IncomingCallActivity.dismiss(chatId)
  }

  /** False once the call was answered, declined, hung up, or timed out. */
  fun isRinging(context: Context, chatId: String): Boolean {
    if (IncomingCallService.ringingChatId == chatId) return true
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return try {
      manager.activeNotifications.any {
        it.id == NOTIFICATION_ID && it.notification.extras.getString(EXTRA_CHAT_ID) == chatId
      }
    } catch (error: Exception) {
      true
    }
  }

  fun cachedAvatar(url: String): Bitmap? = lastAvatar?.takeIf { url.isNotEmpty() && it.first == url }?.second

  fun launchIntent(context: Context, chatId: String, name: String, image: String, action: String): Intent =
    (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_ACTION, action)
      putExtra(EXTRA_CHAT_ID, chatId)
      putExtra(EXTRA_CALLER_NAME, name)
      putExtra(EXTRA_CALLER_IMAGE, image)
    }

  @Volatile
  private var lastAvatar: Pair<String, Bitmap>? = null

  fun setMediaBase(context: Context, base: String) {
    prefs(context).edit().putString(KEY_MEDIA_BASE, base.trimEnd('/')).apply()
  }

  fun setSignedIn(context: Context, signedIn: Boolean) {
    prefs(context).edit().putBoolean(KEY_SIGNED_IN, signedIn).apply()
  }

  /** Installs that have not opened the app since this flag existed count as signed in. */
  fun isSignedIn(context: Context): Boolean = prefs(context).getBoolean(KEY_SIGNED_IN, true)

  /** Pushes carry server paths like /uploads/...; JS saves the API host so they load before JS starts. */
  fun resolveMedia(context: Context, path: String): String {
    val value = path.trim()
    if (value.isEmpty() || value.startsWith("http://") || value.startsWith("https://")) return value
    val base = prefs(context).getString(KEY_MEDIA_BASE, null) ?: return ""
    return base + (if (value.startsWith("/")) value else "/$value")
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private const val PREFS = "kinbech-call"
  private const val KEY_MEDIA_BASE = "mediaBase"
  private const val KEY_SIGNED_IN = "signedIn"

  private fun requestCode(chatId: String, slot: Int) = (chatId.hashCode() and 0x0FFFFFFF) * 4 + slot

  private fun activityIntent(
    context: Context,
    chatId: String,
    name: String,
    image: String,
    action: String,
    slot: Int
  ): PendingIntent {
    return PendingIntent.getActivity(
      context,
      requestCode(chatId, slot),
      launchIntent(context, chatId, name, image, action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun downloadAvatar(url: String): Bitmap? {
    if (!url.startsWith("http://") && !url.startsWith("https://")) return null
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 2500
        readTimeout = 2500
      }
      val bitmap = connection.inputStream.use { BitmapFactory.decodeStream(it) } ?: return null
      squareCrop(bitmap)
    } catch (error: Exception) {
      null
    } finally {
      connection?.disconnect()
    }
  }

  private fun squareCrop(source: Bitmap): Bitmap {
    val side = minOf(source.width, source.height)
    val x = (source.width - side) / 2
    val y = (source.height - side) / 2
    val square = Bitmap.createBitmap(source, x, y, side, side)
    return Bitmap.createScaledBitmap(square, AVATAR_SIZE, AVATAR_SIZE, true)
  }

  fun initialsAvatar(name: String): Bitmap {
    val bitmap = Bitmap.createBitmap(AVATAR_SIZE, AVATAR_SIZE, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val half = AVATAR_SIZE / 2f
    canvas.drawCircle(half, half, half, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#16A34A") })
    val initials = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2)
      .joinToString("") { it.first().uppercase() }
      .ifEmpty { "K" }
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = AVATAR_SIZE * 0.4f
      textAlign = Paint.Align.CENTER
      isFakeBoldText = true
    }
    val baseline = half - (text.descent() + text.ascent()) / 2
    canvas.drawText(initials, half, baseline, text)
    return bitmap
  }
}
