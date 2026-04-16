import Foundation

/// Sub-tabs inside the Config module. Phase A only wires `.sessions`; the rest
/// render Phase-B placeholders in `ConfigView`.
enum ConfigSubTab: String, CaseIterable, Identifiable, Hashable {
    case sessions, teams, circuits, presets, preferences

    var id: String { rawValue }

    var title: String {
        switch self {
        case .sessions:    return "Sesiones"
        case .teams:       return "Equipos"
        case .circuits:    return "Circuitos"
        case .presets:     return "Presets de piloto"
        case .preferences: return "Preferencias"
        }
    }

    var icon: String {
        switch self {
        case .sessions:    return "calendar"
        case .teams:       return "person.3"
        case .circuits:    return "mappin.and.ellipse"
        case .presets:     return "square.grid.2x2"
        case .preferences: return "gearshape"
        }
    }
}
