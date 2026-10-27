package expo.modules.kinbechcall

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings

/**
 * Plays the KinBech ringtone and vibration for an incoming call. Notification channel sounds play
 * once (or not at all on some OEMs), so the ring is driven here and stopped on answer/decline/hang-up.
 */
object CallRinger {
  private val PATTERN = longArrayOf(0, 900, 1100)
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { stopNow() }
  private var player: MediaPlayer? = null
  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null
  private var chatId: String? = null

  @Synchronized
  fun start(context: Context, chatId: String, timeoutMs: Long) {
    handler.removeCallbacks(timeout)
    handler.postDelayed(timeout, timeoutMs)
    if (this.chatId == chatId) return
    stopSound()
    this.chatId = chatId
    val app = context.applicationContext
    val mode = app.getSystemService(AudioManager::class.java)?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL
    if (mode == AudioManager.RINGER_MODE_NORMAL) {
      player = playAppRingtone(app)
      if (player == null) ringtone = playRingtone(app)
    }
    if (mode != AudioManager.RINGER_MODE_SILENT) vibrator = vibrate(app)
  }

  @Synchronized
  fun stop(chatId: String) {
    if (this.chatId == chatId) stopNow()
  }

  /** Volume key on the ringing screen: quiet now, but the call keeps ringing on screen. */
  @Synchronized
  fun silence() {
    stopSound()
  }

  @Synchronized
  fun stopNow() {
    handler.removeCallbacks(timeout)
    stopSound()
    chatId = null
  }

  private fun stopSound() {
    try {
      player?.stop()
    } catch (error: Exception) {
      // Never started or already stopped.
    }
    player?.release()
    player = null
    try {
      ringtone?.stop()
    } catch (error: Exception) {
      // Already released.
    }
    ringtone = null
    vibrator?.cancel()
    vibrator = null
  }

  /** KinBech's own ring (same file the in-app call screen plays), looped on the ringtone volume. */
  private fun playAppRingtone(context: Context): MediaPlayer? = try {
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val audio = context.getSystemService(AudioManager::class.java)
    val session = audio?.generateAudioSessionId() ?: AudioManager.AUDIO_SESSION_ID_GENERATE
    MediaPlayer.create(context, R.raw.kinbech_incoming_call, attributes, session)?.apply {
      isLooping = true
      start()
    }
  } catch (error: Exception) {
    null
  }

  /** Fallback when the bundled ring cannot play: the phone's own ringtone. */
  private fun playRingtone(context: Context): Ringtone? = try {
    // The settings URI is readable without media permissions and follows the user's chosen ringtone.
    val uri = Settings.System.DEFAULT_RINGTONE_URI ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    RingtoneManager.getRingtone(context, uri)?.apply {
      audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isLooping = true
      play()
    }
  } catch (error: Exception) {
    null
  }

  private fun vibrate(context: Context): Vibrator? = try {
    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    if (device == null || !device.hasVibrator()) {
      null
    } else {
      when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> device.vibrate(
          VibrationEffect.createWaveform(PATTERN, 0),
          VibrationAttributes.createForUsage(VibrationAttributes.USAGE_RINGTONE)
        )
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> @Suppress("DEPRECATION") device.vibrate(
          VibrationEffect.createWaveform(PATTERN, 0),
          AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build()
        )
        else -> @Suppress("DEPRECATION") device.vibrate(PATTERN, 0)
      }
      device
    }
  } catch (error: Exception) {
    null
  }
}
