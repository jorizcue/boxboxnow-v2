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

    var isEnabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    fun disable() { isEnabled = false }

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
        private const val KEY_ENABLED = "biometric_enabled"
    }
}
