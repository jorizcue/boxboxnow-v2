import SwiftUI

struct LiveDashboardView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        ZStack {
            BBNColors.background.ignoresSafeArea()

            if let url = liveURL {
                LiveWebView(url: url)
                    .ignoresSafeArea(edges: .bottom)
            } else {
                PlaceholderView(text: "Cargando live…")
            }
        }
    }

    /// The Live URL is supplied by the backend via `ConfigStore.liveTimingURL`,
    /// which is populated during `ConfigStore.refresh()` immediately after
    /// login. Until that fetch completes we show a loading placeholder —
    /// we do NOT fall back to a hardcoded domain, because multi-circuit
    /// deployments mean the canonical URL is server-owned.
    private var liveURL: URL? {
        guard let urlString = app.config.liveTimingURL else { return nil }
        return URL(string: urlString)
    }
}
