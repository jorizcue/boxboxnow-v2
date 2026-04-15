import Foundation

enum SidebarSection: String, CaseIterable, Identifiable {
    case liveOps = "Operación en vivo"
    case classification = "Clasificación"
    case driver = "Piloto"
    case analysis = "Análisis"
    case admin = "Admin"
    var id: String { rawValue }
}

enum SidebarItem: String, CaseIterable, Identifiable, Hashable {
    // Live ops
    case race
    case pit
    case live
    case config
    // Classification
    case adjusted
    case adjustedBeta
    // Driver
    case driver
    case driverConfig
    // Analysis
    case replay
    case analytics
    case insights
    // Admin
    case adminUsers
    case adminCircuits
    case adminHub
    case adminPlatform

    var id: String { rawValue }

    /// Matches backend `tab_access` slug 1:1.
    var tabSlug: String {
        switch self {
        case .race:           return "race"
        case .pit:            return "pit"
        case .live:           return "live"
        case .config:         return "config"
        case .adjusted:       return "adjusted"
        case .adjustedBeta:   return "adjusted-beta"
        case .driver:         return "driver"
        case .driverConfig:   return "driver-config"
        case .replay:         return "replay"
        case .analytics:      return "analytics"
        case .insights:       return "insights"
        case .adminUsers:     return "admin-users"
        case .adminCircuits:  return "admin-circuits"
        case .adminHub:       return "admin-hub"
        case .adminPlatform:  return "admin-platform"
        }
    }

    var title: String {
        switch self {
        case .race:           return "Carrera"
        case .pit:            return "Box"
        case .live:           return "Live"
        case .config:         return "Config"
        case .adjusted:       return "Clasif. Real"
        case .adjustedBeta:   return "Real Beta"
        case .driver:         return "Vista en vivo"
        case .driverConfig:   return "Config Piloto"
        case .replay:         return "Replay"
        case .analytics:      return "Karts"
        case .insights:       return "GPS Insights"
        case .adminUsers:     return "Usuarios"
        case .adminCircuits:  return "Circuitos"
        case .adminHub:       return "Circuit Hub"
        case .adminPlatform:  return "Plataforma"
        }
    }

    var systemIcon: String {
        switch self {
        case .race:           return "flag.checkered"
        case .pit:            return "wrench.and.screwdriver"
        case .live:           return "dot.radiowaves.left.and.right"
        case .config:         return "slider.horizontal.3"
        case .adjusted:       return "list.number"
        case .adjustedBeta:   return "testtube.2"
        case .driver:         return "speedometer"
        case .driverConfig:   return "square.grid.2x2"
        case .replay:         return "arrow.counterclockwise"
        case .analytics:      return "chart.bar"
        case .insights:       return "map"
        case .adminUsers:     return "person.2.fill"
        case .adminCircuits:  return "mappin.and.ellipse"
        case .adminHub:       return "building.2"
        case .adminPlatform:  return "chart.line.uptrend.xyaxis"
        }
    }

    var section: SidebarSection {
        switch self {
        case .race, .pit, .live, .config:
            return .liveOps
        case .adjusted, .adjustedBeta:
            return .classification
        case .driver, .driverConfig:
            return .driver
        case .replay, .analytics, .insights:
            return .analysis
        case .adminUsers, .adminCircuits, .adminHub, .adminPlatform:
            return .admin
        }
    }

    var requiresAdmin: Bool { section == .admin }
}
