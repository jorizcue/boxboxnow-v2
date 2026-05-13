package com.boxboxnow.app.store

import android.content.Context
import androidx.core.content.edit
import com.boxboxnow.app.util.Constants
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Thin wrapper over SharedPreferences — Android equivalent of iOS UserDefaults.
 * Used for non-sensitive driver config (card order, brightness, finish line).
 */
@Singleton
class PreferencesStore @Inject constructor(context: Context) {
    private val prefs = context.getSharedPreferences("bbn_prefs", Context.MODE_PRIVATE)

    fun putString(key: String, value: String) = prefs.edit { putString(key, value) }
    fun getString(key: String): String? = prefs.getString(key, null)
    fun putDouble(key: String, value: Double) =
        prefs.edit { putLong(key, java.lang.Double.doubleToRawLongBits(value)) }

    fun getDouble(key: String, default: Double = 0.0): Double {
        if (!prefs.contains(key)) return default
        return java.lang.Double.longBitsToDouble(prefs.getLong(key, 0L))
    }

    fun putBoolean(key: String, value: Boolean) = prefs.edit { putBoolean(key, value) }
    fun getBoolean(key: String, default: Boolean = false): Boolean =
        prefs.getBoolean(key, default)

    fun putInt(key: String, value: Int) = prefs.edit { putInt(key, value) }
    fun getInt(key: String, default: Int = 0): Int = prefs.getInt(key, default)

    fun putStringList(key: String, value: List<String>) = prefs.edit {
        putString(key, value.joinToString("\u0001"))
    }

    fun getStringList(key: String): List<String>? =
        prefs.getString(key, null)?.split("\u0001")?.takeIf { it.isNotEmpty() && it.first().isNotEmpty() }

    fun remove(key: String) = prefs.edit { remove(key) }
    fun contains(key: String) = prefs.contains(key)

    /** Wipe every per-user driver-view key. Called on full sign-out
     *  and when a different username logs in on the same device — fixes
     *  the bug where the next user landed on the previous user's
     *  plantilla because SharedPreferences isn't scoped by account. */
    fun clearDriverConfig() = prefs.edit {
        for (key in Constants.DRIVER_CONFIG_KEYS) remove(key)
    }
}
