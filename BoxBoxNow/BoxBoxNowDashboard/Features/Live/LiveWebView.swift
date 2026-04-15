import SwiftUI
import WebKit

/// Thin `UIViewRepresentable` wrapper around `WKWebView`. The Live tab
/// embeds the operator's public-screen URL served by the backend; the
/// responsive CSS that powers the web version handles all layout — this
/// view just renders it in a native frame.
///
/// The view is opaque black so the dashboard's dark background shows
/// through during any transient white-flash while the page loads, and
/// bounce is disabled because the embedded page has its own fixed layout.
struct LiveWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.bounces = false
        web.load(URLRequest(url: url))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // Only re-load if the target URL actually changed (e.g. the user
        // switched circuits in the config store). Calling load() on every
        // SwiftUI re-render would cause the page to reset constantly.
        if uiView.url != url {
            uiView.load(URLRequest(url: url))
        }
    }
}
