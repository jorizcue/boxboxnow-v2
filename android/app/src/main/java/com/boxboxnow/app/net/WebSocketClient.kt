package com.boxboxnow.app.net

import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocketSession
import io.ktor.websocket.DefaultWebSocketSession
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WebSocket client with exponential reconnect + keepalive watchdog.
 * Matches iOS WebSocketClient semantics: if no message is received for 30s,
 * force-close and reconnect. Emits incoming text frames through [onMessage].
 */
@Singleton
class WebSocketClient @Inject constructor() {
    private val _isConnected = MutableStateFlow(false)
    val isConnected = _isConnected.asStateFlow()

    var onMessage: ((String) -> Unit)? = null

    private val client = HttpClient(CIO) { install(WebSockets) }
    private val scope = CoroutineScope(Dispatchers.IO)
    private var session: DefaultWebSocketSession? = null
    private var loopJob: Job? = null
    private var watchdogJob: Job? = null

    private var targetUrl: String? = null
    private var shouldReconnect = false
    private var reconnectDelayMs = 1_000L
    private val maxReconnectDelayMs = 30_000L
    private var lastMessageAt: Long = 0

    fun connectToUrl(url: String) {
        targetUrl = url
        shouldReconnect = true
        reconnectDelayMs = 1_000L
        openConnection()
    }

    fun disconnect() {
        shouldReconnect = false
        scope.launch { runCatching { session?.close() } }
        loopJob?.cancel()
        watchdogJob?.cancel()
        session = null
        _isConnected.value = false
    }

    fun send(text: String) {
        scope.launch { runCatching { session?.send(Frame.Text(text)) } }
    }

    private fun openConnection() {
        val url = targetUrl ?: return
        loopJob?.cancel()
        loopJob = scope.launch {
            try {
                val s = client.webSocketSession(urlString = url)
                session = s
                _isConnected.value = true
                reconnectDelayMs = 1_000L
                lastMessageAt = System.currentTimeMillis()
                startWatchdog()
                for (frame in s.incoming) {
                    if (frame is Frame.Text) {
                        lastMessageAt = System.currentTimeMillis()
                        onMessage?.invoke(frame.readText())
                    }
                }
                _isConnected.value = false
                watchdogJob?.cancel()
                scheduleReconnect()
            } catch (e: Throwable) {
                _isConnected.value = false
                watchdogJob?.cancel()
                scheduleReconnect()
            }
        }
    }

    private fun startWatchdog() {
        watchdogJob?.cancel()
        watchdogJob = scope.launch {
            while (isActive) {
                delay(10_000)
                val silence = System.currentTimeMillis() - lastMessageAt
                if (silence > 30_000) {
                    runCatching { session?.close() }
                    session = null
                    _isConnected.value = false
                    scheduleReconnect()
                    return@launch
                }
            }
        }
    }

    private fun scheduleReconnect() {
        if (!shouldReconnect) return
        scope.launch {
            delay(reconnectDelayMs)
            reconnectDelayMs = minOf(reconnectDelayMs * 2, maxReconnectDelayMs)
            if (shouldReconnect) openConnection()
        }
    }
}
