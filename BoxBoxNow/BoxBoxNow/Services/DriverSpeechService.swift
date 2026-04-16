import AVFoundation
import Combine

/// Speaks race data once per lap, matching the web's `useDriverSpeech` hook.
///
/// Narrates: last lap time, delta vs previous, position, box score, laps to max stint.
/// Uses AVSpeechSynthesizer with Spanish voice.
final class DriverSpeechService: NSObject, ObservableObject {
    /// Initial value is seeded from UserDefaults so a previously-saved choice
    /// (from the menu toggle or from `applyPreset`) survives app restarts.
    @Published var enabled: Bool = {
        let defaults = UserDefaults.standard
        // If the key has never been set, default to false (backwards-compat).
        guard defaults.object(forKey: Constants.Keys.audioEnabled) != nil else {
            return false
        }
        return defaults.bool(forKey: Constants.Keys.audioEnabled)
    }()
    @Published var supported = true

    private let synthesizer = AVSpeechSynthesizer()
    private var lastSpokenLapMs: Double = 0
    private var spanishVoice: AVSpeechSynthesisVoice?

    override init() {
        super.init()
        pickVoice()
        configureAudioSession()
    }

    // MARK: - Public

    /// Call when a new lap completes (lastLapMs changes).
    func speakLapData(
        lastLapMs: Double,
        prevLapMs: Double,
        lapDelta: String?,         // "faster" | "slower" | nil
        realPosition: Int?,
        totalKarts: Int?,
        boxScore: Double,
        lapsToMaxStint: Double?
    ) {
        guard enabled, lastLapMs > 0 else { return }
        guard lastLapMs != lastSpokenLapMs else { return }
        lastSpokenLapMs = lastLapMs

        var parts: [String] = []

        // 1. Last lap time
        parts.append(spokenLapTime(lastLapMs))

        // 2. Delta vs previous lap
        if let delta = lapDelta, prevLapMs > 0 {
            let deltaMs = lastLapMs - prevLapMs
            let absDelta = abs(deltaMs) / 1000
            if delta == "faster" {
                parts.append("menos \(String(format: "%.1f", absDelta)) décimas")
            } else {
                parts.append("más \(String(format: "%.1f", absDelta)) décimas")
            }
        }

        // 3. Position
        if let pos = realPosition, pos > 0 {
            parts.append("posición \(pos)")
        }

        // 4. Box score
        if boxScore > 0 {
            parts.append("box \(Int(boxScore))")
        }

        // 5. Laps to max stint (only when ≤ 10)
        if let laps = lapsToMaxStint, laps > 0 {
            let rounded = Int(laps.rounded())
            if rounded <= 10 {
                parts.append("quedan \(rounded) vueltas")
            }
        }

        let message = parts.joined(separator: ". ")
        speak(message)
    }

    /// Reset state (e.g. when kart number changes)
    func reset() {
        lastSpokenLapMs = 0
        synthesizer.stopSpeaking(at: .immediate)
    }

    // MARK: - Private

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            // Allow mixing with other audio (e.g. music) and duck others
            try session.setCategory(.playback, mode: .voicePrompt, options: [.mixWithOthers, .duckOthers])
            try session.setActive(true)
        } catch {
            // Audio session config failed — speech may still work
        }
    }

    private func pickVoice() {
        let voices = AVSpeechSynthesisVoice.speechVoices()
        let esVoices = voices.filter { $0.language.hasPrefix("es") }
        guard !esVoices.isEmpty else { return }

        // Prefer premium/enhanced voices (quality == .enhanced on iOS 16+)
        let premium = esVoices.first { voice in
            if #available(iOS 16.0, *) {
                return voice.quality == .enhanced || voice.quality == .premium
            }
            // Fallback: look for known good voice names
            let name = voice.name.lowercased()
            return name.contains("monica") || name.contains("paulina") || name.contains("jorge")
        }

        spanishVoice = premium ?? esVoices.first
    }

    private func speak(_ text: String) {
        synthesizer.stopSpeaking(at: .immediate)

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = spanishVoice ?? AVSpeechSynthesisVoice(language: "es-ES")
        utterance.rate = 0.48  // AVSpeech rate ~0.48 ≈ web rate 0.9
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0

        synthesizer.speak(utterance)
    }

    /// Convert ms to spoken Spanish, e.g. 65432 → "1 05 4"
    /// Keeps it short and clear for audio.
    private func spokenLapTime(_ ms: Double) -> String {
        let totalSec = ms / 1000
        let minutes = Int(totalSec) / 60
        let seconds = Int(totalSec) % 60
        let tenths = Int((totalSec - Double(Int(totalSec))) * 10)

        if minutes > 0 {
            return "\(minutes) \(String(format: "%02d", seconds)) \(tenths)"
        } else {
            return "\(seconds) \(tenths)"
        }
    }
}
