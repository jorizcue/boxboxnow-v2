import SwiftUI

struct DriverView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var raceVM: RaceViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showMenu = false

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height
            let columns = Array(repeating: GridItem(.flexible(), spacing: 8),
                                count: isLandscape ? 3 : 2)

            ZStack {
                Color.black.ignoresSafeArea()

                ScrollView {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(driverVM.orderedVisibleCards) { card in
                            DriverCardView(
                                card: card,
                                kart: myKart,
                                gps: driverVM.gpsData,
                                driverVM: driverVM
                            )
                        }
                    }
                    .padding(8)
                }

                if showMenu {
                    DriverMenuOverlay(isPresented: $showMenu, onDismiss: { dismiss() })
                }
            }
            .onTapGesture { showMenu.toggle() }
            .statusBarHidden(true)
            .persistentSystemOverlays(.hidden)
        }
    }

    private var myKart: KartState? {
        // TODO: determine user's kart number
        raceVM.karts.first
    }
}
