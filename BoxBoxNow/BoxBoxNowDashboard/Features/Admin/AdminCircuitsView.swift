import SwiftUI

struct AdminCircuitsView: View {
    @Environment(AppStore.self) private var app

    private var store: AdminStore? { app.admin }

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(BBNColors.background)
        .task { await store?.refreshCircuits() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            HStack(spacing: 8) {
                Text("Circuitos")
                    .font(BBNTypography.title2)
                    .foregroundColor(BBNColors.textPrimary)
                if let count = store?.circuits.count, count > 0 {
                    Text("\(count)")
                        .font(BBNTypography.caption)
                        .foregroundColor(.black)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(BBNColors.accent)
                        .clipShape(Capsule())
                }
            }
            Spacer()
            Button {
                Task { await store?.refreshCircuits() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .foregroundColor(BBNColors.textMuted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if store?.isLoading == true && (store?.circuits.isEmpty ?? true) {
            ProgressView()
                .tint(BBNColors.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store?.circuits.isEmpty ?? true {
            BBNEmptyState(
                icon: "flag.checkered",
                title: "Sin circuitos",
                subtitle: "No hay circuitos configurados"
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(store?.circuits ?? []) { circuit in
                        circuitRow(circuit)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }

    // MARK: - Row

    private func circuitRow(_ circuit: Circuit) -> some View {
        BBNCard {
            HStack(spacing: 12) {
                // Circuit icon
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(BBNColors.surface)
                        .frame(width: 44, height: 44)
                    Image(systemName: "flag.checkered")
                        .foregroundColor(BBNColors.accent)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(circuit.name)
                        .font(BBNTypography.bodyBold)
                        .foregroundColor(BBNColors.textPrimary)

                    HStack(spacing: 12) {
                        if let length = circuit.lengthM {
                            Label("\(length) m", systemImage: "ruler")
                                .font(BBNTypography.caption)
                                .foregroundColor(BBNColors.textDim)
                        }
                        if circuit.isActive == true {
                            HStack(spacing: 4) {
                                Circle()
                                    .fill(BBNColors.success)
                                    .frame(width: 6, height: 6)
                                Text("Activo")
                                    .font(BBNTypography.caption)
                                    .foregroundColor(BBNColors.success)
                            }
                        }
                    }
                }

                Spacer()

                // Coordinates indicator
                if circuit.finishLat1 != nil {
                    Label("GPS", systemImage: "location.fill")
                        .font(BBNTypography.caption)
                        .foregroundColor(BBNColors.textDim)
                }
            }
        }
    }
}
