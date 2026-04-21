package com.boxboxnow.app.store

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persists JWTs in EncryptedSharedPreferences — the Android equivalent of
 * iOS's KeychainHelper. Each user gets an isolated token slot so that
 * switching between accounts on the same device never crosses credentials.
 *
 * The last logged-in username is stored in plain SharedPreferences (not
 * sensitive — it is only a lookup key, not a credential) so the right
 * token can be loaded on cold start before authentication occurs.
 */
@Singleton
class SecureTokenStore @Inject constructor(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "secure_tokens",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    /** Plain (non-sensitive) prefs for the last-known username. */
    private val plainPrefs: SharedPreferences =
        context.getSharedPreferences("bbn_prefs", Context.MODE_PRIVATE)

    // ---- Username tracking --------------------------------------------------

    fun saveLastUsername(username: String) {
        plainPrefs.edit().putString(LAST_USERNAME_KEY, username).apply()
    }

    fun loadLastUsername(): String? = plainPrefs.getString(LAST_USERNAME_KEY, null)

    // ---- Per-user token storage ---------------------------------------------

    private fun tokenKey(username: String) = "bbn_jwt_$username"

    fun saveToken(token: String, username: String) {
        saveLastUsername(username)
        prefs.edit().putString(tokenKey(username), token).apply()
    }

    /** Load token for a specific user. */
    fun loadToken(username: String): String? = prefs.getString(tokenKey(username), null)

    /** Load the token for whoever logged in last (used on cold start). */
    fun loadToken(): String? {
        val username = loadLastUsername() ?: return null
        return loadToken(username)
    }

    fun deleteToken(username: String) {
        prefs.edit().remove(tokenKey(username)).apply()
    }

    /** Delete the token for whoever logged in last. */
    fun deleteToken() {
        val username = loadLastUsername() ?: return
        deleteToken(username)
    }

    // ---- JWT decode helper --------------------------------------------------

    /** Decodes the middle segment of a JWT into a map. Returns null on failure. */
    fun decodeJwtPayload(token: String): JsonObject? {
        val parts = token.split(".")
        if (parts.size != 3) return null
        return try {
            var base64 = parts[1].replace('-', '+').replace('_', '/')
            while (base64.length % 4 != 0) base64 += "="
            val bytes = Base64.getDecoder().decode(base64)
            Json.parseToJsonElement(String(bytes)) as? JsonObject
        } catch (e: Throwable) {
            null
        }
    }

    companion object {
        private const val LAST_USERNAME_KEY = "bbn_last_username"
    }
}
