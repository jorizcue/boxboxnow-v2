import SwiftUI

/// Live preview of the driver view using the current card selection and
/// order. Renders inside a bordered container at the aspect ratio of the
/// iPad's remaining screen space so the user gets an accurate picture of
/// what their driver view will look like.
struct PreviewGridView: View {
    let cardOrder: [String]
    let visibleCards: [String: Bool]

    var body: some View {
        let activeIds = cardOrder.filter { visibleCards[$0] == true }
        DriverGridView(
            cardIds: activeIds.isEmpty ? DriverCardCatalog.allIds : activeIds,
            kart: mockKart,
            countdownMs: 5_432_000  // 1h 30m 32s demo countdown
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(BBNColors.border, lineWidth: 1)
        )
    }

    private var mockKart: KartStateFull? {
        #if DEBUG
        return KartStateFull.preview
        #else
        return nil
        #endif
    }
}
