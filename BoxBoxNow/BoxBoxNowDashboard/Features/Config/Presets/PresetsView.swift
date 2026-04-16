import SwiftUI

/// List view for the user's driver-view presets. Reads from
/// `ConfigStore.presets` and delegates CRUD to `PresetFormView` via two
/// sheets (new + edit). Delete is immediate without a confirmation dialog —
/// matches the Teams sub-tab's "trash button acts instantly" pattern.
///
/// The richer drag-to-reorder workflow lives in Task 26's DriverConfig
/// module. This view is deliberately limited to chevron-based reordering
/// inside the form.
struct PresetsView: View {
    @Environment(AppStore.self) private var app

    @State private var showingNew: Bool = false
    @State private var editing: DriverConfigPreset? = nil

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(BBNColors.background)
        .task { await loadFromServer() }
        .sheet(isPresented: $showingNew) {
            PresetFormView(initial: nil) { draft in
                if await app.config.savePreset(draft) != nil {
                    showingNew = false
                }
            }
        }
        .sheet(item: $editing) { preset in
            PresetFormView(initial: preset) { draft in
                if await app.config.savePreset(draft) != nil {
                    editing = nil
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Editor de presets de piloto")
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Text("Presets de piloto")
                .font(BBNTypography.title2)
                .foregroundStyle(BBNColors.textPrimary)

            Text("\(app.config.presets.count)")
                .font(BBNTypography.title3)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
                .accessibilityLabel("\(app.config.presets.count) presets")

            Spacer()

            Button {
                showingNew = true
            } label: {
                Label("Nuevo preset", systemImage: "plus")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.accent)
            }
            .accessibilityHint("Abre el formulario para crear un nuevo preset")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(BBNColors.surface)
        .overlay(
            Rectangle().fill(BBNColors.border).frame(height: 0.5),
            alignment: .bottom
        )
    }

    // MARK: - Content states

    @ViewBuilder
    private var content: some View {
        if app.config.presets.isEmpty {
            PlaceholderView(text: "Aún no tienes presets. Crea uno para configurar tu vista de piloto.")
        } else {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(app.config.presets) { preset in
                        presetCard(preset)
                    }
                }
                .padding(20)
            }
        }
    }

    // MARK: - Card

    @ViewBuilder
    private func presetCard(_ preset: DriverConfigPreset) -> some View {
        BBNCard {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 10) {
                        Text(preset.name.isEmpty ? "—" : preset.name)
                            .font(BBNTypography.title3)
                            .foregroundStyle(BBNColors.textPrimary)
                        if preset.isDefault {
                            Text("POR DEFECTO")
                                .font(BBNTypography.caption)
                                .foregroundStyle(BBNColors.accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(BBNColors.accent.opacity(0.15))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                    }
                    Text(metadataText(preset))
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textMuted)
                }

                Spacer()

                Button {
                    editing = preset
                } label: {
                    Image(systemName: "pencil")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.accent)
                }
                .accessibilityLabel("Editar preset")

                Button(role: .destructive) {
                    Task { await app.config.deletePreset(id: preset.id) }
                } label: {
                    Image(systemName: "trash")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.danger)
                }
                .accessibilityLabel("Eliminar preset")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(a11yLabel(preset))
    }

    // MARK: - Formatters

    private func metadataText(_ preset: DriverConfigPreset) -> String {
        let visible = preset.visibleCards.values.filter { $0 }.count
        let total = preset.cardOrder.count
        return "\(visible) tarjetas visibles · \(total) en total"
    }

    private func a11yLabel(_ preset: DriverConfigPreset) -> String {
        var parts: [String] = []
        parts.append("Preset \(preset.name.isEmpty ? "sin nombre" : preset.name)")
        let visible = preset.visibleCards.values.filter { $0 }.count
        parts.append("\(visible) tarjetas visibles")
        if preset.isDefault {
            parts.append("por defecto")
        }
        return parts.joined(separator: ", ")
    }

    // MARK: - IO

    /// Loads presets from the server. Idempotent — mirrors the
    /// Circuits/Sessions pattern of "only fetch when the cache is empty".
    private func loadFromServer() async {
        if app.config.presets.isEmpty {
            await app.config.reloadPresets()
        }
    }
}
