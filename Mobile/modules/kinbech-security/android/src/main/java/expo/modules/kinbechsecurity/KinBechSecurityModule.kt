package expo.modules.kinbechsecurity

import android.app.Activity
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KinBechSecurityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KinBechSecurity")

    Function("isDeveloperOptionsEnabled") {
      val resolver = appContext.reactContext?.contentResolver ?: return@Function false
      Settings.Global.getInt(resolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) != 0
    }

    // Falls back to the main Settings screen on phones that hide the developer page.
    Function("openDeveloperSettings") {
      val context = appContext.currentActivity ?: appContext.reactContext ?: return@Function false
      listOf(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS, Settings.ACTION_SETTINGS).any { action ->
        val intent = Intent(action)
        if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }.isSuccess
      }
    }
  }
}
