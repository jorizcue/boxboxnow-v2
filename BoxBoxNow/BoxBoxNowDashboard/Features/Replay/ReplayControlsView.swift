import SwiftUI

/// Horizontal playback bar shown when a server-side replay is active.
/// Mirrors the web replay progress pill:
///   [▶/⏸] [speed menu] [0:12:34] [━━━━━●━━ 45%] [replay.log] [■]
///
/// Reads live status from `RaceStore.replayStatus` (fed by the WebSocket)
/// and dispatches control commands through `ReplayStore`. The progress
/// slider is tappable/draggable — on release it calls `seekReplay(block:)`
/// so the user can jump to any position within the recording, just like
/// the web timeline.
struct ReplayControlsView: View {
    @Environment(AppStore.self) private var app

    private let speeds: [Double] = [1, 2, 5, 10, 20, 50, 100]

    @State private var scrubbing: Bool = false
    @State private var scrubProgress: Double = 0

    var body: some View {
        let status = app.race.replayStatus
        let displayProgress = scrubbing ? scrubProgress : status.progress

        HStack(spacing: 14) {
            Button {
                Task { await app.replay.pauseReplay() }
            } label: {
                Image(systemName: status.paused ? "play.fill" : "pause.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(BBNColors.accent)
            }
            .accessibilityLabel(status.paused ? "Reanudar" : "Pausar")

            Menu {
                ForEach(speeds, id: \.self) { s in
                    Button {
                        Task { await app.replay.changeSpeed(s) }
                    } label: {
                        HStack {
                            Text(formatSpeed(s))
                            if s == app.replay.speed {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                Text(formatSpeed(app.replay.speed))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(BBNColors.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(BBNColors.surface)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(BBNColors.border, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .accessibilityLabel("Velocidad de reproducción")

            if let time = status.currentTime {
                Text(formatTimestamp(time))
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(BBNColors.textMuted)
                    .frame(minWidth: 70, alignment: .leading)
            }

            // Seekable progress bar. Drag updates `scrubProgress`; on release
            // we compute the block index from the total and call
            // `seekReplay(block:)`. While scrubbing, `displayProgress` is
            // used so the thumb follows the finger instead of snapping back
            // to the server's value.
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(BBNColors.surface)
                        .frame(height: 6)
                    Capsule()
                        .fill(BBNColors.accent)
                        .frame(width: max(6, geo.size.width * displayProgress), height: 6)
                    Circle()
                        .fill(BBNColors.accent)
                        .frame(width: 14, height: 14)
                        .offset(x: geo.size.width * displayProgress - 7)
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { g in
                            scrubbing = true
                            let frac = min(1, max(0, g.location.x / geo.size.width))
                            scrubProgress = frac
                        }
                        .onEnded { _ in
                            let total = status.totalBlocks ?? 0
                            let target = Int((scrubProgress * Double(max(1, total))).rounded())
                            Task { await app.replay.seekReplay(block: target) }
                            // Keep the thumb where the user released until the
                            // server pushes a fresh status.
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                                scrubbing = false
                            }
                        }
                )
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .frame(height: 18)
            .frame(minWidth: 160)

            Text("\(Int(displayProgress * 100))%")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(BBNColors.textMuted)
                .frame(width: 44, alignment: .trailing)

            if let filename = status.filename {
                Text(filename)
                    .font(.system(size: 11))
                    .foregroundStyle(BBNColors.textDim)
                    .lineLimit(1)
                    .frame(maxWidth: 200, alignment: .trailing)
            }

            Button {
                Task { await app.replay.stopReplay() }
            } label: {
                Image(systemName: "stop.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(BBNColors.danger)
            }
            .accessibilityLabel("Detener replay")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(BBNColors.surface)
    }

    private func formatSpeed(_ s: Double) -> String {
        s == s.rounded() ? "\(Int(s))x" : String(format: "%.1fx", s)
    }

    /// Extract HH:MM:SS from an ISO8601 timestamp. Falls back to the raw
    /// string if parsing fails so the UI still shows something useful.
    private func formatTimestamp(_ iso: String) -> String {
        let isoParser = ISO8601DateFormatter()
        isoParser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoParser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) {
            let f = DateFormatter()
            f.dateFormat = "HH:mm:ss"
            return f.string(from: date)
        }
        return iso
    }
}
