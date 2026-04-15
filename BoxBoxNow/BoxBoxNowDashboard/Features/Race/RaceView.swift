import SwiftUI

struct RaceView: View {
    @Environment(AppStore.self) private var app
    @State private var selected: KartStateFull? = nil

    var body: some View {
        VStack(spacing: 0) {
            RaceTableHeader()
            if app.race.karts.isEmpty {
                PlaceholderView(text: "Esperando datos de la carrera…")
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(sortedKarts) { kart in
                            RaceRowView(
                                kart: kart,
                                onTap: { selected = kart }
                            )
                        }
                    }
                }
            }
        }
        .background(BBNColors.background)
        .sheet(item: $selected) { kart in
            KartDetailSheet(kart: kart)
        }
    }

    private var sortedKarts: [KartStateFull] {
        app.race.karts.sorted { $0.base.position < $1.base.position }
    }
}
