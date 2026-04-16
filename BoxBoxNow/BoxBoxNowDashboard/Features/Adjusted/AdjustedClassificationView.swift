import SwiftUI

/// "Clasif. Real" — kart-level ranking provided pre-sorted by the backend.
/// Shows position, kart, driver/team, tier-adjusted average, gap, laps, pits.
struct AdjustedClassificationView: View {
    @Environment(AppStore.self) private var app

    private let columns: [ClassificationHeader.Column] = [
        .init(title: "Pos", width: 48, align: .leading),
        .init(title: "Kart", width: 60, align: .leading),
        .init(title: "Piloto / Equipo", width: nil, align: .leading),
        .init(title: "Avg", width: 100, align: .trailing),
        .init(title: "Gap", width: 80, align: .trailing),
        .init(title: "Vueltas", width: 64, align: .trailing),
        .init(title: "Pits", width: 48, align: .trailing),
    ]

    var body: some View {
        VStack(spacing: 0) {
            ClassificationHeader(columns: columns)

            if app.race.classification.isEmpty {
                PlaceholderView(text: "Esperando clasificación…")
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(app.race.classification) { entry in
                            ClassificationRow(entry: entry)
                        }
                    }
                }
            }
        }
        .background(BBNColors.background)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Clasificación real")
    }
}
