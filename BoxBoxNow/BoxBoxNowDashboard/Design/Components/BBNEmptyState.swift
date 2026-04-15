import SwiftUI

struct BBNEmptyState: View {
    /// Optional call-to-action button shown below the subtitle.
    ///
    /// Modeled as a nested struct (not a tuple) so consumers can construct
    /// it with a trailing closure at the call site. The handler is sync;
    /// wrap async work in a `Task { }` at the call site, e.g.
    ///
    ///     BBNEmptyState(
    ///         icon: "tray",
    ///         title: "Sin datos",
    ///         action: .init(title: "Reintentar") {
    ///             Task { await store.refresh() }
    ///         }
    ///     )
    struct Action {
        let title: String
        let handler: () -> Void

        init(title: String, handler: @escaping () -> Void) {
            self.title = title
            self.handler = handler
        }
    }

    let icon: String
    let title: String
    var subtitle: String? = nil
    var action: Action? = nil

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 48)).foregroundColor(BBNColors.textDim)
            Text(title).font(BBNTypography.title2).foregroundColor(BBNColors.textPrimary)
            if let subtitle {
                Text(subtitle)
                    .font(BBNTypography.body)
                    .foregroundColor(BBNColors.textMuted)
                    .multilineTextAlignment(.center)
            }
            if let action {
                BBNPrimaryButton(title: action.title, action: action.handler).frame(maxWidth: 240)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }
}
