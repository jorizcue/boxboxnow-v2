package com.boxboxnow.app.vm

import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.boxboxnow.app.auth.BiometricService
import com.boxboxnow.app.models.AuthResponse
import com.boxboxnow.app.models.User
import com.boxboxnow.app.net.ApiClient
import com.boxboxnow.app.store.SecureTokenStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Authentication state holder + flows. Matches the iOS AuthViewModel feature set:
 *   • username/password login
 *   • /auth/me hydration after cold start (JWT payload lacks is_admin/tab_access)
 *   • biometric re-login gated on token presence + user opt-in
 *   • logout (keeps token) vs fullSignOut (wipes everything)
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

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage = _errorMessage.asStateFlow()

    private val _biometricPending = MutableStateFlow(false)
    val biometricPending = _biometricPending.asStateFlow()

    private val _showBiometricPrompt = MutableStateFlow(false)
    val showBiometricPrompt = _showBiometricPrompt.asStateFlow()

    init {
        checkExistingSession()
    }

    fun login(email: String, password: String) {
        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            try {
                val resp = api.login(email, password)
                handleAuthResponse(resp)
            } catch (e: Throwable) {
                _errorMessage.value = e.message ?: "Error"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun verifyMfa(tempToken: String, code: String) {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val resp = api.verifyMfa(tempToken, code)
                handleAuthResponse(resp)
            } catch (e: Throwable) {
                _errorMessage.value = e.message ?: "Error"
            } finally {
                _isLoading.value = false
            }
        }
    }

    /** Normal logout — keeps token + biometric so user can Face-unlock back in. */
    fun logout() {
        _isAuthenticated.value = false
        _user.value = null
        _biometricPending.value = false
    }

    /** Full sign-out — wipes token and biometric opt-in. */
    fun fullSignOut() {
        tokenStore.deleteToken()
        biometric.disable()
        logout()
    }

    private fun checkExistingSession() {
        val token = tokenStore.loadToken() ?: return
        val payload = tokenStore.decodeJwtPayload(token)
        val exp = payload?.get("exp")?.toString()?.trim('"')?.toDoubleOrNull()
        val now = System.currentTimeMillis() / 1000.0
        if (exp == null || exp <= now) {
            tokenStore.deleteToken()
            biometric.disable()
            return
        }

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

    fun authenticateWithBiometric(activity: FragmentActivity) {
        viewModelScope.launch {
            val ok = biometric.authenticate(activity)
            _biometricPending.value = false
            if (ok) _isAuthenticated.value = true
        }
    }

    fun enableBiometric() {
        biometric.isEnabled = true
        _showBiometricPrompt.value = false
    }

    fun skipBiometric() {
        _showBiometricPrompt.value = false
    }

    private suspend fun handleAuthResponse(resp: AuthResponse) {
        tokenStore.saveToken(resp.accessToken)
        _user.value = resp.user
        _isAuthenticated.value = true
        refreshMe()
        if (biometric.isAvailable && !biometric.isEnabled) {
            _showBiometricPrompt.value = true
        }
    }
}
