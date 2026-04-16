package com.boxboxnow.app.audio

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Speaks race data once per lap — the Android equivalent of iOS
 * `DriverSpeechService` and the web `useDriverSpeech` hook.
 *
 * Narrates: last lap time, delta vs previous, position, box score,
 * laps to max stint. Uses Android TextToSpeech with Spanish locale.
 *
 * The service is a singleton so it survives ViewModel recomposition
 * and can be toggled from `DriverViewModel.audioEnabled` via a side
 * effect in `DriverScreen`.
 */
@Singleton
class DriverSpeechService @Inject constructor(
    context: Context,
) {
    private val appContext = context.applicationContext
    private var tts: TextToSpeech? = null
    @Volatile private var ready: Boolean = false
    @Volatile var enabled: Boolean = false

    private var lastSpokenLapMs: Double = 0.0

    init {
        // TTS engine init is asynchronous — we remember readiness so early
        // speak() calls are silently dropped instead of crashing.
        tts = TextToSpeech(appContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val engine = tts ?: return@TextToSpeech
                val spanish = pickSpanishLocale(engine)
                if (spanish != null) {
                    engine.language = spanish
                }
                engine.setSpeechRate(0.95f)   // roughly matches iOS AVSpeech rate 0.48
                engine.setPitch(1.0f)
                engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) {}
                    @Deprecated("")
                    override fun onError(utteranceId: String?) {}
                })
                ready = true
            } else {
                Log.w(TAG, "TextToSpeech init failed (status=$status)")
            }
        }
    }

    /** Call when a new lap completes (lastLapMs changes). */
    fun speakLapData(
        lastLapMs: Double,
        prevLapMs: Double,
        lapDelta: String?,          // "faster" | "slower" | null
        realPosition: Int?,
        totalKarts: Int?,
        boxScore: Double,
        lapsToMaxStint: Double?,
    ) {
        if (!enabled || !ready || lastLapMs <= 0) return
        if (lastLapMs == lastSpokenLapMs) return
        lastSpokenLapMs = lastLapMs

        val parts = mutableListOf<String>()

        // 1. Last lap time (spoken in short form for clarity)
        parts += spokenLapTime(lastLapMs)

        // 2. Delta vs previous lap
        if (lapDelta != null && prevLapMs > 0) {
            val deltaMs = lastLapMs - prevLapMs
            val absDelta = abs(deltaMs) / 1000.0
            val formatted = String.format(Locale.getDefault(), "%.1f", absDelta)
            parts += if (lapDelta == "faster") "menos $formatted décimas"
            else "más $formatted décimas"
        }

        // 3. Position
        if (realPosition != null && realPosition > 0) {
            parts += "posición $realPosition"
        }

        // 4. Box score
        if (boxScore > 0) {
            parts += "box ${boxScore.toInt()}"
        }

        // 5. Laps to max stint (only when ≤ 10)
        if (lapsToMaxStint != null && lapsToMaxStint > 0) {
            val rounded = lapsToMaxStint.roundToInt()
            if (rounded <= 10) parts += "quedan $rounded vueltas"
        }

        speak(parts.joinToString(". "))
    }

    /** Reset state (e.g. when kart number changes). */
    fun reset() {
        lastSpokenLapMs = 0.0
        tts?.stop()
    }

    /** Release the native TTS engine. Call from Application.onTerminate or similar. */
    fun shutdown() {
        ready = false
        tts?.stop()
        tts?.shutdown()
        tts = null
    }

    // ── Private ──

    private fun speak(text: String) {
        val engine = tts ?: return
        engine.stop()
        engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, UUID.randomUUID().toString())
    }

    /**
     * Convert ms to spoken Spanish matching iOS: "1 05 4" (mm ss tenths)
     * Shorter than a formal "un minuto, cinco segundos" — easier to follow
     * while driving.
     */
    private fun spokenLapTime(ms: Double): String {
        val totalSec = ms / 1000.0
        val minutes = totalSec.toInt() / 60
        val seconds = totalSec.toInt() % 60
        val tenths = ((totalSec - totalSec.toInt()) * 10).toInt()
        return if (minutes > 0) {
            "$minutes ${String.format(Locale.getDefault(), "%02d", seconds)} $tenths"
        } else {
            "$seconds $tenths"
        }
    }

    /**
     * Prefer es_ES, then any Spanish locale the engine supports.
     * Returns null if no Spanish voice is installed — TTS will fall back
     * to the system default (which may be English, but at least won't crash).
     */
    private fun pickSpanishLocale(engine: TextToSpeech): Locale? {
        val candidates = listOf(
            Locale("es", "ES"),
            Locale("es", "US"),
            Locale("es", "MX"),
            Locale("es"),
        )
        for (locale in candidates) {
            val result = engine.isLanguageAvailable(locale)
            if (result == TextToSpeech.LANG_AVAILABLE ||
                result == TextToSpeech.LANG_COUNTRY_AVAILABLE ||
                result == TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE
            ) {
                return locale
            }
        }
        return null
    }

    companion object {
        private const val TAG = "DriverSpeechService"
    }
}
