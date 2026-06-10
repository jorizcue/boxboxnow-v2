package com.boxboxnow.app.models

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.AvTimer
import androidx.compose.material.icons.filled.ViewAgenda
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.HourglassBottom
import androidx.compose.material.icons.filled.KeyboardDoubleArrowDown
import androidx.compose.material.icons.filled.KeyboardDoubleArrowUp
import androidx.compose.material.icons.filled.Looks3
import androidx.compose.material.icons.filled.LooksOne
import androidx.compose.material.icons.filled.LooksTwo
import androidx.compose.material.icons.filled.MeetingRoom
import androidx.compose.material.icons.filled.MilitaryTech
import androidx.compose.material.icons.filled.MultilineChart
import androidx.compose.material.icons.filled.Numbers
import androidx.compose.material.icons.filled.OpenWith
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarOutline
import androidx.compose.material.icons.filled.Timelapse
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.TrendingFlat
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

enum class DriverCardGroup(val label: String) {
    // Race split into Apex (raw live-timing values) and BBN (BoxBoxNow
    // analytics) so the pilot can tell at a glance whether a card
    // comes straight from Apex or from our own computations.
    RACE_APEX("Carrera - Apex"),
    RACE_BBN("Carrera - BBN"),
    BOX("BOX"),
    GPS("GPS"),
}

/**
 * The driver cards available in the pilot view. Order matches the BBN
 * indicator spreadsheet and is shared with the backend
 * (backend/app/services/driver_cards.py), web
 * (frontend/src/hooks/useDriverConfig.ts) and iOS (DriverCard.swift).
 */
enum class DriverCard(val key: String, val display: String, val sampleValue: String) {
    // --- Carrera - Apex (Excel order) ---
    RaceTimer("raceTimer", "Tiempo de carrera", "1:23:45"),
    StintTime("stintTime", "Tiempo de stint", "12:45"),
    BestStintLap("bestStintLap", "Mejor vuelta stint", "1:01.234"),
    LastLap("lastLap", "Ultima vuelta", "1:02.456"),
    ApexPosition("apexPosition", "Posición Apex", "P4/12"),
    TotalLaps("totalLaps", "Número de vueltas totales", "47"),
    StintLaps("stintLaps", "Número de vueltas stint", "12"),
    IntervalAhead("intervalAhead", "Intervalo kart delante", "0.968s"),
    IntervalBehind("intervalBehind", "Intervalo kart detrás", "0.973s"),
    /** Composite card: best S1 / S2 / S3 of this driver, 3 lines. */
    Sectors("sectors", "Mejores sectores", "S1 21.345"),
    BestS1("bestS1", "Mejor S1", "21.345"),
    BestS2("bestS2", "Mejor S2", "19.812"),
    BestS3("bestS3", "Mejor S3", "22.114"),

    // --- Carrera - BBN (Excel order) ---
    Position("position", "Posición (tiempos medios)", "P3/12"),
    AvgLap20("avgLap20", "Vuelta media (20v)", "1:03.120"),
    Best3("best3", "Media Mejor 3 v", "1:01.890"),
    AvgFutureStint("avgFutureStint", "Media stint futuro", "0:38:20"),
    TimeToMaxStint("timeToMaxStint", "Tiempo hasta stint máximo", "07:13"),
    LapsToMaxStint("lapsToMaxStint", "Vueltas hasta stint máximo", "5.2"),
    KartTier("kartTier", "Calificación del kart", "TIER 87"),
    TheoreticalBestLap("theoreticalBestLap", "Mejor vuelta teórica sectores", "1:01.67"),
    /** Combined view of S1/S2/S3 deltas in three lines on a single card. */
    DeltaSectors("deltaSectors", "Δ Sectores", "S1 -0.04s"),
    DeltaBestS1("deltaBestS1", "Δ Mejor S1", "+0.21s"),
    DeltaBestS2("deltaBestS2", "Δ Mejor S2", "-0.15s"),
    DeltaBestS3("deltaBestS3", "Δ Mejor S3", "+0.08s"),
    DeltaSectorsCurrent("deltaSectorsCurrent", "Δ Sectores Actual", "S1 +0.12s"),
    DeltaCurrentS1("deltaCurrentS1", "Δ Actual S1", "+0.18s"),
    DeltaCurrentS2("deltaCurrentS2", "Δ Actual S2", "-0.09s"),
    DeltaCurrentS3("deltaCurrentS3", "Δ Actual S3", "+0.31s"),
    RealPos("realPos", "Posición (clasif. real)", "P5/12"),
    GapAhead("gapAhead", "Gap Real Kart delante", "-1.2s"),
    GapBehind("gapBehind", "Gap Real Kart detrás", "+0.8s"),

    // --- Box (Excel order) ---
    CurrentPit("currentPit", "Pit en curso", "0:45"),
    BoxScore("boxScore", "Puntuación Box", "87"),
    PitCount("pitCount", "PITS (realizados / mínimos)", "2/4"),
    PitWindow("pitWindow", "Ventana de pit (open/closed)", "OPEN"),

    // --- GPS (Excel order). CurrentLapTime lives here because it needs
    //     a live GPS fix to be useful. ---
    DeltaBestLap("deltaBestLap", "Delta vs Best Lap (GPS)", "-0.32s"),
    GpsLapDelta("gpsLapDelta", "Delta vuelta anterior GPS", "+0.15s"),
    ProjectedLap("projectedLap", "Vuelta proyectada (GPS)", "1:01.45"),
    GForceRadar("gForceRadar", "G-Force (diana)", "G"),
    GpsGForce("gpsGForce", "G-Force (números)", "1.2G"),
    GpsSpeed("gpsSpeed", "Velocidad GPS", "94 km/h"),
    CurrentLapTime("currentLapTime", "Vuelta actual (tiempo real)", "0:42.318");

    val group: DriverCardGroup get() = when (this) {
        BoxScore, PitCount, CurrentPit, PitWindow -> DriverCardGroup.BOX
        CurrentLapTime, DeltaBestLap, GForceRadar, GpsLapDelta, ProjectedLap, GpsSpeed, GpsGForce -> DriverCardGroup.GPS
        RaceTimer, StintTime, BestStintLap, LastLap, ApexPosition, TotalLaps, StintLaps,
        IntervalAhead, IntervalBehind, Sectors, BestS1, BestS2, BestS3 -> DriverCardGroup.RACE_APEX
        else -> DriverCardGroup.RACE_BBN
    }

    val requiresGPS: Boolean get() = when (this) {
        CurrentLapTime, DeltaBestLap, GForceRadar, GpsLapDelta, ProjectedLap, GpsSpeed, GpsGForce -> true
        else -> false
    }

    val accent: Color get() = when (this) {
        RaceTimer -> Color(0xFF8E8E93)        // systemGray
        CurrentLapTime -> Color(0xFF2196F3)   // blue
        LastLap -> Color(0xFF8E8E93)          // systemGray
        DeltaBestLap -> Color(0xFF9C27B0)     // purple
        GForceRadar -> Color(0xFF8E8E93)      // systemGray
        Position -> Color(0xFF9C27B0)         // purple
        RealPos -> Color(0xFF41D238)          // accent
        GapAhead -> Color(0xFFFF453A)         // errorRed
        GapBehind -> Color(0xFF30D158)        // successGreen
        AvgLap20 -> Color(0xFF3F51B5)         // indigo
        Best3 -> Color(0xFFFF9F0A)            // warningOrange
        AvgFutureStint -> Color(0xFF00BFA5)   // teal
        BoxScore -> Color(0xFFFFCC00)         // yellow
        BestStintLap -> Color(0xFF9C27B0)     // purple
        GpsLapDelta -> Color(0xFF00BCD4)      // cyan
        ProjectedLap -> Color(0xFF00BCD4)     // cyan, same as GpsLapDelta
        GpsSpeed -> Color(0xFF2196F3)         // blue
        GpsGForce -> Color(0xFF34C759)        // emerald
        LapsToMaxStint -> Color(0xFF00BFA5)   // teal
        PitWindow -> Color(0xFF30D158)        // successGreen
        PitCount -> Color(0xFFFF9F0A)         // warningOrange
        CurrentPit -> Color(0xFF00BCD4)       // cyan
        DeltaBestS1, DeltaBestS2, DeltaBestS3 -> Color(0xFFFFCC00)  // yellow
        DeltaSectors -> Color(0xFFFFCC00)     // yellow
        DeltaCurrentS1, DeltaCurrentS2, DeltaCurrentS3 -> Color(0xFFFFCC00)
        DeltaSectorsCurrent -> Color(0xFFFFCC00)
        TheoreticalBestLap -> Color(0xFFFF4081) // pink
        IntervalAhead -> Color(0xFFFF453A)    // red, mirrors GapAhead
        IntervalBehind -> Color(0xFF30D158)   // green, mirrors GapBehind
        ApexPosition -> Color(0xFF9C27B0)     // purple
        // 2026-05 additions
        StintTime -> Color(0xFF8E8E93)        // gray
        TotalLaps -> Color(0xFF8E8E93)
        StintLaps -> Color(0xFF8E8E93)
        Sectors -> Color(0xFF9C27B0)          // purple
        BestS1, BestS2, BestS3 -> Color(0xFF9C27B0)
        TimeToMaxStint -> Color(0xFFFF9F0A)   // warningOrange
        KartTier -> Color(0xFF41D238)         // accent
    }

    val iconMaterial: ImageVector get() = when (this) {
        RaceTimer -> Icons.Filled.Timer
        CurrentLapTime -> Icons.Filled.AvTimer
        LastLap -> Icons.Filled.Timelapse
        DeltaBestLap -> Icons.Filled.CompareArrows
        GForceRadar -> Icons.Filled.GpsFixed
        Position -> Icons.Filled.EmojiEvents
        RealPos -> Icons.Outlined.EmojiEvents
        GapAhead -> Icons.Filled.ArrowUpward
        GapBehind -> Icons.Filled.ArrowDownward
        AvgLap20 -> Icons.Filled.MultilineChart
        Best3 -> Icons.Filled.Star
        AvgFutureStint -> Icons.Filled.ShowChart
        BoxScore -> Icons.Filled.Speed
        BestStintLap -> Icons.Filled.StarOutline
        GpsLapDelta -> Icons.Filled.TrendingFlat
        ProjectedLap -> Icons.Filled.TrendingFlat
        GpsSpeed -> Icons.Filled.Speed
        GpsGForce -> Icons.Filled.OpenWith
        LapsToMaxStint -> Icons.Filled.Refresh
        PitWindow -> Icons.Filled.MeetingRoom
        PitCount -> Icons.Filled.LooksOne
        CurrentPit -> Icons.Filled.AvTimer
        DeltaBestS1 -> Icons.Filled.LooksOne
        DeltaBestS2 -> Icons.Filled.LooksTwo
        DeltaBestS3 -> Icons.Filled.Looks3
        TheoreticalBestLap -> Icons.Filled.AutoAwesome
        IntervalAhead -> Icons.Filled.KeyboardDoubleArrowUp
        IntervalBehind -> Icons.Filled.KeyboardDoubleArrowDown
        ApexPosition -> Icons.Filled.FormatListNumbered
        DeltaSectors -> Icons.Filled.ViewAgenda
        DeltaCurrentS1 -> Icons.Filled.LooksOne
        DeltaCurrentS2 -> Icons.Filled.LooksTwo
        DeltaCurrentS3 -> Icons.Filled.Looks3
        DeltaSectorsCurrent -> Icons.Filled.ViewAgenda
        // 2026-05 additions
        StintTime -> Icons.Filled.AvTimer
        TotalLaps -> Icons.Filled.Numbers
        StintLaps -> Icons.Filled.Refresh
        Sectors -> Icons.Filled.ViewAgenda
        BestS1 -> Icons.Filled.LooksOne
        BestS2 -> Icons.Filled.LooksTwo
        BestS3 -> Icons.Filled.Looks3
        TimeToMaxStint -> Icons.Filled.HourglassBottom
        KartTier -> Icons.Filled.MilitaryTech
    }

    /** i18n catalog key for the card's user-visible label. Matches the
     *  web (`card.<id>`) and iOS so the three platforms share one set of
     *  translations. Render with `t(card.labelKey)` inside a Composable;
     *  `display` stays as the Spanish fallback for non-Composable code. */
    val labelKey: String get() = "card.$key"

    companion object {
        fun fromKey(key: String): DriverCard? = entries.firstOrNull { it.key == key }

        /** Cards visible by default; GPS-only cards off. */
        val defaultVisible: Map<String, Boolean> =
            entries.associate { it.key to !it.requiresGPS }

        /** Cards in catalog (Excel) order, grouped by category. Used for
         *  rendering the config checkboxes and as the default card order
         *  for new presets. Order matches the BBN indicator spreadsheet
         *  — NOT alphabetical by localized label, so the picker stays
         *  consistent across languages and aligned with the landing's
         *  comparison table. */
        val byGroupAndCatalogOrder: List<DriverCard> = buildList {
            for (group in DriverCardGroup.entries) {
                addAll(entries.filter { it.group == group })
            }
        }

        val defaultOrder: List<String> = byGroupAndCatalogOrder.map { it.key }
    }
}
