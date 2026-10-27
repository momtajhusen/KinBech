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
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import java.net.HttpURLConnection
import java.net.URL

object IncomingCallNotifier {
  const val CHANNEL_ID = "kinbech-incoming-call"
  const val ACTION_DECLINE = "expo.modules.kinbechcall.DECLINE"
  const val EXTRA_ACTION = "kinbechCallAction"
  const val EXTRA_CHAT_ID = "kinbechCallChatId"
  const val EXTRA_CALLER_NAME = "kinbechCallCallerName"
  const val EXTRA_CALLER_IMAGE = "kinbechCallCallerImage"

  private const val NOTIFICATION_ID = 7301
  private const val TAG_PREFIX = "kinbech-call:"
  private const val AVATAR_SIZE = 256
  private val VIBRATION = longArrayOf(0, 800, 600, 800, 600)

  private fun ringtone() = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Rings when someone calls you on KinBech"
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      enableVibration(true)
      vibrationPattern = VIBRATION
      setBypassDnd(true)
      setSound(
        ringtone(),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
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
    val avatar = downloadAvatar(callerImage) ?: initialsAvatar(name)
    val person = Person.Builder()
      .setName(name)
      .setIcon(IconCompat.createWithBitmap(avatar))
      .setImportant(true)
      .build()

    val open = activityIntent(context, chatId, name, callerImage, "open", 1)
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
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .setSound(ringtone(), AudioManager.STREAM_RING)
      .setVibrate(VIBRATION)
      .addPerson(person)
      .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer))

    val notification = try {
      builder.build()
    } catch (error: Exception) {
      builder.setStyle(null)
        .addAction(0, "Decline", decline)
        .addAction(0, "Answer", answer)
        .build()
    }
    // Keeps the ringtone looping until the call is answered, declined, or times out.
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    return try {
      NotificationManagerCompat.from(context).notify(TAG_PREFIX + chatId, NOTIFICATION_ID, notification)
      true
    } catch (error: SecurityException) {
      false
    }
  }

  fun cancel(context: Context, chatId: String) {
    NotificationManagerCompat.from(context).cancel(TAG_PREFIX + chatId, NOTIFICATION_ID)
  }

  fun setMediaBase(context: Context, base: String) {
    prefs(context).edit().putString(KEY_MEDIA_BASE, base.trimEnd('/')).apply()
  }

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

  private fun requestCode(chatId: String, slot: Int) = (chatId.hashCode() and 0x0FFFFFFF) * 4 + slot

  private fun activityIntent(
    context: Context,
    chatId: String,
    name: String,
    image: String,
    action: String,
    slot: Int
  ): PendingIntent {
    val intent = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_ACTION, action)
      putExtra(EXTRA_CHAT_ID, chatId)
      putExtra(EXTRA_CALLER_NAME, name)
      putExtra(EXTRA_CALLER_IMAGE, image)
    }
    return PendingIntent.getActivity(
      context,
      requestCode(chatId, slot),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun downloadAvatar(url: String): Bitmap? {
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

  private fun initialsAvatar(name: String): Bitmap {
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
