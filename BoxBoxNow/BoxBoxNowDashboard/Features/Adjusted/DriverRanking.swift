import Foundation

/// Driver-centric row model for the "Clasif. Real Beta" view.
///
/// Each kart can have multiple drivers over the course of a race; the
/// server exposes per-driver aggregates on `KartStateFull.driverAvgLapMs`
/// and `driverTotalMs`. This struct flattens one (kart, driver) tuple
/// into a single row model.
///
/// We compute the ranking client-side for Beta because the server's
/// `classification` array is kart-centric — it only surfaces the currently
/// active driver for each kart, so it can't show driver A at P1 and driver B
/// from the same kart at P7.
struct DriverRanking: Identifiable, Hashable {
    let id: String        // "\(kartNumber)-\(driverName)" — stable across re-renders
    let position: Int
    let kartNumber: Int
    let teamName: String  // empty = hide team sub-line
    let driverName: String
    let avgLapMs: Double
    let totalMs: Double
    let totalLaps: Int
}
