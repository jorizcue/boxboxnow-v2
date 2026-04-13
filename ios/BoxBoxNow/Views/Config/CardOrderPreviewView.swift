import SwiftUI

struct CardOrderPreviewView: View {
    @EnvironmentObject var driverVM: DriverViewModel

    var body: some View {
        VStack(spacing: 0) {
            List {
                ForEach(driverVM.orderedVisibleCards) { card in
                    HStack {
                        Image(systemName: card.iconName)
                            .foregroundColor(.accentColor)
                            .frame(width: 30)
                        Text(card.displayName)
                    }
                }
                .onMove(perform: move)
            }
            .listStyle(.plain)
            .frame(maxHeight: .infinity)

            Divider()

            // Mini preview
            ScrollView {
                let columns = [GridItem(.flexible()), GridItem(.flexible())]
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(driverVM.orderedVisibleCards) { card in
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(.systemGray5))
                            .frame(height: 50)
                            .overlay(
                                Text(card.displayName)
                                    .font(.caption2)
                                    .foregroundColor(.gray)
                            )
                    }
                }
                .padding(12)
            }
            .frame(height: 200)
            .background(Color.black)
        }
        .navigationTitle("Orden y vista previa")
        .toolbar { EditButton() }
        .onDisappear { driverVM.saveConfig() }
    }

    private func move(from source: IndexSet, to destination: Int) {
        var visible = driverVM.orderedVisibleCards.map { $0.rawValue }
        visible.move(fromOffsets: source, toOffset: destination)
        // Rebuild full order: visible ones in new order + hidden ones keep position
        let hiddenCards = driverVM.cardOrder.filter { key in
            driverVM.visibleCards[key] != true
        }
        driverVM.cardOrder = visible + hiddenCards
    }
}
