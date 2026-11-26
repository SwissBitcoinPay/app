package me.sattle.cardsocket

/**
 * What the card socket did since its process started, for "Wake journal" (the app reads it, to
 * measure the socket on a real phone). In memory only: the service runs in
 * the app's process, so the app reads what it holds; a new process starts from zero, and says why
 * it started. Times are the phone's clock (ms since the epoch). Never a token, a packet nor a key.
 */
internal object CardSocketStatus {
  class Relay(val host: String) {
    /** The connection that shows here (RelayConnection), the host's latest. */
    @Volatile var owner: Any? = null
    /** "connecting", "open", "waiting" (for the next attempt), "stopped". */
    @Volatile var state: String = "connecting"
    @Volatile var stateSince: Long = System.currentTimeMillis()
    /** The last message of the relay (hello, heartbeat, wake): what proves the connection lives. */
    @Volatile var lastMessageAt: Long? = null
    @Volatile var heartbeatSeconds: Int = 0
    @Volatile var opened: Int = 0
    @Volatile var failures: Int = 0
    /** Why the last connection ended: "http404", "closed1012", "network", "stale", "network-changed"… */
    @Volatile var lastFailure: String? = null
    @Volatile var nextAttemptAt: Long? = null
    @Volatile var wakes: Int = 0
    @Volatile var lastWakeAt: Long? = null

    fun toMap(): Map<String, Any?> = mapOf(
      "host" to host,
      "state" to state,
      "stateSince" to stateSince.toDouble(),
      "lastMessageAt" to lastMessageAt?.toDouble(),
      "heartbeatSeconds" to heartbeatSeconds,
      "opened" to opened,
      "failures" to failures,
      "lastFailure" to lastFailure,
      "nextAttemptAt" to nextAttemptAt?.toDouble(),
      "wakes" to wakes,
      "lastWakeAt" to lastWakeAt?.toDouble(),
    )
  }

  /** When this process started the service, and why: "app", "boot", "update", "restart", "watchdog". */
  @Volatile var startedAt: Long? = null
  @Volatile var startReason: String? = null
  /** The last time the service could not be started (Android refused it from the background…). */
  @Volatile var lastStartError: String? = null
  /**
   * A wake the app's task could not be given: "noTask" (never registered), "taskError", or
   * "rateLimited" (a relay sent more than RelayConnection.WAKES_PER_MINUTE).
   */
  @Volatile var lastDispatchError: String? = null

  private val relays = LinkedHashMap<String, Relay>()

  @Synchronized fun relay(host: String): Relay = relays.getOrPut(host) { Relay(host) }

  @Synchronized fun keepOnly(hosts: Collection<String>) {
    relays.keys.retainAll(hosts.toSet())
  }

  @Synchronized fun snapshot(): List<Map<String, Any?>> = relays.values.map { it.toMap() }
}
