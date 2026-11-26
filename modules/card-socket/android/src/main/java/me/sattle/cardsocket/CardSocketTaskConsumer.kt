package me.sattle.cardsocket

import android.content.Context
import android.os.Bundle
import android.os.PowerManager
import expo.modules.interfaces.taskManager.TaskConsumer
import expo.modules.interfaces.taskManager.TaskConsumerInterface
import expo.modules.interfaces.taskManager.TaskExecutionCallback
import expo.modules.interfaces.taskManager.TaskInterface
import expo.modules.interfaces.taskManager.TaskManagerUtilsInterface
import expo.modules.interfaces.taskManager.TaskServiceProviderHelper
import java.util.Collections

/**
 * The app's task a wake packet from the socket runs (CARD_SOCKET_TASK,
 * src/features/card/wake-task.android.ts), modelled on expo-notifications' own task consumer
 * (BackgroundRemoteNotificationTaskConsumer, expo-notifications 58.1.5). expo-task-manager
 * instantiates it when the app registers the task (CardSocketModule `registerTaskAsync`), and again
 * when it restores its tasks in a new process. The task gets `{packet: <the packet's JSON>,
 * receivedAt: <ms>, relay: <host>}`; expo-task-manager starts the app's JavaScript without any
 * screen when none runs (RNHeadlessAppLoader).
 *
 * IRREVERSIBLE: this class's name, which expo-task-manager keeps with the registered task.
 */
class CardSocketTaskConsumer(context: Context?, taskManagerUtils: TaskManagerUtilsInterface?) :
  TaskConsumer(context, taskManagerUtils),
  TaskConsumerInterface {

  @Volatile private var task: TaskInterface? = null

  init {
    consumers.add(this)
  }

  override fun taskType() = "card-socket"

  override fun didRegister(task: TaskInterface?) {
    this.task = task
  }

  override fun didUnregister() {
    consumers.remove(this)
    task = null
  }

  companion object {
    private val consumers: MutableSet<CardSocketTaskConsumer> = Collections.synchronizedSet(mutableSetOf())

    /**
     * How long the phone is kept awake for a wake's task at most: the app follows a payment
     * CARD_WAKE_MAX_MS (240 s, src/config/card.ts), then ends its task. A margin over it.
     */
    private const val WAKE_LOCK_MS = 250_000L

    /**
     * Gives a wake packet to the app's task, the phone kept awake until the task ends (Doze would
     * otherwise suspend the payment midway). False when no task is registered to take it.
     */
    fun dispatch(context: Context, packet: String, receivedAt: Long, relay: String): Boolean {
      val app = context.applicationContext
      // Side effect, as expo-notifications relies on it: the task service's constructor restores the
      // registered tasks, which instantiates this consumer in a process that has not yet.
      TaskServiceProviderHelper.getTaskServiceImpl(app)
      val targets = synchronized(consumers) { consumers.mapNotNull { it.task } }
      if (targets.isEmpty()) return false
      val power = app.getSystemService(Context.POWER_SERVICE) as PowerManager
      for (task in targets) {
        val lock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sattleme:card-socket-wake")
        lock.setReferenceCounted(false)
        lock.acquire(WAKE_LOCK_MS)
        val data = Bundle().apply {
          putString("packet", packet)
          putDouble("receivedAt", receivedAt.toDouble())
          putString("relay", relay)
        }
        // Called once the app's task resolved: the phone may sleep again.
        task.execute(data, null, TaskExecutionCallback { if (lock.isHeld) lock.release() })
      }
      return true
    }
  }
}
