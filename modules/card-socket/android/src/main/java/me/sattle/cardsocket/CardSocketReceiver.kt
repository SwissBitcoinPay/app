package me.sattle.cardsocket

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The card socket's own intents (not exported): its watchdog alarm, which checks that each
 * connection still lives and starts the service again if the system ended it (from an inexact
 * alarm, Android 12+ allows it only where the holder exempted the app from battery optimisation:
 * else the refusal is noted, `lastStartError`, and the app's next card sync starts it); and
 * "Stop" of its notification, which turns the socket off until its holder turns it on again in
 * the app.
 */
class CardSocketReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_WATCHDOG -> {
        val running = CardSocketService.instance
        if (running == null) {
          CardSocketService.start(context, "watchdog")
          return
        }
        // The alarm's broadcast keeps the processor awake until finish().
        val pending = goAsync()
        running.check { pending.finish() }
      }
      ACTION_STOP -> {
        try {
          CardSocketStore.setEnabled(context, false)
        } catch (e: Exception) {
          // A newer app's state: it is stopped all the same.
        }
        CardSocketService.stop(context)
      }
    }
  }

  companion object {
    const val ACTION_WATCHDOG = "me.sattle.cardsocket.WATCHDOG"
    const val ACTION_STOP = "me.sattle.cardsocket.STOP"
  }
}

/**
 * The phone's start (delivered after its first unlock) and the app's update (which ends its
 * process): the service again, unless its holder turned it off. Both are protected broadcasts,
 * which only the system sends; starting a foreground service from them is allowed (Android 12+).
 */
class CardSocketBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED -> CardSocketService.start(context, "boot")
      Intent.ACTION_MY_PACKAGE_REPLACED -> CardSocketService.start(context, "update")
    }
  }
}
