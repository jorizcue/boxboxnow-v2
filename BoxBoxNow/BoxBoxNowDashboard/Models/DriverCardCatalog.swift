import Foundation

/// Static catalog of driver-view card IDs, mirroring the web's
/// `ALL_DRIVER_CARDS` in `frontend/src/hooks/useDriverConfig.ts`. The server
/// stores cards as opaque string keys in `DriverConfigPreset.visibleCards`
/// and `DriverConfigPreset.cardOrder`; this catalog is the iPad-side lookup
/// of human labels and group buckets for those keys.
///
/// Keep IDs in sync with the web — presets created on the web must round-trip
/// through the iPad editor without losing cards, so any drift here surfaces
/// as "unknown card" gaps in `PresetFormView`. If the web adds a new card,
/// add it here too.
enum DriverCardCatalog {
    enum Group: String, CaseIterable, Identifiable {
        case race, box, gps
        var id: String { rawValue }
        var title: String {
            switch self {
            case .race: return "Carrera"
            case .box:  return "Box"
            case .gps:  return "GPS"
            }
        }
    }

    struct Card: Identifiable, Hashable {
        let id: String
        let label: String
        let group: Group
    }

    static let all: [Card] = [
        // --- Race group ---
        Card(id: "raceTimer",       label: "Tiempo de carrera",            group: .race),
        Card(id: "currentLapTime",  label: "Vuelta actual (tiempo real)",  group: .race),
        Card(id: "lastLap",         label: "Última vuelta",                group: .race),
        Card(id: "position",        label: "Posición (tiempos medios)",    group: .race),
        Card(id: "realPos",         label: "Posición (clasif. real)",      group: .race),
        Card(id: "gapAhead",        label: "Gap kart delante",             group: .race),
        Card(id: "gapBehind",       label: "Gap kart detrás",              group: .race),
        Card(id: "avgLap20",        label: "Vuelta media (20v)",           group: .race),
        Card(id: "best3",           label: "Mejor 3 (3V)",                 group: .race),
        Card(id: "bestStintLap",    label: "Mejor vuelta stint",           group: .race),
        Card(id: "avgFutureStint",  label: "Media stint futuro",           group: .race),
        Card(id: "lapsToMaxStint",  label: "Vueltas hasta stint máximo",   group: .race),
        // --- Box group ---
        Card(id: "boxScore",        label: "Puntuación Box",               group: .box),
        Card(id: "pitCount",        label: "PITS (realizados / mínimos)",  group: .box),
        Card(id: "currentPit",      label: "Pit en curso",                 group: .box),
        Card(id: "pitWindow",       label: "Ventana de pit",               group: .box),
        // --- GPS group ---
        Card(id: "deltaBestLap",    label: "Delta vs Best Lap (GPS)",      group: .gps),
        Card(id: "gForceRadar",     label: "G-Force (diana)",              group: .gps),
        Card(id: "gpsLapDelta",     label: "Delta vuelta anterior GPS",    group: .gps),
        Card(id: "gpsSpeed",        label: "Velocidad GPS",                group: .gps),
        Card(id: "gpsGForce",       label: "G-Force (números)",            group: .gps),
    ]

    /// All known card ids, in the same canonical order as `all`. Used as the
    /// default `cardOrder` for brand-new presets so fresh presets show every
    /// card until the user trims them.
    static var allIds: [String] { all.map(\.id) }

    /// Human label for a given card id. Unknown ids fall back to the raw id
    /// so the UI still renders something meaningful instead of a blank row.
    static func label(for id: String) -> String {
        all.first(where: { $0.id == id })?.label ?? id
    }

    /// Cards grouped by bucket, preserving `all`'s order inside each group.
    /// Iteration-friendly for `ForEach` over a `Section` per group.
    static var grouped: [(Group, [Card])] {
        Group.allCases.map { group in
            (group, all.filter { $0.group == group })
        }
    }
}
