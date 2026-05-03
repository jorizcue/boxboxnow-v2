import Foundation

/// Field-wide leader for one sector. Sent by the backend inside
/// `sectorMeta` whenever the active session exposes sector telemetry
/// (Apex grid declares `data-type="s1|s2|s3"` columns). The "best"
/// values are from the kart's session-long PB for that sector — not
/// the latest pass — so the indicator is stable while the kart laps.
///
/// `secondBestMs` is the runner-up's session-long PB, used only when
/// the local pilot IS the field-best holder (so the driver-view card
/// can display their margin over the chaser instead of always 0.00s).
struct SectorBest: Codable, Hashable {
    var bestMs: Double
    var kartNumber: Int
    var driverName: String?
    var teamName: String?
    var secondBestMs: Double?
}

/// Field-wide sector leaders for the three sectors. Each `sN` is
/// optional because a sector may not have any registered times yet
/// (e.g. very first minute of the session). The whole `SectorMeta`
/// is `nil` on circuits without sector telemetry.
struct SectorMeta: Codable, Hashable {
    var s1: SectorBest?
    var s2: SectorBest?
    var s3: SectorBest?

    /// Convenience accessor by sector index (1/2/3).
    func best(for sectorIdx: Int) -> SectorBest? {
        switch sectorIdx {
        case 1: return s1
        case 2: return s2
        case 3: return s3
        default: return nil
        }
    }
}
