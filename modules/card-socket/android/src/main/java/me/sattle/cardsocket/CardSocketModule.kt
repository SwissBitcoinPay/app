package me.sattle.cardsocket

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.provider.Settings
import expo.modules.interfaces.taskManager.TaskManagerInterface
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** A relay to listen to, as the app gives it (src/lib/card/card-socket.ts). */
class RelayRecord : Record {
  @Field val host: String = ""

  @Field val heartbeatSeconds: Int = 0
}

/** The service notification's texts, in the app's language. */
class TextsRecord : Record {
  @Field val channelName: String = ""

  @Field val title: String = ""

  @Field val text: String = ""

  @Field val stop: String = ""
}

/**
 * The card socket, as the app drives it (src/lib/card/card-socket.ts): its listening token's hash
 * per relay, on and off, the relays to listen to, what it did (status), and the app's task that its
 * wake packets run. Android only.
 */
class CardSocketModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val taskManager: TaskManagerInterface by lazy {
    appContext.legacyModule<TaskManagerInterface>() ?: throw IllegalStateException("expo-task-manager is not linked")
  }

  override fun definition() = ModuleDefinition {
    Name("CardSocket")

    // The SHA-256 of this phone's listening token for `host` (base64url), drawn the first time.
    AsyncFunction("listenHash") { host: String ->
      CardSocketStore.listenHash(context, host)
    }

    // On (the default: started once it has relays) or off, as its holder chooses.
    AsyncFunction("setEnabled") { enabled: Boolean ->
      CardSocketStore.setEnabled(context, enabled)
      if (enabled) CardSocketService.start(context, "app") else CardSocketService.stop(context)
    }

    // The relays to listen to (the account's active cards' relays that serve /v1/listen), and the
    // notification's texts in the app's language. Started when on and given relays.
    AsyncFunction("configure") { relays: List<RelayRecord>, texts: TextsRecord ->
      val given = SocketTexts(texts.channelName, texts.title, texts.text, texts.stop)
      CardSocketStore.setRelays(context, relays.map { ListenedRelay(it.host, it.heartbeatSeconds) }, given)
      if (relays.isEmpty()) CardSocketService.stop(context) else CardSocketService.start(context, "app")
    }

    // What it does, for "Wake journal": never a token nor a packet.
    Function("status") {
      // Unreadable now: thrown, never told as "off" (src/features/card/relay-sync.ts).
      val config = CardSocketStore.config(context, strict = true)
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      mapOf(
        "enabled" to config.enabled,
        "relays" to config.relays.map { mapOf("host" to it.host, "heartbeatSeconds" to it.heartbeatSeconds) },
        "running" to (CardSocketService.instance != null),
        "startedAt" to CardSocketStatus.startedAt?.toDouble(),
        "startReason" to CardSocketStatus.startReason,
        "lastStartError" to CardSocketStatus.lastStartError,
        "lastDispatchError" to CardSocketStatus.lastDispatchError,
        "ignoringBatteryOptimizations" to power.isIgnoringBatteryOptimizations(context.packageName),
        "notification" to notificationState(),
        "connections" to CardSocketStatus.snapshot(),
      )
    }

    // "Log out": its state and its Keystore key gone, then stopped (a start on its way reads
    // the state there: none, it stops).
    AsyncFunction("forget") {
      CardSocketStore.forget(context)
      CardSocketService.stop(context)
    }

    // The app's task that each wake packet runs (CardSocketTaskConsumer).
    AsyncFunction("registerTaskAsync") { taskName: String ->
      taskManager.registerTask(taskName, CardSocketTaskConsumer::class.java, emptyMap<String, Any>())
    }

    // The settings of the service's notification channel, where the holder may turn it off: the
    // notification no longer shows, the service goes on. Android raises the channel to a visible
    // level the first time the service shows, then keeps the holder's choice
    // (NotificationManagerService): offered by the app once the service ran.
    AsyncFunction("openNotificationSettings") {
      context.startActivity(
        Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          .putExtra(Settings.EXTRA_CHANNEL_ID, CardSocketService.CHANNEL_ID)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }

    // Android's list of apps exempt from battery optimisation, where the holder may add this one
    // (no permission needed: REQUEST_IGNORE_BATTERY_OPTIMIZATIONS is restricted on Google Play).
    AsyncFunction("openBatterySettings") {
      context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  /**
   * The service's notification as the phone shows it: "none" before the service first ran (no
   * channel yet), "hidden" when its holder turned the channel (or the app's notifications) off,
   * "shown" otherwise.
   */
  private fun notificationState(): String {
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = manager.getNotificationChannel(CardSocketService.CHANNEL_ID) ?: return "none"
    val off = !manager.areNotificationsEnabled() || channel.importance == NotificationManager.IMPORTANCE_NONE
    return if (off) "hidden" else "shown"
  }
}
