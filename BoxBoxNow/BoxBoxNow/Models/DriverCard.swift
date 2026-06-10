import Foundation
import SwiftUI

enum DriverCardGroup: String, CaseIterable {
    // Race split into Apex (raw live-timing values) and BBN (BoxBoxNow
    // analytics) so the pilot can tell at a glance whether a card
    // comes straight from Apex or from our own computations. Card
    // `rawValue`s are unchanged — only the group classification and
    // a few display labels were tweaked to match the spec.
    case raceApex
    case raceBbn
    case box
    case gps

    var label: String {
        switch self {
        case .raceApex: return "Carrera - Apex"
        case .raceBbn:  return "Carrera - BBN"
        case .box:      return "BOX"
        case .gps:      return "GPS"
        }
    }
}

enum DriverCard: String, CaseIterable, Codable, Identifiable {
    // Carrera - Apex (raw Apex live timing). Order matches the BBN
    // indicator spreadsheet (App móvil · Tarjetas Carrera · Timing).
    case raceTimer
    case stintTime
    case bestStintLap
    case lastLap
    case apexPosition    // Raw Apex live timing position (e.g. "4/7")
    case totalLaps
    case stintLaps
    case intervalAhead   // Apex interval to kart in front (myKart.interval)
    case intervalBehind  // Apex interval reported by the kart behind me
    /// Composite card: best S1 / S2 / S3 of this driver combined into
    /// one card, 3 lines. Distinct from `deltaSectors` (vs field-best).
    case sectors
    case bestS1
    case bestS2
    case bestS3

    // Carrera - BBN (BoxBoxNow-derived analytics). Order matches the
    // BBN indicator spreadsheet (App móvil · Tarjetas Carrera · BBN).
    case position
    case avgLap20
    case best3
    case avgFutureStint
    case timeToMaxStint
    case lapsToMaxStint
    case kartTier
    case theoreticalBestLap
    // Sector delta cards. Auto-hide via `requiresSectors` when the
    // active session doesn't expose sectors.
    /// Combined view of S1/S2/S3 deltas in three lines on a single
    /// card — same colored-by-sign math as `deltaBestS1/2/3` but
    /// without the leader's kart number / team / driver. Saves grid
    /// real estate when the pilot wants the three-sector summary at
    /// a glance.
    case deltaSectors
    case deltaBestS1
    case deltaBestS2
    case deltaBestS3
    /// Combined view of S1/S2/S3 current-pass deltas in three lines,
    /// mirroring `deltaSectors` but reading `sectorMetaCurrent`.
    case deltaSectorsCurrent
    // Current-pass sector cards — compare the pilot's latest sector
    // against the fastest *live pass* among on-track karts
    // (sectorMetaCurrent). Purely additive; existing "Δ Mejor" cards
    // are unchanged.
    case deltaCurrentS1
    case deltaCurrentS2
    case deltaCurrentS3
    case realPos
    case gapAhead
    case gapBehind

    // Box (Excel order)
    case currentPit
    case boxScore
    case pitCount
    case pitWindow

    // GPS (Excel order). `currentLapTime` lives here because it needs a
    // GPS fix to be useful (without GPS we don't know "where in the lap"
    // the kart is).
    case deltaBestLap
    case gpsLapDelta
    case projectedLap
    case gForceRadar
    case gpsGForce
    case gpsSpeed
    case currentLapTime

    var id: String { rawValue }

    var group: DriverCardGroup {
        switch self {
        case .boxScore, .pitCount, .currentPit, .pitWindow:
            return .box
        case .currentLapTime, .deltaBestLap, .projectedLap, .gForceRadar, .gpsLapDelta, .gpsSpeed, .gpsGForce:
            // GPS group. `currentLapTime` lives here because it needs a
            // GPS fix to be useful.
            return .gps
        // Carrera - Apex: raw Apex live-timing values, no client-side
        // recomputation, mirrors what the pilot would see on Apex's
        // own live timing screen.
        case .raceTimer, .stintTime, .bestStintLap, .lastLap, .apexPosition,
             .totalLaps, .stintLaps, .intervalAhead, .intervalBehind,
             .sectors, .bestS1, .bestS2, .bestS3:
            return .raceApex
        default:
            // Carrera - BBN: BoxBoxNow-derived analytics (avg pace,
            // adjusted classification, sector deltas, future-stint
            // estimates, etc.).
            return .raceBbn
        }
    }

    /// i18n catalog key for this card's label — `card.<rawValue>`,
    /// the exact key set shared with web (lib/i18n.ts) and Android
    /// (Translations.kt / DriverCard.labelKey).
    var labelKey: String { "card.\(rawValue)" }

    /// Localized label. Routes through `t(_:)` so every existing call
    /// site (`card.displayName` in the grid header, config screens,
    /// accessibility) follows the active language with no further
    /// changes. `t()` falls back to the Spanish catalog entry, then to
    /// the key itself, so a missing translation never crashes the view.
    var displayName: String { t(labelKey) }

    var iconName: String {
        switch self {
        case .raceTimer:      return "timer"
        case .currentLapTime: return "stopwatch"
        case .lastLap:        return "clock"
        case .deltaBestLap:   return "plusminus"
        case .projectedLap:   return "flag.checkered"
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
        case .intervalAhead:  return "chevron.up.2"
        case .intervalBehind: return "chevron.down.2"
        case .apexPosition:   return "list.number"
        case .deltaSectors:   return "square.stack.3d.up.fill"
        case .deltaCurrentS1: return "1.circle.fill"
        case .deltaCurrentS2: return "2.circle.fill"
        case .deltaCurrentS3: return "3.circle.fill"
        case .deltaSectorsCurrent: return "square.stack.3d.up.fill"
        // 2026-05 additions
        case .stintTime:        return "stopwatch.fill"
        case .totalLaps:        return "number"
        case .stintLaps:        return "repeat.circle"
        case .sectors:          return "rectangle.3.group"
        case .bestS1:           return "1.square.fill"
        case .bestS2:           return "2.square.fill"
        case .bestS3:           return "3.square.fill"
        case .timeToMaxStint:   return "hourglass"
        case .kartTier:         return "rosette"
        }
    }

    /// Whether this card requires GPS (RaceBox or phone) data.
    /// `deltaBestLap` falls back to server-based delta (last - best) when
    /// GPS isn't available, so it's not strictly GPS-required anymore.
    var requiresGPS: Bool {
        switch self {
        case .currentLapTime, .projectedLap, .gForceRadar, .gpsLapDelta, .gpsSpeed, .gpsGForce:
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
        case .deltaBestS1, .deltaBestS2, .deltaBestS3, .theoreticalBestLap, .deltaSectors,
             .deltaCurrentS1, .deltaCurrentS2, .deltaCurrentS3, .deltaSectorsCurrent,
             // Best-sector cards (single + composite) — only meaningful on
             // circuits whose Apex grid declares `s1|s2|s3` columns.
             .sectors, .bestS1, .bestS2, .bestS3:
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
        case .projectedLap:   return "1:01.45"
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
        case .intervalAhead:  return "0.968s"
        case .intervalBehind: return "0.973s"
        case .apexPosition:   return "P4/12"
        case .deltaSectors:   return "S1 -0.04s"
        case .deltaCurrentS1: return "+0.18s"
        case .deltaCurrentS2: return "-0.09s"
        case .deltaCurrentS3: return "+0.31s"
        case .deltaSectorsCurrent: return "S1 +0.12s"
        // 2026-05 additions
        case .stintTime:        return "12:45"
        case .totalLaps:        return "47"
        case .stintLaps:        return "12"
        case .sectors:          return "S1 21.345"
        case .bestS1:           return "21.345"
        case .bestS2:           return "19.812"
        case .bestS3:           return "22.114"
        case .timeToMaxStint:   return "07:13"
        case .kartTier:         return "TIER 87"
        }
    }

    /// Accent color for each card (matching web CARD_ACCENTS)
    var accentColor: Color {
        switch self {
        case .raceTimer:      return .gray
        case .currentLapTime: return .blue
        case .lastLap:        return .gray
        case .deltaBestLap:   return .purple
        case .projectedLap:   return .cyan
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
        case .intervalAhead:   return .red    // matches gapAhead semantics
        case .intervalBehind:  return .green  // matches gapBehind semantics
        case .apexPosition:    return .purple // distinct from "position" (.purple) and "realPos" (.accentColor)
        case .deltaSectors:    return .yellow // same family as deltaBestS1/2/3
        case .deltaCurrentS1, .deltaCurrentS2, .deltaCurrentS3: return .yellow
        case .deltaSectorsCurrent: return .yellow
        // 2026-05 additions
        case .stintTime:        return .gray
        case .totalLaps:        return .gray
        case .stintLaps:        return .gray
        case .sectors:          return .purple
        case .bestS1, .bestS2, .bestS3: return .purple
        case .timeToMaxStint:   return .orange
        case .kartTier:         return .accentColor
        }
    }

    static let defaultVisible: [String: Bool] = {
        var dict = [String: Bool]()
        for card in DriverCard.allCases {
            // GPS cards stay off by default (require RaceBox or phone GPS).
            // Sector cards default to ON: they self-handle "no sector data"
            // by showing "--" on circuits without S1/S2/S3 columns, so the
            // pilot doesn't have to know whether the active circuit
            // exposes them — the cards just light up where it matters.
            dict[card.rawValue] = !card.requiresGPS
        }
        return dict
    }()

    static let defaultOrder: [String] = DriverCard.allCases.map { $0.rawValue }
}
