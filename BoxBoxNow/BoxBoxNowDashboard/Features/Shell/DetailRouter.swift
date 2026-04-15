import SwiftUI

struct DetailRouter: View {
    let item: SidebarItem?

    var body: some View {
        Group {
            switch item {
            case .race:           RaceView()
            case .pit:            PitView()
            case .live:           LiveDashboardView()
            case .config:         ConfigView()
            case .adjusted:       AdjustedClassificationView()
            case .adjustedBeta:   AdjustedBetaClassificationView()
            case .driver:         DriverLiveView()
            case .driverConfig:   DriverConfigView()
            case .replay:         ReplayView()
            case .analytics:      KartAnalyticsView()
            case .insights:       InsightsView()
            case .adminUsers:     AdminUsersView()
            case .adminCircuits:  AdminCircuitsView()
            case .adminHub:       AdminHubView()
            case .adminPlatform:  AdminPlatformView()
            case .none:
                PlaceholderView(text: "Selecciona una opción del menú")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BBNColors.background)
    }
}
