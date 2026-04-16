import SwiftUI

/// Read-only catalog of the circuits the current user has access to. Backed
/// by `ConfigStore.circuits`, which is already populated by `refresh()`
/// through the auth-gated `GET /config/circuits` endpoint. The view does
/// not mutate anything — circuit CRUD is an admin-only concern and lives in
/// a separate admin module.
///
/// The card for the circuit that matches `activeSession.circuitId` is
/// badged "EN USO" so the user can see at a glance which circuit their
/// current session is tied to.
struct CircuitsView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(BBNColors.background)
        .task { await loadFromServer() }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Catálogo de circuitos")
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Circuitos")
                .font(BBNTypography.title2)
                .foregroundStyle(BBNColors.textPrimary)
            Spacer()
            Text("\(app.config.circuits.count)")
                .font(BBNTypography.title3)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
                .accessibilityLabel("\(app.config.circuits.count) circuitos disponibles")
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
        if app.config.isLoading && app.config.circuits.isEmpty {
            ProgressView()
                .tint(BBNColors.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if app.config.circuits.isEmpty {
            PlaceholderView(text: "No tienes circuitos accesibles. Solicita acceso a tu administrador.")
        } else {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(app.config.circuits) { circuit in
                        circuitCard(circuit)
                    }
                }
                .padding(20)
            }
        }
    }

    // MARK: - Card

    @ViewBuilder
    private func circuitCard(_ circuit: Circuit) -> some View {
        let isInUse = isCircuitInUse(circuit)
        BBNCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Text(circuit.name.isEmpty ? "—" : circuit.name)
                        .font(BBNTypography.title3)
                        .foregroundStyle(BBNColors.textPrimary)
                    if isInUse {
                        Text("EN USO")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.accent)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(BBNColors.accent.opacity(0.15))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    Spacer()
                    if circuit.isActive == false {
                        Text("INACTIVO")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                    }
                }

                HStack(spacing: 20) {
                    metadataCell(label: "Longitud", value: lengthText(circuit))
                    metadataCell(label: "Meta 1", value: coordinateText(lat: circuit.finishLat1, lon: circuit.finishLon1))
                    metadataCell(label: "Meta 2", value: coordinateText(lat: circuit.finishLat2, lon: circuit.finishLon2))
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(a11yLabel(circuit, inUse: isInUse))
    }

    @ViewBuilder
    private func metadataCell(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textMuted)
            Text(value)
                .font(BBNTypography.body)
                .monospacedDigit()
                .foregroundStyle(BBNColors.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Formatters

    private func lengthText(_ circuit: Circuit) -> String {
        guard let m = circuit.lengthM, m > 0 else { return "—" }
        return "\(m) m"
    }

    private func coordinateText(lat: Double?, lon: Double?) -> String {
        guard let lat, let lon, !(lat == 0 && lon == 0) else { return "—" }
        return String(format: "%.5f, %.5f", lat, lon)
    }

    private func isCircuitInUse(_ circuit: Circuit) -> Bool {
        app.config.activeSession?.circuitId == circuit.id
    }

    private func a11yLabel(_ circuit: Circuit, inUse: Bool) -> String {
        var parts: [String] = []
        parts.append("Circuito \(circuit.name.isEmpty ? "sin nombre" : circuit.name)")
        parts.append("longitud \(lengthText(circuit))")
        if inUse {
            parts.append("en uso en la sesión activa")
        }
        if circuit.isActive == false {
            parts.append("inactivo")
        }
        return parts.joined(separator: ", ")
    }

    // MARK: - IO

    /// Loads circuits from the server via `ConfigStore.refresh()`. We reuse
    /// `refresh()` instead of a dedicated reload because the store already
    /// fetches all config resources in parallel there, and this view shares
    /// the circuit list with the Sessions sub-tab's picker.
    private func loadFromServer() async {
        if app.config.circuits.isEmpty {
            await app.config.refresh()
        }
        // Also make sure we know what the active session's circuit is, so
        // the "EN USO" badge can resolve correctly after a tenant switch.
        if app.config.activeSession == nil {
            await app.config.reloadActiveSession()
        }
    }
}
