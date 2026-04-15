import SwiftUI

/// Horizontal queue of karts waiting to be called into the pit lane.
/// The parent passes the live `FifoState` from `RaceStore.fifo`; this view
/// only reads the `queue` array and decides between an empty state and a
/// horizontal scroller of badges.
struct FifoQueueView: View {
    let state: FifoState

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Cola FIFO")
                        .font(BBNTypography.title3)
                        .foregroundStyle(BBNColors.textPrimary)
                    Spacer()
                    Text("\(state.queue.count) karts")
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textMuted)
                }

                if state.queue.isEmpty {
                    Text("Sin karts en cola")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                        .padding(.vertical, 24)
                        .frame(maxWidth: .infinity)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(state.queue.enumerated()), id: \.element.id) { idx, entry in
                                VStack(spacing: 4) {
                                    Text("\(idx + 1)")
                                        .font(BBNTypography.caption)
                                        .foregroundStyle(BBNColors.textMuted)
                                    KartNumberBadge(number: entry.kartNumber, size: 48)
                                    Text(entry.driverName)
                                        .font(BBNTypography.caption)
                                        .foregroundStyle(BBNColors.textPrimary)
                                        .lineLimit(1)
                                        .truncationMode(.tail)
                                }
                                .frame(width: 80)
                                .padding(.vertical, 8)
                                .background(BBNColors.background)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                }
            }
        }
    }
}
