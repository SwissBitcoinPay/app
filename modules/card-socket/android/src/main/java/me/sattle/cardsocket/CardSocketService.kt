package me.sattle.cardsocket

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.SystemClock
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * The card socket, in both variants: a foreground service of
 * type specialUse that keeps this phone's connection to each relay its cards pay through
 * (RelayConnection), the way every Android phone is woken for its cards' taps (the app has no push
 * on Android). Android shows its notification as long as it runs (the user may hide it, or stop the
 * service from it, "Stop").
 *
 * On by default: started by the app once it has relays (CardSocketModule `configure`), again by the
 * system after it ended the process (START_STICKY), at the phone's start and after the app's update
 * (CardSocketBootReceiver). Stopped when its holder turns it off (in the app, or "Stop"), and
 * with "Log out".
 *
 * A foreground service keeps the network in Doze (Android's NetworkPolicyManager: process states up
 * to a bound foreground service), but the processor sleeps: the relay's heartbeat and the wake
 * packets wake it, a watchdog alarm (about every 10 minutes in Doze) and the network's changes
 * check that each connection still lives.
 */
class CardSocketService : Service() {
  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  /** By host; touched on the handler's thread only. */
  private val connections = HashMap<String, RelayConnection>()
  private var networkCallback: ConnectivityManager.NetworkCallback? = null
  /** The default network last seen: another one means the sockets opened on this one are dead. */
  private var network: Network? = null
  /**
   * Set as this instance is asked to stop (stop, stopSelf), and first thing in onDestroy: what is
   * asked of it then goes to a new one (Android ends it a little later, on the main thread).
   */
  @Volatile private var destroyed = false
  /** Whether startForeground succeeded: before, the configuration is read by onStartCommand. */
  @Volatile private var foreground = false
  /** The texts its notification shows, to show the app's new ones (another language). */
  @Volatile private var shownTexts: SocketTexts? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    thread = HandlerThread("card-socket").apply { start() }
    handler = Handler(thread.looper)
    CardSocketStatus.startedAt = System.currentTimeMillis()
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // First: Android ends (and reports as a crash) a service started for the foreground that does
    // not call startForeground within seconds, even one about to stop.
    val shown = goForeground(CardSocketStore.config(this).texts)
    // Under `start`'s lock: a start asked meanwhile either finds this instance ending once Android
    // took its stopSelf, and makes a new one, or comes after the configuration read here. Else it
    // could reach Android first, go to this instance, and end with it.
    synchronized(Companion) {
      starting = false
      if (!shown) {
        destroyed = true
        stopSelf()
        return START_NOT_STICKY
      }
      // No intent: the system started it again after ending the process (START_STICKY).
      CardSocketStatus.startReason = intent?.getStringExtra(EXTRA_REASON) ?: "restart"
      // Read once in the foreground: a stop asked meanwhile (`stop`, which leaves a start on its
      // way here to the configuration its caller wrote) is seen now.
      val config = CardSocketStore.config(this)
      if (!config.runnable) {
        destroyed = true
        stopSelf()
        return START_NOT_STICKY
      }
      handler.post { apply(config) }
    }
    listenToNetwork()
    scheduleWatchdog(this)
    return START_STICKY
  }

  private fun goForeground(texts: SocketTexts?): Boolean {
    val notification = notificationOf(texts)
    return try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      shownTexts = texts
      foreground = true
      true
    } catch (e: Exception) {
      // Refused from the background (Android 12+), or this build without the permission.
      CardSocketStatus.lastStartError = e.javaClass.simpleName
      false
    }
  }

  /** Its notification channel (made, or renamed), and its notification, in the app's language. */
  private fun notificationOf(texts: SocketTexts?): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    // IRREVERSIBLE: the channel's id, which the phone's settings keep (the holder may hide it
    // there). Low: no sound, no peek; Android raises a foreground service's lower channel to this
    // anyway (NotificationManagerService), and warns the user of a lower notification.
    val channel = NotificationChannel(CHANNEL_ID, texts?.channelName ?: "Card payments", NotificationManager.IMPORTANCE_LOW)
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val open = launch?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val stop = PendingIntent.getBroadcast(
      this,
      1,
      Intent(this, CardSocketReceiver::class.java).setAction(CardSocketReceiver.ACTION_STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    // The app's notification icon (expo-notifications' plugin writes it), else the app's own.
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 } ?: applicationInfo.icon
    return Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(icon)
      .setContentTitle(texts?.title ?: "sattle.me")
      .setContentText(texts?.text)
      .setOngoing(true)
      .setShowWhen(false)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setContentIntent(open)
      .apply { if (texts != null) addAction(Notification.Action.Builder(null, texts.stop, stop).build()) }
      .build()
  }

  /** The relays to listen to, as the app last gave them: new ones connected, gone ones closed. */
  private fun apply(config: SocketConfig) {
    if (destroyed) return
    val wanted = config.relays.associateBy { it.host }
    for ((host, connection) in connections.entries.toList()) {
      if (host !in wanted) {
        connection.stop()
        connections.remove(host)
      }
    }
    for (relay in config.relays) {
      val known = connections[relay.host]
      if (known != null) {
        known.setHeartbeat(relay.heartbeatSeconds)
        // Asked by the app (its channels just took the token's hash): made again with a token drawn
        // again, a waiting one tries now.
        known.refresh()
      } else {
        connections[relay.host] = RelayConnection(this, client, handler, relay.host, relay.heartbeatSeconds).also { it.connect() }
      }
    }
    CardSocketStatus.keepOnly(wanted.keys)
  }

  /**
   * The watchdog's alarm: each connection checked (CardSocketReceiver holds the processor meanwhile).
   * Not for an instance asked to stop: its connections end, and the alarm (cancelled in onDestroy)
   * is not set again.
   */
  internal fun check(done: () -> Unit) {
    val posted = handler.post {
      if (!destroyed) {
        val now = System.currentTimeMillis()
        for (connection in connections.values) connection.check(now)
        scheduleWatchdog(this)
      }
      done()
    }
    // The handler's thread already ended: nothing to check, the processor let go.
    if (!posted) done()
  }

  /**
   * The configuration changed (CardSocketModule): applied, or the service stops when it is off.
   * False when this instance is ending: a new one must be started. Not in the foreground yet:
   * onStartCommand reads the configuration once it is (stopping it before would end the app).
   */
  internal fun refresh(): Boolean {
    if (destroyed) return false
    if (!foreground) return true
    val config = CardSocketStore.config(this)
    if (!config.runnable) {
      destroyed = true
      stopSelf()
      return true
    }
    // The app's new texts (its language changed): the notification shows them. Only then, so that
    // a notification its holder swiped away (Android 14+) does not come back at each card sync.
    val texts = config.texts
    if (texts != shownTexts) {
      try {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notificationOf(texts))
        shownTexts = texts
      } catch (e: Exception) {
        // The former texts stay; the next start shows the new ones.
      }
    }
    handler.post { apply(config) }
    return true
  }

  private fun listenToNetwork() {
    if (networkCallback != null) return
    val manager = getSystemService(ConnectivityManager::class.java)
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(available: Network) {
        handler.post {
          val changed = network != null && network != available
          network = available
          for (connection in connections.values) connection.onNetwork(changed)
        }
      }
    }
    try {
      manager.registerDefaultNetworkCallback(callback, handler)
      networkCallback = callback
    } catch (e: Exception) {
      // Too many callbacks registered by the app (Android's limit): the watchdog alone checks.
    }
  }

  override fun onDestroy() {
    destroyed = true
    if (instance === this) instance = null
    networkCallback?.let {
      try {
        getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it)
      } catch (e: Exception) {
      }
    }
    networkCallback = null
    cancelWatchdog(this)
    handler.post {
      for (connection in connections.values) connection.stop()
      connections.clear()
      thread.quitSafely()
    }
    super.onDestroy()
  }

  companion object {
    // IRREVERSIBLE: the notification channel's id (the phone's settings keep it).
    const val CHANNEL_ID = "card-socket"
    private const val NOTIFICATION_ID = 0x5bc0
    const val EXTRA_REASON = "reason"
    /** About every 10 minutes: Doze lets an app's allow-while-idle alarm fire about every 9. */
    private const val WATCHDOG_MS = 10 * 60_000L

    @Volatile internal var instance: CardSocketService? = null

    /**
     * Android was asked to start the service for the foreground, which has not called
     * startForeground yet (onStartCommand clears it): stopped before, the app would be ended as if
     * it crashed (Android 9+).
     */
    @Volatile private var starting = false

    /** One client for every instance of the process: its threads and pool are not made again at each start. */
    private val client: OkHttpClient by lazy {
      OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        // No read timeout: the connection is silent between heartbeats. A handshake that never ends
        // is given up by RelayConnection.
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        // No pings of the phone's own: the relay's heartbeat keeps the connection and proves it.
        .pingInterval(0, TimeUnit.MILLISECONDS)
        .build()
    }

    /** Starts the service (or gives it the new configuration). Never throws: a refusal is noted. */
    @Synchronized
    fun start(context: Context, reason: String) {
      if (instance?.refresh() == true) return
      val config = CardSocketStore.config(context)
      if (!config.runnable) return
      try {
        starting = true
        val started = context.startForegroundService(Intent(context, CardSocketService::class.java).putExtra(EXTRA_REASON, reason))
        if (started == null) starting = false
        // No such service: a build without it.
        CardSocketStatus.lastStartError = if (started == null) "noService" else null
      } catch (e: Exception) {
        starting = false
        // ForegroundServiceStartNotAllowedException from the background (Android 12+).
        CardSocketStatus.lastStartError = e.javaClass.simpleName
      }
    }

    /**
     * Stops the service, once its caller wrote the configuration that turns it off (off, no relays,
     * forgotten): a start on its way to the foreground reads it there and stops itself. The
     * instance is marked at once, so that a start asked before Android ends it makes a new one.
     */
    @Synchronized
    fun stop(context: Context) {
      if (starting) return
      instance?.destroyed = true
      context.stopService(Intent(context, CardSocketService::class.java))
    }

    private fun watchdogIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
      context,
      2,
      Intent(context, CardSocketReceiver::class.java).setAction(CardSocketReceiver.ACTION_WATCHDOG),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    internal fun scheduleWatchdog(context: Context) {
      val alarms = context.getSystemService(AlarmManager::class.java)
      alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + WATCHDOG_MS, watchdogIntent(context))
    }

    private fun cancelWatchdog(context: Context) {
      context.getSystemService(AlarmManager::class.java).cancel(watchdogIntent(context))
    }
  }
}
