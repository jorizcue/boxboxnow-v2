import SwiftUI
import UniformTypeIdentifiers

struct CardOrderPreviewView: View {
    @EnvironmentObject var driverVM: DriverViewModel
    @EnvironmentObject var toast: ToastManager
    @State private var draggingCard: DriverCard?

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height
            let numCols = isLandscape ? 3 : 2
            let cards = driverVM.orderedVisibleCards
            let numRows = (cards.count + numCols - 1) / numCols
            let spacing: CGFloat = 8
            let padding: CGFloat = 12

            let totalVerticalSpacing = spacing * CGFloat(max(0, numRows - 1))
            let availableHeight = geo.size.height - padding * 2 - totalVerticalSpacing
            let cardHeight = numRows > 0 ? max(60, availableHeight / CGFloat(numRows)) : 80
            let scale = min(2.0, max(0.8, cardHeight / 80))

            let columns = Array(repeating: GridItem(.flexible(), spacing: spacing), count: numCols)

            Group {
                if numRows > 0 && availableHeight / CGFloat(numRows) >= 60 {
                    LazyVGrid(columns: columns, spacing: spacing) {
                        ForEach(cards) { card in
                            CardPreviewCell(card: card, isDragging: draggingCard == card, height: cardHeight, scale: scale)
                                .onDrag {
                                    draggingCard = card
                                    return NSItemProvider(object: card.rawValue as NSString)
                                }
                                .onDrop(of: [.text], delegate: CardDropDelegate(
                                    card: card,
                                    draggingCard: $draggingCard,
                                    driverVM: driverVM
                                ))
                        }
                    }
                    .padding(padding)
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: spacing) {
                            ForEach(cards) { card in
                                CardPreviewCell(card: card, isDragging: draggingCard == card, height: 80, scale: 1.0)
                                    .onDrag {
                                        draggingCard = card
                                        return NSItemProvider(object: card.rawValue as NSString)
                                    }
                                    .onDrop(of: [.text], delegate: CardDropDelegate(
                                        card: card,
                                        draggingCard: $draggingCard,
                                        driverVM: driverVM
                                    ))
                            }
                        }
                        .padding(padding)
                    }
                }
            }
        }
        .background(Color.black)
        .navigationTitle("Orden y vista previa")
        .onDisappear {
            driverVM.saveConfig()
            Task {
                do {
                    try await APIClient.shared.updatePreferences(
                        visibleCards: driverVM.visibleCards,
                        cardOrder: driverVM.cardOrder
                    )
                } catch {
                    await MainActor.run {
                        toast.warning("Guardado local OK, pero no se pudo sincronizar con el servidor")
                    }
                }
            }
        }
    }
}

struct CardPreviewCell: View {
    let card: DriverCard
    let isDragging: Bool
    var height: CGFloat = 80
    var scale: CGFloat = 1.0

    var body: some View {
        VStack(spacing: 4 * scale) {
            Text(card.displayName)
                .font(.system(size: 9 * scale, weight: .medium))
                .foregroundColor(.gray)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            Text(card.sampleValue)
                .font(.system(size: 18 * scale, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(6 * scale)
        .frame(height: height)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(card.accentColor.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(card.accentColor.opacity(0.5), lineWidth: 1.5)
                )
        )
        .opacity(isDragging ? 0.4 : 1.0)
        .scaleEffect(isDragging ? 0.95 : 1.0)
        .animation(.easeInOut(duration: 0.15), value: isDragging)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(card.displayName): \(card.sampleValue)")
        .accessibilityHint("Arrastra para reordenar")
    }
}

struct CardDropDelegate: DropDelegate {
    let card: DriverCard
    @Binding var draggingCard: DriverCard?
    let driverVM: DriverViewModel

    func performDrop(info: DropInfo) -> Bool {
        draggingCard = nil
        return true
    }

    func dropEntered(info: DropInfo) {
        guard let dragging = draggingCard, dragging != card else { return }
        let visibleCards = driverVM.orderedVisibleCards
        guard let fromIdx = visibleCards.firstIndex(of: dragging),
              let toIdx = visibleCards.firstIndex(of: card) else { return }

        var newOrder = visibleCards.map { $0.rawValue }
        newOrder.move(fromOffsets: IndexSet(integer: fromIdx), toOffset: toIdx > fromIdx ? toIdx + 1 : toIdx)

        let hiddenCards = driverVM.cardOrder.filter { key in
            driverVM.visibleCards[key] != true
        }
        withAnimation(.easeInOut(duration: 0.15)) {
            driverVM.cardOrder = newOrder + hiddenCards
        }
    }
}
