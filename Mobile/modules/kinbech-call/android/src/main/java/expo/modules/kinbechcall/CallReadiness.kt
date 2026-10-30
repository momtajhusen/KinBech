package expo.modules.kinbechcall

import android.app.Activity
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

/** What stops a call from ringing while KinBech is closed or the phone is locked. */
object CallReadiness {
  // Brands whose battery managers stop FCM delivery after the app is swiped away, unless autostart is allowed.
  private val AUTOSTART_BRANDS = setOf("vivo", "iqoo", "xiaomi", "redmi", "poco", "oppo", "realme", "oneplus", "huawei", "honor", "infinix", "tecno", "itel")

  private val AUTOSTART_SCREENS = listOf(
    ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
    ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
    ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
    ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
    ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
    ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
    ComponentName("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"),
    ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
    ComponentName("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"),
    ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
    ComponentName("com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity")
  )

  fun read(context: Context): Map<String, Any> {
    val manager = context.getSystemService(NotificationManager::class.java)
    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val fullScreen = if (Build.VERSION.SDK_INT >= 34) manager?.canUseFullScreenIntent() ?: true else true
    val channelOn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager?.getNotificationChannel(IncomingCallNotifier.CHANNEL_ID)?.importance != NotificationManager.IMPORTANCE_NONE
    } else {
      true
    }
    val brand = Build.MANUFACTURER.orEmpty().lowercase()
    return mapOf(
      "notifications" to (IncomingCallNotifier.canPost(context) && channelOn),
      "fullScreen" to fullScreen,
      "batteryUnrestricted" to (power?.isIgnoringBatteryOptimizations(context.packageName) ?: true),
      "manufacturer" to brand,
      "needsAutostart" to AUTOSTART_BRANDS.contains(brand)
    )
  }

  fun open(context: Context, kind: String): Boolean {
    val pkg = context.packageName
    val candidates = when (kind) {
      "notifications" -> listOf(
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
      )
      "fullScreen" -> listOf(Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT", Uri.parse("package:$pkg")))
      // These brands keep their own background power switch on the app info screen.
      // One-tap system dialog ("Let app always run in background?"), like WhatsApp uses.
      "batteryRequest" -> listOf(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg")),
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      )
      // Shown without a tap, so only the system dialog: never a Settings screen.
      "batteryPrompt" -> return startFirst(
        context,
        listOf(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg")))
      )
      "battery" -> if (AUTOSTART_BRANDS.contains(Build.MANUFACTURER.orEmpty().lowercase())) {
        emptyList<Intent>()
      } else {
        listOf(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
      }
      "autostart" -> AUTOSTART_SCREENS.map { Intent().setComponent(it) }
      else -> emptyList<Intent>()
    } + Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
    return startFirst(context, candidates)
  }

  private fun startFirst(context: Context, candidates: List<Intent>): Boolean {
    for (intent in candidates) {
      if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
        return true
      } catch (error: Exception) {
        // Not on this phone or not exported; try the next screen.
      }
    }
    return false
  }
}
