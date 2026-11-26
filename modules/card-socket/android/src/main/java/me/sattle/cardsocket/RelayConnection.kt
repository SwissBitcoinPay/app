package me.sattle.cardsocket

import android.content.Context
import android.os.Handler
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import kotlin.math.min
import kotlin.random.Random

/**
 * This phone's connection to one card relay (`GET /v1/listen`, sattleme/relay): the
 * relay sends `{"type":"hello","heartbeatSeconds"}`, then a heartbeat every period and each tap's
 * wake packet (`{"type":"wake","cr":…}`), which goes to the app's task (CardSocketTaskConsumer).
 *
 * The connection is proven alive by the relay's messages only (OkHttp answers the relay's pings by
 * itself, and does not show them): none for twice the heartbeat and 30 s more, and it is given up
 * and made again. Checked by a timer that each message sets again, while the processor runs; in
 * Doze, where it sleeps and a dead connection brings nothing to wake it, by the service's watchdog
 * alarm (about every 10 minutes). Lost, it is made again after a delay that doubles from 2 s to
 * 5 minutes, drawn at random below it (many phones lose a relay at once: it restarts). A relay that
 * does not know the token (401, 404) is asked again after 30 minutes only: the app gives its
 * channels the token's hash at its next sync, and calls `configure`, which tries again at once.
 *
 * Every method runs on the service's handler thread; OkHttp's callbacks are brought there, and those
 * of a socket given up meanwhile are dropped (`generation`). Its state is its own: the status it
 * shows (CardSocketStatus, shared by the service's instances in a process) only mirrors it, and
 * only while this connection is the host's latest (a stopped service's connection, ending after a
 * new one began, never writes over it).
 */
internal class RelayConnection(
  private val context: Context,
  private val client: OkHttpClient,
  private val handler: Handler,
  val host: String,
  heartbeatSeconds: Int,
) {
  private val status = CardSocketStatus.relay(host).also { it.owner = this }
  private var heartbeatS = heartbeatSeconds
  private var socket: WebSocket? = null
  private var generation = 0
  private var failures = 0
  private var stopped = false
  private var state = "connecting"
  private var stateSince = System.currentTimeMillis()
  private var lastMessageAt: Long? = null
  private var nextAttemptAt: Long? = null
  /**
   * No attempt before this (ms, wall clock): the relay asked for it (429, 503, `Retry-After`).
   * Neither a network change nor the app's next sync shortens it.
   */
  private var notBefore = 0L
  /** The SHA-256 of the token this connection was opened with: another one means reconnect. */
  private var openedWith: String? = null
  /** When the relay's last wakes came, for WAKES_PER_MINUTE. */
  private val recentWakes = ArrayDeque<Long>()
  private val retry = Runnable { connect() }
  private val connectCheck = Runnable { check(System.currentTimeMillis()) }
  private val staleCheck = Runnable { check(System.currentTimeMillis()) }

  init {
    mirror { it.heartbeatSeconds = heartbeatS }
  }

  /** Writes to the status this connection shows, while it is the host's latest. */
  private inline fun mirror(write: (CardSocketStatus.Relay) -> Unit) {
    if (status.owner === this) write(status)
  }

  fun setHeartbeat(seconds: Int) {
    heartbeatS = seconds
    mirror { it.heartbeatSeconds = seconds }
    // Another period, another silence to wait for.
    if (state == "open") armStaleCheck()
  }

  private fun state(next: String) {
    state = next
    stateSince = System.currentTimeMillis()
    mirror {
      it.state = next
      it.stateSince = stateSince
    }
  }

  private fun nextAttempt(at: Long?) {
    nextAttemptAt = at
    mirror { it.nextAttemptAt = at }
  }

  /** Opens the connection now, giving up the current one if any. */
  fun connect() {
    if (stopped) return
    handler.removeCallbacks(retry)
    drop()
    val token = try {
      CardSocketStore.token(context, host)
    } catch (e: Exception) {
      // The Keystore or the storage failed, for now: tried again later, the token kept.
      waitFor("tokenError", backoff())
      return
    }
    if (token == null) {
      waitFor("noToken", LONG_WAIT_MS)
      return
    }
    openedWith = CardSocketStore.hashOf(token)
    val bearer = token.joinToString("") { "%02x".format(it) }
    token.fill(0)
    val request = Request.Builder()
      .url("https://$host/v1/listen")
      .header("Authorization", "Bearer $bearer")
      .build()
    val mine = ++generation
    state("connecting")
    nextAttempt(null)
    socket = client.newWebSocket(request, Listener(mine))
    // A handshake that never ends (no read timeout on this client): given up after CONNECT_MAX_MS.
    handler.postDelayed(connectCheck, CONNECT_MAX_MS + 1_000)
  }

  /**
   * Asked by the app (it just gave its channels the token's hash, CardSocketModule `configure`): a
   * connection opened with another token than the one the phone now holds (drawn again: the
   * Keystore lost its key) is made again at once, else the relay would wake a hash nobody listens
   * with; a waiting one tries now.
   */
  fun refresh() {
    if (stopped) return
    val current = try {
      CardSocketStore.currentHash(context, host)
    } catch (e: Exception) {
      // Unreadable for now: the connection stays as it is.
      return
    }
    if (state != "waiting" && current != openedWith) {
      failures = 0
      connect()
    } else {
      onNetwork(changed = false)
    }
  }

  /** Gives up the current socket, its late callbacks ignored. */
  private fun drop() {
    generation++
    socket?.cancel()
    socket = null
    handler.removeCallbacks(connectCheck)
    handler.removeCallbacks(staleCheck)
  }

  /**
   * The connection's silence checked once it could be stale. The handler's clock stops while the
   * processor sleeps, so this fires late, never early; `check` measures the silence on the wall
   * clock.
   */
  private fun armStaleCheck() {
    handler.removeCallbacks(staleCheck)
    handler.postDelayed(staleCheck, staleAfterMs() + 1_000)
  }

  private fun staleAfterMs() = heartbeatS * 2_000L + STALE_MARGIN_MS

  /** Ends for good (the relay no longer listened to, the service stopping). */
  fun stop() {
    stopped = true
    handler.removeCallbacks(retry)
    handler.removeCallbacks(connectCheck)
    handler.removeCallbacks(staleCheck)
    generation++
    socket?.close(1000, null)
    socket = null
    nextAttempt(null)
    state("stopped")
  }

  /** The connection is lost: made again after `delayMs`, the reason kept for the journal. */
  private fun waitFor(reason: String, delayMs: Long) {
    drop()
    mirror {
      it.failures++
      it.lastFailure = reason
    }
    if (stopped) return
    state("waiting")
    nextAttempt(System.currentTimeMillis() + delayMs)
    handler.postDelayed(retry, delayMs)
  }

  /**
   * The next delay: doubling from BASE_BACKOFF_MS to MAX_BACKOFF_MS, drawn between half and all of
   * it. A connection lost after it stayed open STABLE_MS, the relay heard on it, worked: tried again
   * from the shortest delay, even lost before its first heartbeat (240 s by default). Not one lost at
   * its handshake, else a relay or a network that accepts, then drops at once, would be asked again
   * every 2 s, for good.
   */
  private fun backoff(): Long {
    if (state == "open" && lastMessageAt != null && System.currentTimeMillis() - stateSince >= STABLE_MS) {
      failures = 0
    }
    failures = min(failures + 1, 20)
    val ceiling = min(MAX_BACKOFF_MS, BASE_BACKOFF_MS shl min(failures - 1, 16))
    return ceiling / 2 + Random.nextLong(ceiling / 2 + 1)
  }

  /**
   * At the watchdog's alarm and after a handshake's time: a connection silent for twice the
   * heartbeat and 30 s more is given up (its NAT mapping likely dropped), as is a handshake that
   * never ended; a wait past its time (the phone slept through it) ends now.
   */
  fun check(now: Long) {
    if (stopped) return
    when (state) {
      "open" -> {
        val last = lastMessageAt ?: stateSince
        if (now - last > staleAfterMs()) {
          failures = 0
          waitFor("stale", 0)
        }
      }
      "connecting" -> if (now - stateSince > CONNECT_MAX_MS) waitFor("connectTimeout", backoff())
      "waiting" -> {
        val next = nextAttemptAt
        if (next != null && now >= next) connect()
      }
    }
  }

  /** The phone's default network came back, or changed (Wi-Fi to mobile…). */
  fun onNetwork(changed: Boolean) {
    if (stopped) return
    when {
      // A socket opened on the network the phone left is dead, even if nothing said so yet.
      changed && state == "open" -> {
        failures = 0
        waitFor("networkChanged", 0)
      }
      state == "waiting" -> {
        if (System.currentTimeMillis() < notBefore) return
        failures = 0
        connect()
      }
    }
  }

  private fun onMessage(text: String) {
    val at = System.currentTimeMillis()
    lastMessageAt = at
    mirror { it.lastMessageAt = at }
    armStaleCheck()
    // Untrusted: Android's JSON parser recurses, so a deeply nested message would overflow the
    // thread's stack and end the app's process; none of the relay's is nested more than twice.
    if (text.length > MAX_MESSAGE_CHARS || nestingOf(text) > MAX_NESTING) return
    val message = try {
      JSONObject(text)
    } catch (e: Exception) {
      return
    }
    when (message.optString("type")) {
      "hello" -> {
        val beat = message.optInt("heartbeatSeconds", 0)
        if (beat in CardSocketStore.MIN_HEARTBEAT_S..CardSocketStore.MAX_HEARTBEAT_S) setHeartbeat(beat)
      }
      "wake" -> {
        // Read by the app as any wake packet: untrusted, opened with the device's key only.
        val packet = message.optJSONObject("cr") ?: return
        while (recentWakes.isNotEmpty() && at - recentWakes.first() >= 60_000L) recentWakes.removeFirst()
        if (recentWakes.size >= WAKES_PER_MINUTE) {
          // More than taps can give: each would keep the phone awake and run the app for nothing.
          CardSocketStatus.lastDispatchError = "rateLimited"
          return
        }
        recentWakes.addLast(at)
        mirror {
          it.wakes++
          it.lastWakeAt = at
        }
        try {
          if (!CardSocketTaskConsumer.dispatch(context, packet.toString(), at, host)) {
            CardSocketStatus.lastDispatchError = "noTask"
          }
        } catch (e: Exception) {
          CardSocketStatus.lastDispatchError = "taskError"
        }
      }
      // "heartbeat", and types of a later relay: their arrival is what counts.
    }
  }

  private inner class Listener(private val mine: Int) : WebSocketListener() {
    private fun on(run: () -> Unit) {
      handler.post { if (mine == generation && !stopped) run() }
    }

    override fun onOpen(webSocket: WebSocket, response: Response) = on {
      handler.removeCallbacks(connectCheck)
      // `failures` kept until the connection proves itself (backoff, STABLE_MS).
      lastMessageAt = null
      mirror {
        it.opened++
        it.lastMessageAt = null
      }
      state("open")
      armStaleCheck()
    }

    override fun onMessage(webSocket: WebSocket, text: String) = on { onMessage(text) }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      webSocket.close(1000, null)
      on {
        when (code) {
          // The relay restarts: back after a delay drawn between 5 and 60 s, as every phone does.
          1012 -> waitFor("closed1012", 5_000L + Random.nextLong(55_001L))
          else -> waitFor("closed$code", backoff())
        }
      }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = on {
      val code = response?.code
      when (code) {
        null -> waitFor("network", backoff())
        // The relay does not know this token: the app's next sync gives it, and calls configure.
        401, 404 -> waitFor("http$code", LONG_WAIT_MS)
        429, 503 -> {
          val asked = response?.header("Retry-After")?.toLongOrNull()?.coerceIn(1, 3_600)?.times(1_000)
          val delay = maxOf(asked ?: 0, backoff())
          notBefore = System.currentTimeMillis() + delay
          waitFor("http$code", delay)
        }
        else -> waitFor("http$code", backoff())
      }
    }
  }

  companion object {
    const val BASE_BACKOFF_MS = 2_000L
    const val MAX_BACKOFF_MS = 5 * 60_000L
    const val LONG_WAIT_MS = 30 * 60_000L
    const val CONNECT_MAX_MS = 30_000L
    const val STALE_MARGIN_MS = 30_000L
    /** How long a connection stays open before its loss counts as none (the shortest heartbeat). */
    const val STABLE_MS = 30_000L

    /**
     * The relay's messages are small (a wake about 600 characters): a larger one is not read, as the
     * app drops a packet over 4096 characters anyway (background-wake.ts). OkHttp 4.9.2 has already
     * held it whole in memory by then, with no limit of its own: a relay is trusted that far.
     */
    const val MAX_MESSAGE_CHARS = 4_096
    const val MAX_NESTING = 8

    /** Wakes taken from one relay in a minute at most: a card is not tapped faster. */
    const val WAKES_PER_MINUTE = 20

    /** The deepest nesting of brackets in `text`, its strings counted too (a wake's are base64url). */
    fun nestingOf(text: String): Int {
      var depth = 0
      var deepest = 0
      for (c in text) {
        when (c) {
          '{', '[' -> {
            depth++
            if (depth > deepest) deepest = depth
          }
          '}', ']' -> depth--
        }
      }
      return deepest
    }
  }
}
