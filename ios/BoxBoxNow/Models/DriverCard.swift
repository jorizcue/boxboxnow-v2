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

    var displayName: String {
        switch self {
        case .position:     return "Posicion"
        case .lapCount:     return "Vueltas"
        case .lastLap:      return "Ultima vuelta"
        case .bestLap:      return "Mejor vuelta"
        case .gapToLeader:  return "Gap al lider"
        case .gapToAhead:   return "Gap al de delante"
        case .speed:        return "Velocidad"
        case .gForce:       return "Fuerza G"
        case .currentStint: return "Stint actual"
        case .pitStops:     return "Paradas en box"
        case .sector:       return "Sector"
        case .tireLife:     return "Vida neumaticos"
        case .fuelLevel:    return "Combustible"
        case .weather:      return "Clima"
        case .trackTemp:    return "Temp. pista"
        case .consistency:  return "Consistencia"
        case .minimap:      return "Minimapa"
        case .lapHistory:   return "Historial vueltas"
        case .delta:        return "Delta"
        }
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
