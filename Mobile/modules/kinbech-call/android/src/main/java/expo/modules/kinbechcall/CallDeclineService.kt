package expo.modules.kinbechcall

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class CallDeclineService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val chatId = intent?.getStringExtra("chatId") ?: return null
    val data = Arguments.createMap().apply { putString("chatId", chatId) }
    return HeadlessJsTaskConfig(TASK_KEY, data, 20000, true)
  }

  companion object {
    const val TASK_KEY = "KinBechCallDecline"
  }
}
