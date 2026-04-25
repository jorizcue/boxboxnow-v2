package com.boxboxnow.app.vm

import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.boxboxnow.app.auth.BiometricService
import com.boxboxnow.app.models.AuthResponse
import com.boxboxnow.app.models.User
import com.boxboxnow.app.net.ApiClient
import com.boxboxnow.app.net.AppUpgradeRequiredException
import com.boxboxnow.app.store.SecureTokenStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import javax.inject.Inject

/**
 * Mirrors iOS AuthViewModel 1:1:
 *   - email/pass login with optional MFA (showMfa + mfaCode + tempToken)
 *   - Google SSO via Custom Tabs + redirect to boxboxnow://?token=XXX
 *   - biometric re-login on cold start (token in Keychain + user opt-in)
 *   - logout keeps the token (Face-unlock can bring you back) /
 *     fullSignOut wipes everything
 */
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val api: ApiClient,
    private val tokenStore: SecureTokenStore,
    private val biometric: BiometricService,
) : ViewModel() {

    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated = _isAuthenticated.asStateFlow()

    private val _user = MutableStateFlow<User?>(null)
    val user = _user.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _isGoogleLoading = MutableStateFlow(false)
    val isGoogleLoading = _isGoogleLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage = _errorMessage.asStateFlow()

    private val _biometricPending = MutableStateFlow(false)
    val biometricPending = _biometricPending.asStateFlow()

    private val _showBiometricPrompt = MutableStateFlow(false)
    val showBiometricPrompt = _showBiometricPrompt.asStateFlow()

    /** Non-null while the backend is refusing logins because the installed
     * build is below the admin-configured minimum. LoginScreen swaps to a
     * blocking "update required" surface — no retry path except an App
     * Store / Play Store link. */
    private val _upgradeRequired = MutableStateFlow<AppUpgradeRequiredException?>(null)
    val upgradeRequired = _upgradeRequired.asStateFlow()

    val biometricAvailable: Boolean get() = biometric.isAvailable
    val biometricEnabled: Boolean get() = biometric.isEnabled
    val hasStoredToken: Boolean get() = tokenStore.loadToken() != null

    init { checkExistingSession() }

    fun clearError() { _errorMessage.value = null }
    fun setBiometricPending(v: Boolean) { _biometricPending.value = v }

    fun login(email: String, password: String) {
        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            try {
                val resp = api.login(email.trim(), password)
                handleAuthResponse(resp)
            } catch (e: AppUpgradeRequiredException) {
                // Don't surface as a normal error — LoginScreen observes
                // `upgradeRequired` and shows a blocking update screen.
                _upgradeRequired.value = e
            } catch (e: Throwable) {
                _errorMessage.value = e.message ?: "Error de conexion"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /** Called by MainActivity when the Custom Tab redirect delivers the token. */
    fun completeGoogleLogin(token: String) {
        _isGoogleLoading.value = false
        // SecureTokenStore needs a username to key the per-user token slot.
        // Decode the JWT `sub` claim — same approach as iOS.
        val payload = tokenStore.decodeJwtPayload(token)
        val username = (payload?.get("sub") as? JsonPrimitive)?.content ?: ""
        tokenStore.saveToken(token, username)
        biometric.saveLastUsername(username)
        _isAuthenticated.value = true
        viewModelScope.launch { refreshMe() }
    }

    fun googleLoginFailed(message: String?) {
        _isGoogleLoading.value = false
        _errorMessage.value = message ?: "Error iniciando sesion con Google"
    }

    fun startGoogleLogin() {
        _isGoogleLoading.value = true
        _errorMessage.value = null
    }

    /** Normal logout — keeps token + biometric so user can face-unlock back in. */
    fun logout() {
        _isAuthenticated.value = false
        _user.value = null
        _biometricPending.value = false
    }

    /**
     * Full sign-out — wipes token and biometric opt-in AND tells the
     * server to delete the DeviceSession row so it stops appearing in
     * the admin panel's "Sesiones activas" list. The server call is
     * fire-and-forget — local state is cleaned up even if it fails.
     */
    fun fullSignOut() {
        viewModelScope.launch {
            runCatching { api.serverLogout() }
            tokenStore.deleteToken()
            biometric.disable()
            logout()
        }
    }

    private fun checkExistingSession() {
        // loadToken() uses the last-saved username to find the right slot.
        val token = tokenStore.loadToken() ?: return
        val payload = tokenStore.decodeJwtPayload(token)
        val exp = payload?.get("exp")?.toString()?.trim('"')?.toDoubleOrNull()
        val now = System.currentTimeMillis() / 1000.0
        if (exp == null || exp <= now) {
            tokenStore.deleteToken()
            biometric.disable()
            return
        }
        // Check biometric for the last-known user (per-user flag in BiometricService).
        if (biometric.isEnabled && biometric.isAvailable) {
            _biometricPending.value = true
            viewModelScope.launch { refreshMe() }
        } else {
            _isAuthenticated.value = true
            viewModelScope.launch { refreshMe() }
        }
    }

    suspend fun refreshMe() {
        runCatching { _user.value = api.getMe() }
    }

    /**
     * Biometric unlock flow. Validates the stored token against the
     * server before flipping `isAuthenticated = true` so a user whose
     * account was deleted / session killed (common after a DB reset)
     * can't get into the app with a stale token. On token rejection we
     * wipe Keychain + biometric opt-in and send the user back to login.
     */
    fun authenticateWithBiometric(activity: FragmentActivity) {
        viewModelScope.launch {
            val ok = biometric.authenticate(activity)
            if (!ok) {
                _biometricPending.value = false
                return@launch
            }
            val serverCheck = runCatching { api.getMe() }
            if (serverCheck.isSuccess) {
                _user.value = serverCheck.getOrNull()
                _biometricPending.value = false
                _isAuthenticated.value = true
            } else {
                // Token rejected — clean everything locally.
                tokenStore.deleteToken()
                biometric.disable()
                _biometricPending.value = false
                _isAuthenticated.value = false
                _user.value = null
                _errorMessage.value = "La sesion ya no es valida. Inicia sesion de nuevo."
            }
        }
    }

    fun enableBiometric() {
        val username = _user.value?.username
        if (username != null) {
            biometric.setEnabledForUser(username, true)
        } else {
            biometric.isEnabled = true  // fallback to last-username key
        }
        _showBiometricPrompt.value = false
    }

    fun skipBiometric() { _showBiometricPrompt.value = false }

    private suspend fun handleAuthResponse(resp: AuthResponse) {
        // Save token keyed to this specific user so multiple accounts on
        // the same device each have their own isolated storage slot.
        val username = resp.user?.username ?: ""
        tokenStore.saveToken(resp.accessToken, username)
        biometric.saveLastUsername(username)  // keep BiometricService in sync
        _user.value = resp.user
        _isAuthenticated.value = true
        refreshMe()
        if (biometric.isAvailable && !biometric.isEnabledForUser(username)) {
            _showBiometricPrompt.value = true
        }
    }
}
