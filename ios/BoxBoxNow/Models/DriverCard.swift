import Foundation
import SwiftUI

enum DriverCard: String, CaseIterable, Codable, Identifiable {
    case position, lapCount, lastLap, bestLap
    case gapToLeader, gapToAhead
    case speed, gForce
    case currentStint, pitStops
    case sector, tireLife, fuelLevel
    case weather, trackTemp
    case consistency, minimap, lapHistory, delta

    var id: String { rawValue }

    /// Translation key for this card's user-visible label. The actual
    /// text comes from `t(card.i18nKey, lang.current)` at the call site,
    /// so renaming a label only requires an update to `Translations.swift`.
    var i18nKey: String {
        switch self {
        case .position:     return "card.position"
        case .lapCount:     return "card.lapCount"
        case .lastLap:      return "card.lastLap"
        case .bestLap:      return "card.bestLap"
        case .gapToLeader:  return "card.gapToLeader"
        case .gapToAhead:   return "card.gapToAhead"
        case .speed:        return "card.speed"
        case .gForce:       return "card.gForce"
        case .currentStint: return "card.currentStint"
        case .pitStops:     return "card.pitStops"
        case .sector:       return "card.sector"
        case .tireLife:     return "card.tireLife"
        case .fuelLevel:    return "card.fuelLevel"
        case .weather:      return "card.weather"
        case .trackTemp:    return "card.trackTemp"
        case .consistency:  return "card.consistency"
        case .minimap:      return "card.minimap"
        case .lapHistory:   return "card.lapHistory"
        case .delta:        return "card.delta"
        }
    }

    /// Spanish fallback used only by code paths that aren't yet
    /// translation-aware. Prefer `t(card.i18nKey, lang.current)` instead.
    var displayName: String {
        t(i18nKey, .es)
    }

    var iconName: String {
        switch self {
        case .position:     return "trophy.fill"
        case .lapCount:     return "flag.checkered"
        case .lastLap:      return "clock"
        case .bestLap:      return "star.fill"
        case .gapToLeader:  return "arrow.up.to.line"
        case .gapToAhead:   return "arrow.up"
        case .speed:        return "gauge.medium"
        case .gForce:       return "gyroscope"
        case .currentStint: return "repeat"
        case .pitStops:     return "wrench.fill"
        case .sector:       return "map.fill"
        case .tireLife:     return "circle.circle"
        case .fuelLevel:    return "fuelpump.fill"
        case .weather:      return "cloud.sun.fill"
        case .trackTemp:    return "thermometer.medium"
        case .consistency:  return "chart.bar.fill"
        case .minimap:      return "map"
        case .lapHistory:   return "list.number"
        case .delta:        return "plusminus"
        }
    }

    static let defaultVisible: [String: Bool] = {
        var dict = [String: Bool]()
        for card in DriverCard.allCases {
            switch card {
            case .tireLife, .fuelLevel, .weather, .trackTemp, .minimap:
                dict[card.rawValue] = false
            default:
                dict[card.rawValue] = true
            }
        }
        return dict
    }()

    static let defaultOrder: [String] = DriverCard.allCases.map { $0.rawValue }
}
