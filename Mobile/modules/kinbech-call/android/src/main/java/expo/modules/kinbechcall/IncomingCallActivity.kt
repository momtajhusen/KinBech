package expo.modules.kinbechcall

import android.animation.Animator
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.SpannableString
import android.text.Spanned
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.lang.ref.WeakReference
import kotlin.math.PI
import kotlin.math.sin

/** Ringing screen the system opens from the call notification while the phone is locked or asleep. */
class IncomingCallActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private val animators = mutableListOf<Animator>()
  private var chatId = ""
  private var callerName = ""
  private var callerImage = ""
  private var handled = false
  private var statusView: TextView? = null
  private var dots = 0

  private val finishOnTimeout = Runnable { if (!isFinishing) finish() }

  private val dotsTick = object : Runnable {
    override fun run() {
      dots = (dots + 1) % 4
      statusView?.text = statusText(dots)
      handler.postDelayed(this, 450)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    if (!bind(intent)) {
      finish()
      return
    }
    current = WeakReference(this)
    render()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val previous = chatId
    if (!bind(intent)) return
    setIntent(intent)
    if (chatId != previous) render()
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
      CallRinger.silence()
      return true
    }
    return super.onKeyDown(keyCode, event)
  }

  override fun onDestroy() {
    stopAnimations()
    handler.removeCallbacksAndMessages(null)
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  private fun bind(source: Intent): Boolean {
    val id = source.getStringExtra(IncomingCallNotifier.EXTRA_CHAT_ID).orEmpty()
    if (id.isBlank() || !IncomingCallNotifier.isRinging(this, id)) return false
    val ringUntil = source.getLongExtra(EXTRA_RING_UNTIL, 0L)
    val left = ringUntil - System.currentTimeMillis()
    if (ringUntil > 0 && left <= 0) return false
    chatId = id
    callerName = source.getStringExtra(IncomingCallNotifier.EXTRA_CALLER_NAME).orEmpty().ifBlank { "KinBech user" }
    callerImage = source.getStringExtra(IncomingCallNotifier.EXTRA_CALLER_IMAGE).orEmpty()
    handled = false
    handler.removeCallbacks(finishOnTimeout)
    if (ringUntil > 0) handler.postDelayed(finishOnTimeout, left)
    return true
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    WindowCompat.setDecorFitsSystemWindows(window, false)
  }

  private fun render() {
    stopAnimations()
    val root = FrameLayout(this).apply {
      background = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(0xFF0B3B2C.toInt(), BASE, 0xFF010805.toInt())
      )
    }

    val glow = View(this).apply {
      background = GradientDrawable().apply {
        gradientType = GradientDrawable.RADIAL_GRADIENT
        colors = intArrayOf(0x5534D399, 0x0010B981)
        gradientRadius = dp(220).toFloat()
      }
    }
    root.addView(glow, FrameLayout.LayoutParams(dp(440), dp(440), Gravity.CENTER_HORIZONTAL or Gravity.TOP).apply {
      topMargin = dp(60)
    })
    loop(
      ObjectAnimator.ofPropertyValuesHolder(
        glow,
        PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, 0f, dp(36).toFloat()),
        PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 0.65f)
      ),
      5200,
      reverse = true
    )

    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    root.addView(column, FrameLayout.LayoutParams(MATCH, MATCH))
    ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      column.setPadding(dp(24), bars.top + dp(28), dp(24), bars.bottom + dp(44))
      insets
    }

    val pill = TextView(this).apply {
      text = "KinBech · Voice call"
      setTextColor(MUTED)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      letterSpacing = 0.04f
      setPadding(dp(14), dp(7), dp(14), dp(7))
      background = GradientDrawable().apply {
        cornerRadius = dp(999).toFloat()
        setColor(GLASS)
        setStroke(dp(1), GLASS_BORDER)
      }
    }
    column.addView(pill, LinearLayout.LayoutParams(WRAP, WRAP))
    column.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))

    val avatar = avatarBlock()
    column.addView(avatar, LinearLayout.LayoutParams(dp(250), dp(250)))

    val name = TextView(this).apply {
      text = callerName
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      gravity = Gravity.CENTER
      maxLines = 2
      ellipsize = TextUtils.TruncateAt.END
    }
    column.addView(name, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(4) })

    val status = TextView(this).apply {
      text = statusText(0)
      setTextColor(MUTED)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      gravity = Gravity.CENTER
    }
    statusView = status
    column.addView(status, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(8) })
    column.addView(View(this), LinearLayout.LayoutParams(1, 0, 1.3f))

    val actions = actionsRow()
    column.addView(actions, LinearLayout.LayoutParams(MATCH, WRAP))

    setContentView(root)
    ViewCompat.requestApplyInsets(root)

    listOf(pill, avatar, name, status, actions).forEachIndexed { index, view ->
      view.alpha = 0f
      view.translationY = dp(22).toFloat()
      view.animate()
        .alpha(1f)
        .translationY(0f)
        .setStartDelay(60L * index)
        .setDuration(420)
        .setInterpolator(DecelerateInterpolator())
        .start()
    }
    dots = 0
    handler.removeCallbacks(dotsTick)
    handler.postDelayed(dotsTick, 450)
  }

  private fun avatarBlock(): FrameLayout {
    val block = FrameLayout(this)
    repeat(3) { index ->
      val ring = View(this).apply {
        background = GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor(0x336EE7B7)
        }
        alpha = 0f
      }
      block.addView(ring, FrameLayout.LayoutParams(dp(150), dp(150), Gravity.CENTER))
      loop(
        ObjectAnimator.ofPropertyValuesHolder(
          ring,
          PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.65f),
          PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.65f),
          PropertyValuesHolder.ofFloat(View.ALPHA, 0.7f, 0f)
        ),
        2400,
        delay = 800L * index,
        interpolator = DecelerateInterpolator()
      )
    }

    val frame = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(GLASS_BORDER)
      }
    }
    val photo = ImageView(this).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      outlineProvider = object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) {
          outline.setOval(0, 0, view.width, view.height)
        }
      }
      clipToOutline = true
      contentDescription = callerName
    }
    frame.addView(photo, FrameLayout.LayoutParams(dp(150), dp(150), Gravity.CENTER))
    block.addView(frame, FrameLayout.LayoutParams(dp(158), dp(158), Gravity.CENTER))
    loop(
      ObjectAnimator.ofPropertyValuesHolder(
        frame,
        PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.035f),
        PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.035f)
      ),
      1600,
      reverse = true
    )

    val cached = IncomingCallNotifier.cachedAvatar(callerImage)
    photo.setImageBitmap(cached ?: IncomingCallNotifier.initialsAvatar(callerName))
    if (cached == null && callerImage.startsWith("http")) {
      val wanted = callerImage
      Thread {
        val bitmap = IncomingCallNotifier.downloadAvatar(wanted) ?: return@Thread
        runOnUiThread { if (!isDestroyed && wanted == callerImage) photo.setImageBitmap(bitmap) }
      }.start()
    }

    frame.scaleX = 0.85f
    frame.scaleY = 0.85f
    frame.animate().scaleX(1f).scaleY(1f).setDuration(520).setInterpolator(OvershootInterpolator(1.6f)).start()
    return block
  }

  private fun actionsRow(): LinearLayout {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    row.addView(actionColumn("Decline", DECLINE, 135f, halo = false) { decline() }, LinearLayout.LayoutParams(0, WRAP, 1f))
    row.addView(actionColumn("Answer", ANSWER, 0f, halo = true) { answer() }, LinearLayout.LayoutParams(0, WRAP, 1f))
    return row
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun actionColumn(
    label: String,
    color: Int,
    iconRotation: Float,
    halo: Boolean,
    onTap: () -> Unit
  ): LinearLayout {
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    val holder = FrameLayout(this).apply { clipChildren = false }

    if (halo) {
      val ring = View(this).apply {
        background = GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor(color)
        }
        alpha = 0f
      }
      holder.addView(ring, FrameLayout.LayoutParams(dp(76), dp(76), Gravity.CENTER))
      loop(
        ObjectAnimator.ofPropertyValuesHolder(
          ring,
          PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.5f),
          PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.5f),
          PropertyValuesHolder.ofFloat(View.ALPHA, 0.45f, 0f)
        ),
        1600,
        interpolator = DecelerateInterpolator()
      )
    }

    val button = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(color)
      }
      elevation = dp(6).toFloat()
      isClickable = true
      isFocusable = true
      contentDescription = label
    }
    val icon = ImageView(this).apply {
      setImageResource(R.drawable.kinbech_call_notification)
      setColorFilter(Color.WHITE)
      rotation = iconRotation
    }
    button.addView(icon, FrameLayout.LayoutParams(dp(34), dp(34), Gravity.CENTER))
    holder.addView(button, FrameLayout.LayoutParams(dp(76), dp(76), Gravity.CENTER))
    column.addView(holder, LinearLayout.LayoutParams(dp(120), dp(120)))

    button.setOnTouchListener { view, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> view.animate().scaleX(0.9f).scaleY(0.9f).setDuration(90).start()
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> view.animate().scaleX(1f).scaleY(1f).setDuration(160).start()
      }
      false
    }
    button.setOnClickListener {
      it.performHapticFeedback(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          if (halo) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.REJECT
        } else {
          HapticFeedbackConstants.VIRTUAL_KEY
        }
      )
      onTap()
    }

    if (halo) {
      val bob = dp(8).toFloat()
      loop(
        ValueAnimator.ofFloat(0f, 1f).apply {
          addUpdateListener { animation ->
            val t = animation.animatedValue as Float
            if (t < 0.4f) {
              val p = t / 0.4f
              button.translationY = -bob * sin(p * PI).toFloat()
              icon.rotation = 14f * sin(p * 4 * PI).toFloat()
            } else {
              button.translationY = 0f
              icon.rotation = 0f
            }
          }
        },
        1700,
        interpolator = AccelerateDecelerateInterpolator()
      )
    }

    val text = TextView(this).apply {
      this.text = label
      setTextColor(MUTED)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      gravity = Gravity.CENTER
    }
    column.addView(text, LinearLayout.LayoutParams(WRAP, WRAP))
    return column
  }

  private fun answer() {
    if (handled) return
    handled = true
    startActivity(IncomingCallNotifier.launchIntent(this, chatId, callerName, callerImage, "answer"))
    IncomingCallNotifier.cancel(this, chatId)
    finish()
  }

  private fun decline() {
    if (handled) return
    handled = true
    CallActionReceiver.decline(this, chatId)
    finish()
  }

  private fun statusText(visibleDots: Int): CharSequence {
    val base = "Incoming call"
    val text = SpannableString("$base...")
    text.setSpan(
      ForegroundColorSpan(Color.TRANSPARENT),
      base.length + visibleDots,
      text.length,
      Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
    )
    return text
  }

  private fun loop(
    animator: ValueAnimator,
    duration: Long,
    delay: Long = 0,
    reverse: Boolean = false,
    interpolator: android.animation.TimeInterpolator? = null
  ) {
    animator.duration = duration
    animator.startDelay = delay
    animator.repeatCount = ValueAnimator.INFINITE
    animator.repeatMode = if (reverse) ValueAnimator.REVERSE else ValueAnimator.RESTART
    if (interpolator != null) animator.interpolator = interpolator
    animators.add(animator)
    animator.start()
  }

  private fun stopAnimations() {
    animators.forEach { it.cancel() }
    animators.clear()
    handler.removeCallbacks(dotsTick)
  }

  private fun dp(value: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

  companion object {
    const val EXTRA_RING_UNTIL = "kinbechCallRingUntil"

    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
    private val BASE = 0xFF03130E.toInt()
    private val MUTED = 0xADFFFFFF.toInt()
    private const val GLASS = 0x1AFFFFFF
    private const val GLASS_BORDER = 0x29FFFFFF
    private val ANSWER = 0xFF22C55E.toInt()
    private val DECLINE = 0xFFEF4444.toInt()

    private var current: WeakReference<IncomingCallActivity>? = null

    fun dismiss(chatId: String) {
      val activity = current?.get() ?: return
      activity.runOnUiThread {
        if (activity.chatId == chatId && !activity.isFinishing) activity.finish()
      }
    }
  }
}
