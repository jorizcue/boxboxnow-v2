package com.boxboxnow.app.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ───────────────────────── User / Auth ─────────────────────────

@Serializable
data class User(
    val id: Int,
    val username: String,
    val email: String? = null,
    @SerialName("is_admin") val isAdmin: Boolean = false,
    @SerialName("mfa_enabled") val mfaEnabled: Boolean? = null,
    @SerialName("mfa_required") val mfaRequired: Boolean? = null,
    @SerialName("tab_access") val tabAccess: List<String>? = null,
    @SerialName("has_active_subscription") val hasActiveSubscription: Boolean? = null,
    @SerialName("subscription_plan") val subscriptionPlan: String? = null,
) {
    val displayName: String get() = username
}

@Serializable
data class AuthResponse(
    @SerialName("access_token") val accessToken: String = "",
    @SerialName("token_type") val tokenType: String? = null,
    @SerialName("session_token") val sessionToken: String? = null,
    val user: User? = null,
    // MFA branch — when mfa_required=true the backend returns a short-lived
    // temp_token that the client uses to call /auth/verify-mfa.
    @SerialName("mfa_required") val mfaRequired: Boolean? = null,
    @SerialName("temp_token") val tempToken: String? = null,
)

@Serializable
data class DriverConfigPreset(
    val id: Int,
    val name: String,
    @SerialName("visible_cards") val visibleCards: Map<String, Boolean>,
    @SerialName("card_order") val cardOrder: List<String>,
    @SerialName("is_default") val isDefault: Boolean = false,
    val contrast: Double? = null,
    val orientation: String? = null,
    @SerialName("audio_enabled") val audioEnabled: Boolean? = null,
)

@Serializable
data class DriverPreferences(
    @SerialName("visible_cards") val visibleCards: Map<String, Boolean>,
    @SerialName("card_order") val cardOrder: List<String>,
)

// ───────────────────────── Race / Config ─────────────────────────

@Serializable
data class RaceSession(
    val id: Int? = null,
    @SerialName("circuit_id") val circuitId: Int? = null,
    @SerialName("circuit_name") val circuitName: String? = null,
    val name: String? = null,
    @SerialName("duration_min") val durationMin: Int = 60,
    @SerialName("min_stint_min") val minStintMin: Int = 5,
    @SerialName("max_stint_min") val maxStintMin: Int = 35,
    @SerialName("min_pits") val minPits: Int = 2,
    @SerialName("pit_time_s") val pitTimeS: Int = 180,
    @SerialName("min_driver_time_min") val minDriverTimeMin: Int = 60,
    val rain: Boolean = false,
    @SerialName("pit_closed_start_min") val pitClosedStartMin: Int = 5,
    @SerialName("pit_closed_end_min") val pitClosedEndMin: Int = 5,
    @SerialName("box_lines") val boxLines: Int = 1,
    @SerialName("box_karts") val boxKarts: Int = 1,
    @SerialName("our_kart_number") val ourKartNumber: Int = 0,
    @SerialName("refresh_interval_s") val refreshIntervalS: Int = 3,
    @SerialName("is_active") val isActive: Boolean = false,
    @SerialName("auto_load_teams") val autoLoadTeams: Boolean = false,
) {
    companion object {
        val EMPTY = RaceSession()
    }
}

@Serializable
data class Circuit(
    val id: Int,
    val name: String,
    @SerialName("length_m") val lengthM: Int? = null,
    // GPS finish-line reference points set by the admin (two points defining
    // a segment the pilot crosses to complete a lap). All four must be
    // non-null for the line to be usable; the mobile driver view wires
    // these into LapTracker.setFinishLine on load / refresh.
    // Backend's CircuitOut serializes these without an underscore between
    // "lat"/"lon" and the index (finish_lat1, not finish_lat_1). The old
    // names never matched the JSON, so finishLat1/Lon1/Lat2/Lon2 were always
    // null — applyCircuitFinishLine() then silently skipped, leaving the
    // LapTracker with no finish line and no lap detection.
    @SerialName("finish_lat1") val finishLat1: Double? = null,
    @SerialName("finish_lon1") val finishLon1: Double? = null,
    @SerialName("finish_lat2") val finishLat2: Double? = null,
    @SerialName("finish_lon2") val finishLon2: Double? = null,
    // Per-circuit: number of warm-up laps excluded from the rolling 20-lap
    // average (cold tyres are not representative of real pace). Default 3.
    @SerialName("warmup_laps_to_skip") val warmupLapsToSkip: Int? = null,
)

// ───────────────────────── Kart State ─────────────────────────

@Serializable
data class KartState(
    val rowId: String? = null,
    val kartNumber: Int = 0,
    val position: Int = 0,
    val totalLaps: Int = 0,
    val lastLapMs: Double? = null,
    val bestLapMs: Double? = null,
    val avgLapMs: Double? = null,
    val bestAvgMs: Double? = null,
    val bestStintLapMs: Double? = null,
    val gap: String? = null,
    val interval: String? = null,
    val pitCount: Int = 0,
    val pitStatus: String? = null,
    val stintLapsCount: Int? = null,
    val stintDurationS: Double? = null,
    val stintElapsedMs: Double? = null,
    val stintStartCountdownMs: Double? = null,
    val stintStartTime: Double? = null,
    val pitInCountdownMs: Double? = null,
    val tierScore: Double? = null,
    val driverName: String? = null,
    val teamName: String? = null,
    val driverDifferentialMs: Double? = null,
    // Sector times — only populated on circuits whose Apex grid declares
    // `s1|s2|s3` data-type columns (Campillos, etc.). The "1/2/3" in the
    // field names is the SECTOR index, not the column index — backend
    // resolves the cN→sector mapping per-circuit from the live grid
    // header. `currentSnMs` is the latest sector pass for this kart
    // (drives the live "Δ vs field-best" indicator). `bestSnMs` is the
    // kart's session-long PB per sector, used for the theoretical-best-
    // lap card.
    val currentS1Ms: Double? = null,
    val currentS2Ms: Double? = null,
    val currentS3Ms: Double? = null,
    val bestS1Ms: Double? = null,
    val bestS2Ms: Double? = null,
    val bestS3Ms: Double? = null,
) {
    val id: String get() = rowId ?: kartNumber.toString()
    val isInPit: Boolean get() = pitStatus == "in_pit"
    val boxScore: Int? get() = tierScore?.toInt()

    val gapAheadMs: Double? get() =
        gap?.replace("s", "")?.trim()?.toDoubleOrNull()?.let { it * 1000 }

    val gapBehindMs: Double? get() =
        interval?.replace("s", "")?.trim()?.toDoubleOrNull()?.let { it * 1000 }
}

/**
 * Field-wide leader for one sector. Sent by the backend inside
 * `sectorMeta` on snapshot/analytics frames + on update messages whose
 * batch contains a sector event. The `bestMs` is from the kart's
 * session-long PB for that sector — not the latest pass — so the
 * indicator stays stable while the kart laps. `secondBestMs` is the
 * runner-up's session-long PB, used only when the local pilot IS the
 * field-best holder so the driver-view card can display their margin
 * over the chaser instead of always 0.00s.
 */
@Serializable
data class SectorBest(
    val bestMs: Double,
    val kartNumber: Int,
    val driverName: String? = null,
    val teamName: String? = null,
    val secondBestMs: Double? = null,
)

/**
 * Field-wide sector leaders. Each `sN` is optional because a sector
 * may not have any registered times yet (very first minute of the
 * session). The whole `SectorMeta` is `null` on circuits without
 * sector telemetry — clients gate the sector-related driver cards
 * on the parallel `hasSectors` flag from the same payload.
 */
@Serializable
data class SectorMeta(
    val s1: SectorBest? = null,
    val s2: SectorBest? = null,
    val s3: SectorBest? = null,
) {
    fun bestFor(sectorIdx: Int): SectorBest? = when (sectorIdx) {
        1 -> s1
        2 -> s2
        3 -> s3
        else -> null
    }
}

// ───────────────────────── GPS ─────────────────────────

data class GPSSample(
    val timestamp: Double,          // seconds (uptimeMillis / 1000)
    val lat: Double,
    val lon: Double,
    val altitudeM: Double,
    val speedKmh: Double,
    val headingDeg: Double,
    var gForceX: Double,
    var gForceY: Double,
    var gForceZ: Double,
    val fixType: Int,
    val numSatellites: Int,
    val batteryPercent: Int? = null,
) {
    val speedMms: Double get() = speedKmh / 3.6 * 1000.0
}

@Serializable
data class GeoPoint(val lat: Double, val lon: Double)

@Serializable
data class FinishLine(val p1: GeoPoint, val p2: GeoPoint)

// ───────────────────────── Teams ─────────────────────────

@Serializable
data class TeamDriver(
    @SerialName("driver_name") val driverName: String = "",
    @SerialName("differential_ms") val differentialMs: Int = 0,
)

@Serializable
data class Team(
    val position: Int = 0,
    val kart: Int = 0,
    @SerialName("team_name") val teamName: String = "",
    val drivers: List<TeamDriver> = emptyList(),
)

@Serializable
data class LiveTeamsResponse(
    val teams: List<Team>,
    val hasDrivers: Boolean,
    val kartCount: Int,
)
