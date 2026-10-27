package expo.modules.kinbechcall

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Chat message alert with the sender's photo on the left and the item's photo on the right. */
object ChatAlertNotifier {
  // Shared with Notifee in src/services/pushAlerts.js; whichever runs first creates it.
  const val CHANNEL_ID = "kinbech-alerts-v2"
  const val EXTRA_OPEN_CHAT_ID = "kinbechOpenChatId"
  const val EXTRA_OPEN_CHAT_NAME = "kinbechOpenChatName"

  private const val TAG_PREFIX = "kinbech-chat:"
  private const val NOTIFICATION_ID = 7302

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "KinBech alerts", NotificationManager.IMPORTANCE_HIGH).apply {
      enableVibration(true)
      setSound(
        soundUri(context),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
    }
    manager.createNotificationChannel(channel)
  }

  private fun soundUri(context: Context): Uri =
    Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.kinbech_notification}")

  fun show(
    context: Context,
    chatId: String,
    title: String,
    body: String,
    listingTitle: String,
    senderImage: String,
    itemImage: String
  ): Boolean {
    if (chatId.isBlank() || !IncomingCallNotifier.canPost(context)) return false
    ensureChannel(context)
    val name = title.ifBlank { "KinBech" }
    val text = body.ifBlank { "New message" }
    val avatar = circle(IncomingCallNotifier.downloadAvatar(senderImage) ?: IncomingCallNotifier.initialsAvatar(name))
    val item = IncomingCallNotifier.downloadAvatar(itemImage)?.let { rounded(it) }

    val small = views(context, R.layout.kinbech_chat_alert, name, text, "", avatar, item)
    val big = views(context, R.layout.kinbech_chat_alert_big, name, text, listingTitle, avatar, item)

    val open = PendingIntent.getActivity(
      context,
      chatId.hashCode() and 0x0FFFFFFF,
      openChatIntent(context, chatId, name),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.kinbech_call_notification)
      .setContentTitle(name)
      .setContentText(text)
      .setSubText(listingTitle.ifBlank { null })
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(small)
      .setCustomHeadsUpContentView(small)
      .setCustomBigContentView(big)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setDefaults(NotificationCompat.DEFAULT_VIBRATE)
      .setSound(soundUri(context))
      .setColor(0xFF047857.toInt())
      .setAutoCancel(true)
      .setShowWhen(true)
      .setContentIntent(open)
      .build()

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

  private fun views(
    context: Context,
    layout: Int,
    title: String,
    body: String,
    listingTitle: String,
    avatar: Bitmap,
    item: Bitmap?
  ): RemoteViews = RemoteViews(context.packageName, layout).apply {
    setTextViewText(R.id.kinbech_chat_title, title)
    setTextViewText(R.id.kinbech_chat_body, body)
    setImageViewBitmap(R.id.kinbech_chat_avatar, avatar)
    if (item != null) {
      setImageViewBitmap(R.id.kinbech_chat_item, item)
      setViewVisibility(R.id.kinbech_chat_item, View.VISIBLE)
    } else {
      setViewVisibility(R.id.kinbech_chat_item, View.GONE)
    }
    if (layout == R.layout.kinbech_chat_alert_big) {
      setTextViewText(R.id.kinbech_chat_listing, listingTitle)
      setViewVisibility(R.id.kinbech_chat_listing, if (listingTitle.isBlank()) View.GONE else View.VISIBLE)
    }
  }

  private fun openChatIntent(context: Context, chatId: String, name: String): Intent =
    (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_OPEN_CHAT_ID, chatId)
      putExtra(EXTRA_OPEN_CHAT_NAME, name)
    }

  private fun circle(source: Bitmap): Bitmap = clip(source) { canvas, paint, size ->
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
  }

  private fun rounded(source: Bitmap): Bitmap = clip(source) { canvas, paint, size ->
    val radius = size * 0.16f
    canvas.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), radius, radius, paint)
  }

  private fun clip(source: Bitmap, draw: (Canvas, Paint, Int) -> Unit): Bitmap {
    val size = minOf(source.width, source.height)
    val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      shader = BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    }
    draw(Canvas(output), paint, size)
    return output
  }
}
