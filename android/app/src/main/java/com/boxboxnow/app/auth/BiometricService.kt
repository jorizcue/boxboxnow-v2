package com.boxboxnow.app.auth

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * Wraps AndroidX BiometricPrompt. Mirrors the iOS BiometricService semantics:
 *   • `isAvailable` — hardware present AND enrolled
 *   • `isEnabled`  — user opted-in via the post-login prompt (persisted)
 *   • `authenticate(activity)` — presents the prompt, returns true on success
 */
@Singleton
class BiometricService @Inject constructor(
    private val context: Context,
) {
    private val prefs = context.getSharedPreferences("bbn_biometric", Context.MODE_PRIVATE)

    val isAvailable: Boolean
        get() {
            val bm = BiometricManager.from(context)
            val result = bm.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
            )
            return result == BiometricManager.BIOMETRIC_SUCCESS
        }

    // Per-user biometric opt-in flag. Using a per-username key prevents one
    // user's biometric setting from bleeding into another user's session when
    // multiple accounts share the same device.

    private fun enabledKey(username: String) = "biometric_enabled_$username"

    fun isEnabledForUser(username: String): Boolean =
        prefs.getBoolean(enabledKey(username), false)

    fun setEnabledForUser(username: String, enabled: Boolean) {
        prefs.edit().putBoolean(enabledKey(username), enabled).apply()
    }

    // Convenience property using the last-known username (stored by SecureTokenStore).
    var isEnabled: Boolean
        get() {
            val username = prefs.getString(LAST_USERNAME_KEY, null) ?: return false
            return isEnabledForUser(username)
        }
        set(value) {
            val username = prefs.getString(LAST_USERNAME_KEY, null) ?: return
            setEnabledForUser(username, value)
        }

    fun saveLastUsername(username: String) {
        prefs.edit().putString(LAST_USERNAME_KEY, username).apply()
    }

    fun disable() { isEnabled = false }

    fun disable(username: String) { setEnabledForUser(username, false) }

    suspend fun authenticate(activity: FragmentActivity): Boolean = suspendCoroutine { cont ->
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    cont.resume(true)
                }

                override fun onAuthenticationFailed() = Unit

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    cont.resume(false)
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("BoxBoxNow")
            .setSubtitle("Autenticate para entrar")
            .setNegativeButtonText("Cancelar")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.BIOMETRIC_WEAK,
            )
            .build()
        prompt.authenticate(info)
    }

    companion object {
        private const val LAST_USERNAME_KEY = "bbn_last_username"
    }
}
