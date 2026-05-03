import Foundation
import SwiftUI

enum DriverCardGroup: String, CaseIterable {
    case race
    case box
    case gps
    case sector

    var label: String {
        switch self {
        case .race:   return "Carrera"
        case .box:    return "BOX"
        case .gps:    return "GPS"
        case .sector: return "Sectores"
        }
    }
}

enum DriverCard: String, CaseIterable, Codable, Identifiable {
    case raceTimer
    case currentLapTime
    case lastLap
    case deltaBestLap
    case gForceRadar
    case position
    case realPos
    case gapAhead
    case gapBehind
    case avgLap20
    case best3
    case avgFutureStint
    case boxScore
    case bestStintLap
    case gpsLapDelta
    case gpsSpeed
    case gpsGForce
    case lapsToMaxStint
    case pitWindow
    case pitCount
    case currentPit
    // Sector telemetry — only meaningful on circuits whose Apex grid
    // declares `s1|s2|s3` columns. Auto-hide via `requiresSectors` when
    // the active session doesn't expose sectors.
    case deltaBestS1
    case deltaBestS2
    case deltaBestS3
    case theoreticalBestLap

    var id: String { rawValue }

    var group: DriverCardGroup {
        switch self {
        case .boxScore, .pitCount, .currentPit, .pitWindow:
            return .box
        case .deltaBestLap, .gForceRadar, .gpsLapDelta, .gpsSpeed, .gpsGForce:
            return .gps
        case .deltaBestS1, .deltaBestS2, .deltaBestS3, .theoreticalBestLap:
            return .sector
        default:
            return .race
        }
    }

    var displayName: String {
        switch self {
        case .raceTimer:      return "Tiempo de carrera"
        case .currentLapTime: return "Vuelta actual (tiempo real)"
        case .lastLap:        return "Ultima vuelta"
        case .deltaBestLap:   return "Delta vs Best Lap (GPS)"
        case .gForceRadar:    return "G-Force (diana)"
        case .position:       return "Posicion (tiempos medios)"
        case .realPos:        return "Posicion (clasif. real)"
        case .gapAhead:       return "Gap kart delante"
        case .gapBehind:      return "Gap kart detras"
        case .avgLap20:       return "Vuelta media (20v)"
        case .best3:          return "Mejor 3 (3V)"
        case .avgFutureStint: return "Media stint futuro"
        case .boxScore:       return "Puntuacion Box"
        case .bestStintLap:   return "Mejor vuelta stint"
        case .gpsLapDelta:    return "Delta vuelta anterior GPS"
        case .gpsSpeed:       return "Velocidad GPS"
        case .gpsGForce:      return "G-Force (numeros)"
        case .lapsToMaxStint: return "Vueltas hasta stint maximo"
        case .pitWindow:      return "Ventana de pit (open/closed)"
        case .pitCount:       return "PITS (realizados / minimos)"
        case .currentPit:     return "Pit en curso"
        case .deltaBestS1:    return "Δ Mejor S1"
        case .deltaBestS2:    return "Δ Mejor S2"
        case .deltaBestS3:    return "Δ Mejor S3"
        case .theoreticalBestLap: return "Vuelta teorica"
        }
    }

    var iconName: String {
        switch self {
        case .raceTimer:      return "timer"
        case .currentLapTime: return "stopwatch"
        case .lastLap:        return "clock"
        case .deltaBestLap:   return "plusminus"
        case .gForceRadar:    return "gyroscope"
        case .position:       return "trophy.fill"
        case .realPos:        return "trophy"
        case .gapAhead:       return "arrow.up"
        case .gapBehind:      return "arrow.down"
        case .avgLap20:       return "chart.line.uptrend.xyaxis"
        case .best3:          return "star.fill"
        case .avgFutureStint: return "clock.arrow.circlepath"
        case .boxScore:       return "gauge.medium"
        case .bestStintLap:   return "star"
        case .gpsLapDelta:    return "arrow.left.arrow.right"
        case .gpsSpeed:       return "gauge.open.with.lines.needle.33percent.and.arrowtriangle"
        case .gpsGForce:      return "move.3d"
        case .lapsToMaxStint: return "repeat"
        case .pitWindow:      return "door.left.hand.open"
        case .pitCount:       return "number.circle"
        case .currentPit:     return "stopwatch.fill"
        case .deltaBestS1:    return "1.circle.fill"
        case .deltaBestS2:    return "2.circle.fill"
        case .deltaBestS3:    return "3.circle.fill"
        case .theoreticalBestLap: return "wand.and.stars"
        }
    }

    /// Whether this card requires GPS (RaceBox or phone) data.
    /// `deltaBestLap` falls back to server-based delta (last - best) when
    /// GPS isn't available, so it's not strictly GPS-required anymore.
    var requiresGPS: Bool {
        switch self {
        case .currentLapTime, .gForceRadar, .gpsLapDelta, .gpsSpeed, .gpsGForce:
            return true
        default:
            return false
        }
    }

    /// Whether this card requires the active session to expose sector
    /// telemetry (Apex grid must declare `s1|s2|s3` data-type columns).
    /// On circuits without sectors, the sector cards still appear in
    /// the config picker but show "--" in place of values.
    var requiresSectors: Bool {
        switch self {
        case .deltaBestS1, .deltaBestS2, .deltaBestS3, .theoreticalBestLap:
            return true
        default:
            return false
        }
    }

    /// Sample value shown in card order preview
    var sampleValue: String {
        switch self {
        case .raceTimer:      return "1:23:45"
        case .currentLapTime: return "0:42.318"
        case .lastLap:        return "1:02.456"
        case .deltaBestLap:   return "-0.32s"
        case .gForceRadar:    return "G"
        case .position:       return "P3/12"
        case .realPos:        return "P5/12"
        case .gapAhead:       return "-1.2s"
        case .gapBehind:      return "+0.8s"
        case .avgLap20:       return "1:03.120"
        case .best3:          return "1:01.890"
        case .avgFutureStint: return "0:38:20"
        case .boxScore:       return "87"
        case .bestStintLap:   return "1:01.234"
        case .gpsLapDelta:    return "+0.15s"
        case .gpsSpeed:       return "94 km/h"
        case .gpsGForce:      return "1.2G"
        case .lapsToMaxStint: return "5.2"
        case .pitWindow:      return "OPEN"
        case .pitCount:       return "2/4"
        case .currentPit:     return "0:45"
        case .deltaBestS1:    return "+0.21s"
        case .deltaBestS2:    return "-0.15s"
        case .deltaBestS3:    return "+0.08s"
        case .theoreticalBestLap: return "1:01.67"
        }
    }

    /// Accent color for each card (matching web CARD_ACCENTS)
    var accentColor: Color {
        switch self {
        case .raceTimer:      return .gray
        case .currentLapTime: return .blue
        case .lastLap:        return .gray
        case .deltaBestLap:   return .purple
        case .gForceRadar:    return .gray
        case .position:       return .purple
        case .realPos:        return .accentColor
        case .gapAhead:       return .red
        case .gapBehind:      return .green
        case .avgLap20:       return .indigo
        case .best3:          return .orange
        case .avgFutureStint: return .teal
        case .boxScore:       return .yellow
        case .bestStintLap:   return .purple
        case .gpsLapDelta:    return .cyan
        case .gpsSpeed:       return .blue
        case .gpsGForce:      return .green
        case .lapsToMaxStint: return .teal
        case .pitWindow:      return .green
        case .pitCount:       return .orange
        case .currentPit:     return .cyan
        case .deltaBestS1, .deltaBestS2, .deltaBestS3: return .yellow
        case .theoreticalBestLap: return .pink
        }
    }

    static let defaultVisible: [String: Bool] = {
        var dict = [String: Bool]()
        for card in DriverCard.allCases {
            // GPS cards and sector cards are off by default — pilots
            // opt in via the driver config view, and sector cards only
            // make sense on circuits with sector telemetry.
            dict[card.rawValue] = !card.requiresGPS && !card.requiresSectors
        }
        return dict
    }()

    static let defaultOrder: [String] = DriverCard.allCases.map { $0.rawValue }
}
