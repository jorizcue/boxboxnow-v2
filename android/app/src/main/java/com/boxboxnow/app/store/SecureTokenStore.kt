package com.boxboxnow.app.store

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persists the JWT in EncryptedSharedPreferences — the Android equivalent of
 * iOS's Keychain-backed KeychainHelper. Everything it stores is considered
 * sensitive; we never drop it on normal logout so biometric re-login works.
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

    fun saveToken(token: String) {
        prefs.edit().putString(TOKEN_KEY, token).apply()
    }

    fun loadToken(): String? = prefs.getString(TOKEN_KEY, null)

    fun deleteToken() {
        prefs.edit().remove(TOKEN_KEY).apply()
    }

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
        private const val TOKEN_KEY = "bbn_jwt"
    }
}
