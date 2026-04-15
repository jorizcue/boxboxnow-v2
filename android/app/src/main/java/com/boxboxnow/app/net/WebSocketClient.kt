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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WebSocket client with a single reconnect loop + ping keepalive.
 *
 * Design notes:
 * - The underlying Ktor client is configured with `pingInterval = 15s`, so the
 *   TCP/WS connection stays alive through NATs, load balancers and mobile
 *   carriers even during idle periods (no snapshots for a while). Without
 *   this, the backend silently reaped the Android client after ~1 minute,
 *   which was the root cause of the "Conectando..." lockup on the driver view.
 *
 * - Reconnect is driven by a **single** long-running coroutine (`connectJob`)
 *   that wraps `connect -> read loop -> finally close -> backoff -> retry` in
 *   a `while (shouldReconnect)`. The previous implementation used a separate
 *   watchdog job that could race with the loop-end handler and schedule
 *   parallel reconnects (→ multiple sessions, zombie state).
 *
 * - The `onConnected` callback fires every time a session opens successfully
 *   (first connect AND every reconnect), so the caller can request a fresh
 *   snapshot to repopulate its cached state after an interruption.
 */
@Singleton
class WebSocketClient @Inject constructor() {
    private val _isConnected = MutableStateFlow(false)
    val isConnected = _isConnected.asStateFlow()

    var onMessage: ((String) -> Unit)? = null

    /** Invoked on every successful (re)connect, after `isConnected = true`. */
    var onConnected: (() -> Unit)? = null

    private val client = HttpClient(CIO) {
        install(WebSockets) {
            // Sends a WS Ping every 15s. The remote is required to Pong, which
            // keeps middleboxes from reaping the idle TCP connection. Ktor
            // 3.0.x exposes this as `pingIntervalMillis: Long`; the Duration
            // overload arrives in later 3.x versions.
            pingIntervalMillis = 15_000L
        }
    }
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    @Volatile private var session: DefaultWebSocketSession? = null
    private var connectJob: Job? = null

    @Volatile private var targetUrl: String? = null
    @Volatile private var shouldReconnect = false

    fun connectToUrl(url: String) {
        targetUrl = url
        shouldReconnect = true
        startConnectLoop()
    }

    fun disconnect() {
        shouldReconnect = false
        connectJob?.cancel()
        connectJob = null
        scope.launch { runCatching { session?.close() } }
        session = null
        _isConnected.value = false
    }

    fun send(text: String) {
        scope.launch { runCatching { session?.send(Frame.Text(text)) } }
    }

    private fun startConnectLoop() {
        connectJob?.cancel()
        connectJob = scope.launch {
            var backoffMs = 1_000L
            val maxBackoffMs = 30_000L

            while (isActive && shouldReconnect) {
                val url = targetUrl
                if (url == null) {
                    delay(500)
                    continue
                }
                try {
                    val s = client.webSocketSession(urlString = url)
                    session = s
                    _isConnected.value = true
                    backoffMs = 1_000L
                    // Let the caller re-sync server state (snapshot) after a
                    // reconnect. Fire after `isConnected = true` so listeners
                    // that gate on it see the flip first.
                    runCatching { onConnected?.invoke() }

                    // Watchdog: read-side silence detector. Most messages from
                    // the backend come in bursts, but during an idle session
                    // we still want to notice a half-open TCP socket where
                    // pings/pongs are being eaten silently. 45s is long enough
                    // to not trip during normal gaps between snapshots.
                    var lastAt = System.currentTimeMillis()
                    val watchdog = launch {
                        while (isActive) {
                            delay(10_000)
                            if (System.currentTimeMillis() - lastAt > 45_000) {
                                runCatching { s.close() }
                                break
                            }
                        }
                    }

                    try {
                        for (frame in s.incoming) {
                            if (frame is Frame.Text) {
                                lastAt = System.currentTimeMillis()
                                onMessage?.invoke(frame.readText())
                            }
                        }
                    } finally {
                        watchdog.cancel()
                        runCatching { s.close() }
                        session = null
                        _isConnected.value = false
                    }
                } catch (_: Throwable) {
                    session = null
                    _isConnected.value = false
                }

                if (!shouldReconnect) break
                // Exponential backoff between reconnect attempts.
                delay(backoffMs)
                backoffMs = minOf(backoffMs * 2, maxBackoffMs)
            }
        }
    }
}
