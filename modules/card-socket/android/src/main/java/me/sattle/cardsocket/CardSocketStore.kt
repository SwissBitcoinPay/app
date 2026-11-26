package me.sattle.cardsocket

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.UnrecoverableKeyException
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** A relay this phone listens to (`GET /v1/listen`), and the heartbeat it announced (seconds). */
data class ListenedRelay(val host: String, val heartbeatSeconds: Int)

/** The service notification's texts, in the app's language (the app gives them). */
data class SocketTexts(val channelName: String, val title: String, val text: String, val stop: String)

/**
 * What the service runs with: whether it is on (its holder did not turn it off), the relays, the
 * notification's texts. It runs when on, with relays and texts.
 */
data class SocketConfig(val enabled: Boolean, val relays: List<ListenedRelay>, val texts: SocketTexts?) {
  val runnable: Boolean
    get() = enabled && relays.isNotEmpty() && texts != null
}

/**
 * What the card socket keeps on the phone, for the service to start again by itself (the system's
 * start, the app updated, the process ended): one JSON file in the app's no-backup directory, never
 * in a backup nor on another device. Each relay's listening token (32 random bytes, drawn here) is
 * encrypted with an AES-256-GCM key of the Android Keystore that never leaves it. The token only
 * opens `/v1/listen`, on which the relay sends wake packets encrypted for the device's key (kept by
 * the app, not here): it pays nothing, reads nothing. The app gives each of its card channels on
 * that relay the token's SHA-256 (`listenHash`), never the token.
 *
 * A token lost for good (the Keystore lost its key: a device restored, a security update; or its
 * bytes damaged) is drawn again: its hash changes, the app gives the new one to its channels at its
 * next sync, then calls `configure`, which makes the connection again with it
 * (RelayConnection.refresh). A failure that may pass (the Keystore busy) draws nothing: it throws.
 *
 * Written through AtomicFile (synced to the disk, then moved over the former file): a power cut
 * leaves the former state or the new one, never a damaged one.
 */
internal object CardSocketStore {
  // IRREVERSIBLE: the directory and file in the no-backup directory, the Keystore key's alias. A
  // renamed one would leave the old ones behind and turn every phone's socket off.
  private const val DIR_NAME = "card-socket"
  private const val FILE_NAME = "state.json"
  private const val KEY_ALIAS = "card-socket-tokens"

  /**
   * 1: {version, stopped (its holder turned it off; absent: on),
   * relays: [{host, heartbeatSeconds}], texts, tokens: {host: base64}}.
   */
  private const val FORMAT_VERSION = 1

  private const val TOKEN_BYTES = 32
  private const val GCM_IV_BYTES = 12
  private const val GCM_TAG_BITS = 128

  /** A canonical relay host as the app writes it (relay-host.ts): name, optional port. */
  private val HOST = Regex("^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::[1-9][0-9]{0,4})?$")

  const val MIN_HEARTBEAT_S = 30
  const val MAX_HEARTBEAT_S = 3600

  private val lock = Any()

  class NewerStateException : IllegalStateException("A newer app wrote the card socket's state")

  fun isHost(host: String): Boolean = host.length <= 259 && HOST.matches(host)

  private fun file(context: Context): AtomicFile {
    val dir = File(context.noBackupFilesDir, DIR_NAME)
    dir.mkdirs()
    return AtomicFile(File(dir, FILE_NAME))
  }

  /**
   * The stored state, or an empty one; NewerStateException for a newer app's. A storage that fails
   * for now throws (IOException): read as empty, a write after it would lose the tokens.
   */
  private fun read(context: Context): JSONObject {
    val text = try {
      String(file(context).readFully(), Charsets.UTF_8)
    } catch (e: FileNotFoundException) {
      return JSONObject()
    }
    val json = try {
      JSONObject(text)
    } catch (e: Exception) {
      // Written whole through AtomicFile: only a damaged storage gives this. Off.
      return JSONObject()
    }
    val version = json.optInt("version", 0)
    if (version > FORMAT_VERSION) throw NewerStateException()
    return if (version == FORMAT_VERSION) json else JSONObject()
  }

  private fun write(context: Context, json: JSONObject) {
    json.put("version", FORMAT_VERSION)
    val atomic = file(context)
    val out = atomic.startWrite()
    try {
      out.write(json.toString().toByteArray(Charsets.UTF_8))
      atomic.finishWrite(out)
    } catch (e: Exception) {
      atomic.failWrite(out)
      throw e
    }
  }

  /**
   * What the service runs with; off when a newer app wrote it, or when it cannot be read now. With
   * `strict` (the app's status), a state that cannot be read now throws (IOException): the app must
   * not take it for "off", which it would tell its cards' relays.
   */
  fun config(context: Context, strict: Boolean = false): SocketConfig = synchronized(lock) {
    val json = try {
      read(context)
    } catch (e: NewerStateException) {
      return SocketConfig(false, emptyList(), null)
    } catch (e: IOException) {
      if (strict) throw e
      return SocketConfig(false, emptyList(), null)
    }
    val relays = mutableListOf<ListenedRelay>()
    val list = json.optJSONArray("relays") ?: JSONArray()
    for (i in 0 until list.length()) {
      val item = list.optJSONObject(i) ?: continue
      val host = item.optString("host")
      val beat = item.optInt("heartbeatSeconds", 0)
      if (isHost(host) && beat in MIN_HEARTBEAT_S..MAX_HEARTBEAT_S) relays.add(ListenedRelay(host, beat))
    }
    val t = json.optJSONObject("texts")
    val texts = t?.let {
      val texts = SocketTexts(it.optString("channelName"), it.optString("title"), it.optString("text"), it.optString("stop"))
      if (listOf(texts.channelName, texts.title, texts.text, texts.stop).all { s -> s.isNotEmpty() }) texts else null
    }
    SocketConfig(!json.optBoolean("stopped", false), relays, texts)
  }

  /** On (the default) or off, as its holder chose (in the app, or "Stop" of its notification). */
  fun setEnabled(context: Context, enabled: Boolean) = synchronized(lock) {
    val json = read(context)
    json.put("stopped", !enabled)
    write(context, json)
  }

  /** The relays to listen to, and the notification's texts in the app's language. */
  fun setRelays(context: Context, relays: List<ListenedRelay>, texts: SocketTexts) = synchronized(lock) {
    require(listOf(texts.channelName, texts.title, texts.text, texts.stop).all { it.isNotEmpty() }) { "Texts required" }
    val json = read(context)
    json.put(
      "texts",
      JSONObject().put("channelName", texts.channelName).put("title", texts.title).put("text", texts.text).put("stop", texts.stop),
    )
    val list = JSONArray()
    for (relay in relays) {
      require(isHost(relay.host)) { "Not a relay host" }
      require(relay.heartbeatSeconds in MIN_HEARTBEAT_S..MAX_HEARTBEAT_S) { "Heartbeat out of bounds" }
      list.put(JSONObject().put("host", relay.host).put("heartbeatSeconds", relay.heartbeatSeconds))
    }
    json.put("relays", list)
    write(context, json)
  }

  /**
   * The listening token of `host`, or null: none drawn, or lost for good (the Keystore's key gone,
   * the sealed bytes damaged). Throws on a failure that may pass (the Keystore, the storage).
   */
  fun token(context: Context, host: String): ByteArray? = synchronized(lock) {
    val sealed = try {
      read(context).optJSONObject("tokens")?.optString(host)
    } catch (e: NewerStateException) {
      null
    }
    if (sealed.isNullOrEmpty()) return null
    val bytes = try {
      Base64.decode(sealed, Base64.NO_WRAP)
    } catch (e: IllegalArgumentException) {
      return null
    }
    if (bytes.size <= GCM_IV_BYTES) return null
    val key = try {
      existingKey()
    } catch (e: UnrecoverableKeyException) {
      null
    } ?: return null
    return try {
      decrypt(key, bytes).takeIf { it.size == TOKEN_BYTES }
    } catch (e: AEADBadTagException) {
      null
    }
  }

  /** What the relays take of a token: its SHA-256, base64url without padding. */
  fun hashOf(token: ByteArray): String = Base64.encodeToString(
    MessageDigest.getInstance("SHA-256").digest(token),
    Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP,
  )

  /** The hash of the token `host` holds now, or null; drawn by `listenHash` only. */
  fun currentHash(context: Context, host: String): String? = synchronized(lock) {
    val token = token(context, host) ?: return null
    hashOf(token).also { token.fill(0) }
  }

  /**
   * The SHA-256 of the listening token of `host` (base64url, no padding), what the app's channels
   * on that relay hold: the token is drawn here the first time, or again when it is lost for good.
   */
  fun listenHash(context: Context, host: String): String = synchronized(lock) {
    require(isHost(host)) { "Not a relay host" }
    val token = token(context, host) ?: run {
      val drawn = ByteArray(TOKEN_BYTES).also { SecureRandom().nextBytes(it) }
      val json = read(context)
      val tokens = json.optJSONObject("tokens") ?: JSONObject()
      tokens.put(host, Base64.encodeToString(encrypt(drawn), Base64.NO_WRAP))
      json.put("tokens", tokens)
      write(context, json)
      drawn
    }
    hashOf(token).also { token.fill(0) }
  }

  /** "Log out": the state and the Keystore key go; a next account draws new tokens. */
  fun forget(context: Context) = synchronized(lock) {
    File(context.noBackupFilesDir, DIR_NAME).deleteRecursively()
    try {
      KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(KEY_ALIAS)
    } catch (e: Exception) {
      // No key yet: nothing to delete.
    }
  }

  private fun existingKey(): SecretKey? {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    return store.getKey(KEY_ALIAS, null) as? SecretKey
  }

  private fun key(): SecretKey {
    val existing = try {
      existingKey()
    } catch (e: UnrecoverableKeyException) {
      // Lost for good, as `token` reads it: replaced, else no token could be drawn again. The
      // tokens it sealed could not be read any more: each is drawn again at the app's next sync.
      KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(KEY_ALIAS)
      null
    }
    existing?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  /** IV (drawn by the Keystore) ‖ ciphertext ‖ tag. */
  private fun encrypt(plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    return cipher.iv + cipher.doFinal(plain)
  }

  private fun decrypt(key: SecretKey, sealed: ByteArray): ByteArray {
    require(sealed.size > GCM_IV_BYTES) { "Too short" }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, sealed, 0, GCM_IV_BYTES))
    return cipher.doFinal(sealed, GCM_IV_BYTES, sealed.size - GCM_IV_BYTES)
  }
}
