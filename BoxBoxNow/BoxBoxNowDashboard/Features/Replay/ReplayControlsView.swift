import SwiftUI

/// Horizontal playback bar shown when a server-side replay is active.
/// Reads live status from `RaceStore.replayStatus` (fed by the WebSocket)
/// and dispatches control commands through `ReplayStore`.
struct ReplayControlsView: View {
    @Environment(AppStore.self) private var app

    private let speeds: [Double] = [1, 2, 5, 10, 20, 50, 100]

    var body: some View {
        let status = app.race.replayStatus

        HStack(spacing: 16) {
            // Pause / Resume
            Button {
                Task { await app.replay.pauseReplay() }
            } label: {
                Image(systemName: status.paused ? "play.fill" : "pause.fill")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.accent)
            }
            .accessibilityLabel(status.paused ? "Reanudar" : "Pausar")

            // Speed picker
            Menu {
                ForEach(speeds, id: \.self) { s in
                    Button {
                        Task { await app.replay.changeSpeed(s) }
                    } label: {
                        HStack {
                            Text("\(s, specifier: s == s.rounded() ? "%.0f" : "%.1f")x")
                            if s == app.replay.speed {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                Text("\(app.replay.speed, specifier: app.replay.speed == app.replay.speed.rounded() ? "%.0f" : "%.1f")x")
                    .font(BBNTypography.bodyBold)
                    .foregroundStyle(BBNColors.textPrimary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(BBNColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .accessibilityLabel("Velocidad de reproducción")

            // Progress
            Text("\(Int(status.progress * 100))%")
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
                .accessibilityLabel("Progreso \(Int(status.progress * 100)) por ciento")

            Spacer()

            // Filename
            if let filename = status.filename {
                Text(filename)
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textDim)
                    .lineLimit(1)
            }

            // Stop
            Button {
                Task { await app.replay.stopReplay() }
            } label: {
                Image(systemName: "stop.fill")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.danger)
            }
            .accessibilityLabel("Detener replay")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(BBNColors.surface)
    }
}
