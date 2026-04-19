package com.boxboxnow.app.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.boxboxnow.app.audio.DriverSpeechService
import com.boxboxnow.app.lap.LapTracker
import com.boxboxnow.app.models.DriverCard
import com.boxboxnow.app.models.DriverConfigPreset
import com.boxboxnow.app.models.GPSSample
import com.boxboxnow.app.net.ApiClient
import com.boxboxnow.app.store.PreferencesStore
import com.boxboxnow.app.util.Constants
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import javax.inject.Inject

private val VisibleCardsSerializer = MapSerializer(String.serializer(), Boolean.serializer())

enum class OrientationLock(val raw: String, val display: String) {
    FREE("free", "Libre"),
    PORTRAIT("portrait", "Vertical"),
    LANDSCAPE("landscape", "Horizontal");

    companion object {
        fun from(raw: String?) = entries.firstOrNull { it.raw == raw } ?: FREE
    }
}

@HiltViewModel
class DriverViewModel @Inject constructor(
    private val api: ApiClient,
    private val prefs: PreferencesStore,
    private val speech: DriverSpeechService,
) : ViewModel() {
    val lapTracker: LapTracker by lazy {
        LapTracker(api, prefs, viewModelScope).also { it.loadFinishLine() }
    }

    private val json = Json { ignoreUnknownKeys = true }

    private val _visibleCards = MutableStateFlow(DriverCard.defaultVisible)
    val visibleCards = _visibleCards.asStateFlow()

    private val _cardOrder = MutableStateFlow(DriverCard.defaultOrder)
    val cardOrder = _cardOrder.asStateFlow()

    private val _presets = MutableStateFlow<List<DriverConfigPreset>>(emptyList())
    val presets = _presets.asStateFlow()

    private val _selectedPresetId = MutableStateFlow<Int?>(null)
    val selectedPresetId = _selectedPresetId.asStateFlow()

    private val _brightness = MutableStateFlow(0.0)
    val brightness = _brightness.asStateFlow()

    private val _orientationLock = MutableStateFlow(OrientationLock.FREE)
    val orientationLock = _orientationLock.asStateFlow()

    private val _audioEnabled = MutableStateFlow(true)
    val audioEnabled = _audioEnabled.asStateFlow()

    private val _gpsData = MutableStateFlow<GPSSample?>(null)
    val gpsData = _gpsData.asStateFlow()

    init {
        prefs.getString(Constants.Keys.VISIBLE_CARDS)?.let { raw ->
            runCatching {
                _visibleCards.value = json.decodeFromString(VisibleCardsSerializer, raw)
            }
        }
        prefs.getStringList(Constants.Keys.CARD_ORDER)?.let { _cardOrder.value = it }
        if (prefs.contains(Constants.Keys.BRIGHTNESS)) {
            _brightness.value = prefs.getDouble(Constants.Keys.BRIGHTNESS)
        }
        _orientationLock.value = OrientationLock.from(prefs.getString(Constants.Keys.ORIENTATION))
        if (prefs.contains(Constants.Keys.AUDIO_ENABLED)) {
            _audioEnabled.value = prefs.getBoolean(Constants.Keys.AUDIO_ENABLED, true)
        }
        // Keep the TTS service in sync with the persisted/preset flag so the
        // pilot hears narration the moment a preset with audio=true is applied.
        speech.enabled = _audioEnabled.value

        // Migrate newly-added cards into the cached order/visible maps
        val allKeys = DriverCard.entries.map { it.key }
        val missing = allKeys.filterNot { it in _cardOrder.value }
        if (missing.isNotEmpty()) {
            _cardOrder.value = _cardOrder.value + missing
            val newVisible = _visibleCards.value.toMutableMap()
            for (key in missing) {
                if (newVisible[key] == null) {
                    DriverCard.fromKey(key)?.let { newVisible[key] = !it.requiresGPS }
                }
            }
            _visibleCards.value = newVisible
            saveConfig()
        }
    }

    fun saveConfig() {
        prefs.putString(
            Constants.Keys.VISIBLE_CARDS,
            json.encodeToString(VisibleCardsSerializer, _visibleCards.value),
        )
        prefs.putStringList(Constants.Keys.CARD_ORDER, _cardOrder.value)
        prefs.putDouble(Constants.Keys.BRIGHTNESS, _brightness.value)
        prefs.putString(Constants.Keys.ORIENTATION, _orientationLock.value.raw)
        prefs.putBoolean(Constants.Keys.AUDIO_ENABLED, _audioEnabled.value)
    }

    fun setAudioEnabled(enabled: Boolean) {
        _audioEnabled.value = enabled
        speech.enabled = enabled
        saveConfig()
    }

    /**
     * Called by DriverScreen whenever a new lap is detected (lastLapMs changes).
     * Delegates to `DriverSpeechService` which internally checks `enabled` + dedupes
     * on lap ms, so repeated calls with the same lap are safe.
     */
    fun speakLapData(
        lastLapMs: Double,
        prevLapMs: Double,
        lapDelta: String?,
        realPosition: Int?,
        totalKarts: Int?,
        boxScore: Double,
        lapsToMaxStint: Double?,
    ) {
        speech.speakLapData(
            lastLapMs = lastLapMs,
            prevLapMs = prevLapMs,
            lapDelta = lapDelta,
            realPosition = realPosition,
            totalKarts = totalKarts,
            boxScore = boxScore,
            lapsToMaxStint = lapsToMaxStint,
        )
    }

    fun setBrightness(v: Double) {
        _brightness.value = v
        saveConfig()
    }

    fun setOrientationLock(lock: OrientationLock) {
        _orientationLock.value = lock
        saveConfig()
    }

    fun toggleCard(key: String, visible: Boolean) {
        _visibleCards.value = _visibleCards.value.toMutableMap().also { it[key] = visible }
        saveConfig()
    }

    fun reorderCards(newOrder: List<String>) {
        _cardOrder.value = newOrder
        saveConfig()
    }

    fun loadPresets(autoApplyDefault: Boolean = false) {
        viewModelScope.launch {
            runCatching { api.fetchPresets() }.onSuccess { list ->
                _presets.value = list
                if (autoApplyDefault) {
                    // Prefer an explicit default, but fall back to the user's
                    // sole preset so pilots who created their first template
                    // before the auto-default-on-create logic shipped still
                    // land on a pre-configured driver view (otherwise
                    // contrast / orientation / audio never load).
                    val target = list.firstOrNull { it.isDefault }
                        ?: list.singleOrNull()
                    target?.let { applyPreset(it) }
                }
            }
        }
    }

    fun applyDefaultPresetIfAny() = loadPresets(autoApplyDefault = true)

    fun applyPreset(preset: DriverConfigPreset) {
        _visibleCards.value = preset.visibleCards
        _cardOrder.value = preset.cardOrder
        _selectedPresetId.value = preset.id
        preset.contrast?.let { _brightness.value = it }
        preset.orientation?.let { _orientationLock.value = OrientationLock.from(it) }
        preset.audioEnabled?.let {
            _audioEnabled.value = it
            speech.enabled = it
        }
        saveConfig()
    }

    /**
     * Persists the current visible-cards + order as a new named preset on the
     * backend and refreshes the local list. Mirrors iOS `saveAsPreset(name:)`.
     */
    fun saveAsPreset(name: String, onError: (Throwable) -> Unit = {}) {
        viewModelScope.launch {
            runCatching {
                api.createPreset(
                    name = name,
                    visibleCards = _visibleCards.value,
                    cardOrder = _cardOrder.value,
                )
            }.onSuccess { created ->
                _presets.value = _presets.value + created
                _selectedPresetId.value = created.id
            }.onFailure(onError)
        }
    }

    /**
     * Saves a new preset with full display options (from the template wizard).
     */
    fun saveAsPresetWithOptions(
        name: String,
        visibleCards: Map<String, Boolean>,
        cardOrder: List<String>,
        contrast: Double,
        orientation: String,
        audioEnabled: Boolean,
        onSuccess: () -> Unit = {},
        onError: (Throwable) -> Unit = {},
    ) {
        viewModelScope.launch {
            runCatching {
                api.createPreset(
                    name = name,
                    visibleCards = visibleCards,
                    cardOrder = cardOrder,
                    contrast = contrast,
                    orientation = orientation,
                    audioEnabled = audioEnabled,
                )
            }.onSuccess { created ->
                _presets.value = _presets.value + created
                _selectedPresetId.value = created.id
                // Also apply locally so the pilot view picks the new
                // options up immediately. audioEnabled was missing from
                // the previous implementation, which kept the saved
                // "audio=on" flag from propagating to the speech service
                // until the next preset reload.
                _visibleCards.value = visibleCards
                _cardOrder.value = cardOrder
                _brightness.value = contrast
                _orientationLock.value = OrientationLock.from(orientation)
                _audioEnabled.value = audioEnabled
                speech.enabled = audioEnabled
                saveConfig()
                onSuccess()
            }.onFailure(onError)
        }
    }

    /**
     * Updates an existing preset with full display options (edit mode in wizard).
     */
    fun updatePresetWithOptions(
        id: Int,
        name: String,
        visibleCards: Map<String, Boolean>,
        cardOrder: List<String>,
        contrast: Double,
        orientation: String,
        audioEnabled: Boolean,
        onSuccess: () -> Unit = {},
        onError: (Throwable) -> Unit = {},
    ) {
        viewModelScope.launch {
            runCatching {
                api.updatePreset(
                    id = id,
                    name = name,
                    visibleCards = visibleCards,
                    cardOrder = cardOrder,
                    contrast = contrast,
                    orientation = orientation,
                    audioEnabled = audioEnabled,
                )
            }.onSuccess { updated ->
                _presets.value = _presets.value.map { if (it.id == updated.id) updated else it }
                onSuccess()
            }.onFailure(onError)
        }
    }

    /**
     * Toggle a preset's default status. Mirrors iOS `setPresetDefault(_:isDefault:)`.
     * When setting a preset as default, all others are un-defaulted client-side.
     */
    fun setPresetDefault(preset: DriverConfigPreset, isDefault: Boolean) {
        viewModelScope.launch {
            runCatching {
                api.updatePreset(id = preset.id, isDefault = isDefault)
            }.onSuccess { updated ->
                _presets.value = _presets.value.map { p ->
                    if (p.id == updated.id) updated
                    else if (isDefault) p.copy(isDefault = false)
                    else p
                }
            }
        }
    }

    fun deletePreset(preset: DriverConfigPreset) {
        viewModelScope.launch {
            runCatching { api.deletePreset(preset.id) }.onSuccess {
                _presets.value = _presets.value.filterNot { it.id == preset.id }
                if (_selectedPresetId.value == preset.id) _selectedPresetId.value = null
            }
        }
    }

    /** Push visibleCards/order to the backend (fire-and-forget). */
    fun pushPreferencesToServer() {
        viewModelScope.launch {
            runCatching {
                api.updatePreferences(
                    visibleCards = _visibleCards.value,
                    cardOrder = _cardOrder.value,
                )
            }
        }
    }

    fun processSample(sample: GPSSample) {
        _gpsData.value = sample
        lapTracker.gpsSource = if (sample.batteryPercent != null) "racebox" else "phone"
        lapTracker.processSample(sample)
    }

    /** Cards ordered + filtered by visibility, preserving card_order. */
    val orderedVisibleCards: List<DriverCard>
        get() = _cardOrder.value.mapNotNull { key ->
            if (_visibleCards.value[key] == true) DriverCard.fromKey(key) else null
        }
}
