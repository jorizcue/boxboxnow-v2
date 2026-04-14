package com.boxboxnow.app.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.boxboxnow.app.models.Circuit
import com.boxboxnow.app.models.RaceSession
import com.boxboxnow.app.net.ApiClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ConfigViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {
    private val _session = MutableStateFlow(RaceSession.EMPTY)
    val session = _session.asStateFlow()

    private val _circuits = MutableStateFlow<List<Circuit>>(emptyList())
    val circuits = _circuits.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage = _errorMessage.asStateFlow()

    private val _hasActiveSession = MutableStateFlow(false)
    val hasActiveSession = _hasActiveSession.asStateFlow()

    fun loadSession() {
        _isLoading.value = true
        viewModelScope.launch {
            try {
                val s = api.getActiveSession()
                if (s != null) {
                    _session.value = s
                    _hasActiveSession.value = true
                } else {
                    _hasActiveSession.value = false
                }
            } catch (e: Throwable) {
                _errorMessage.value = e.message ?: "Error"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun loadCircuits() {
        viewModelScope.launch {
            runCatching { api.getMyCircuits() }.onSuccess { list ->
                _circuits.value = list
                if (!_hasActiveSession.value && _session.value.circuitId == null) {
                    list.firstOrNull()?.let { first ->
                        _session.value = _session.value.copy(
                            circuitId = first.id,
                            circuitName = first.name,
                        )
                    }
                }
            }
        }
    }

    fun updateSession(transform: (RaceSession) -> RaceSession) {
        _session.value = transform(_session.value)
    }

    fun saveSession() {
        viewModelScope.launch {
            try {
                val saved = if (_hasActiveSession.value) {
                    api.updateSession(_session.value)
                } else {
                    if (_session.value.circuitId == null) {
                        _errorMessage.value = "Selecciona un circuito antes de guardar"
                        return@launch
                    }
                    api.createSession(_session.value)
                }
                _session.value = saved
                _hasActiveSession.value = true
            } catch (e: Throwable) {
                _errorMessage.value = e.message ?: "Error"
            }
        }
    }
}
