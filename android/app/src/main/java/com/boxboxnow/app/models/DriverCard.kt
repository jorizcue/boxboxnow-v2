package com.boxboxnow.app.models

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.AvTimer
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.KeyboardDoubleArrowDown
import androidx.compose.material.icons.filled.KeyboardDoubleArrowUp
import androidx.compose.material.icons.filled.Looks3
import androidx.compose.material.icons.filled.LooksOne
import androidx.compose.material.icons.filled.LooksTwo
import androidx.compose.material.icons.filled.MeetingRoom
import androidx.compose.material.icons.filled.MultilineChart
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
    RACE("Carrera"),
    BOX("BOX"),
    GPS("GPS"),
}

/**
 * The 21 driver cards available in the pilot view. Matches iOS DriverCard enum
 * rawValue order and string names so presets from web/iOS map directly.
 */
enum class DriverCard(val key: String, val display: String, val sampleValue: String) {
    RaceTimer("raceTimer", "Tiempo de carrera", "1:23:45"),
    CurrentLapTime("currentLapTime", "Vuelta actual (tiempo real)", "0:42.318"),
    LastLap("lastLap", "Ultima vuelta", "1:02.456"),
    DeltaBestLap("deltaBestLap", "Delta vs Best Lap (GPS)", "-0.32s"),
    GForceRadar("gForceRadar", "G-Force (diana)", "G"),
    Position("position", "Posicion (tiempos medios)", "P3/12"),
    RealPos("realPos", "Posicion (clasif. real)", "P5/12"),
    GapAhead("gapAhead", "Gap kart delante", "-1.2s"),
    GapBehind("gapBehind", "Gap kart detras", "+0.8s"),
    AvgLap20("avgLap20", "Vuelta media (20v)", "1:03.120"),
    Best3("best3", "Mejor 3 (3V)", "1:01.890"),
    AvgFutureStint("avgFutureStint", "Media stint futuro", "0:38:20"),
    BoxScore("boxScore", "Puntuacion Box", "87"),
    BestStintLap("bestStintLap", "Mejor vuelta stint", "1:01.234"),
    GpsLapDelta("gpsLapDelta", "Delta vuelta anterior GPS", "+0.15s"),
    GpsSpeed("gpsSpeed", "Velocidad GPS", "94 km/h"),
    GpsGForce("gpsGForce", "G-Force (numeros)", "1.2G"),
    LapsToMaxStint("lapsToMaxStint", "Vueltas hasta stint maximo", "5.2"),
    PitWindow("pitWindow", "Ventana de pit (open/closed)", "OPEN"),
    PitCount("pitCount", "PITS (realizados / minimos)", "2/4"),
    CurrentPit("currentPit", "Pit en curso", "0:45"),
    // Sector telemetry — only meaningful on circuits whose Apex grid
    // declares `s1|s2|s3` columns. The cards self-handle the "no
    // sector data" state with a "--" stub, so they're safe to leave
    // visible by default. Live alongside the other race-pace cards
    // in the Carrera group, matching the iOS layout.
    DeltaBestS1("deltaBestS1", "Δ Mejor S1", "+0.21s"),
    DeltaBestS2("deltaBestS2", "Δ Mejor S2", "-0.15s"),
    DeltaBestS3("deltaBestS3", "Δ Mejor S3", "+0.08s"),
    TheoreticalBestLap("theoreticalBestLap", "Vuelta teorica", "1:01.67"),
    // Raw Apex live timing values — distinct from gapAhead/gapBehind
    // (which derive from the adjusted classification) and from Position
    // (avg-pace) / RealPos (adjusted). These surface the values straight
    // from Apex's `data-type="int"` and `data-type="rk"` columns.
    IntervalAhead("intervalAhead", "Intervalo kart delantero", "0.968s"),
    IntervalBehind("intervalBehind", "Intervalo kart trasero", "0.973s"),
    ApexPosition("apexPosition", "Posicion Apex", "P4/12");

    val group: DriverCardGroup get() = when (this) {
        BoxScore, PitCount, CurrentPit, PitWindow -> DriverCardGroup.BOX
        DeltaBestLap, GForceRadar, GpsLapDelta, GpsSpeed, GpsGForce -> DriverCardGroup.GPS
        // Sector cards live alongside other race-pace cards rather
        // than in their own group — pilots think of sector deltas as
        // race telemetry, not a separate device feature.
        else -> DriverCardGroup.RACE
    }

    val requiresGPS: Boolean get() = when (this) {
        CurrentLapTime, DeltaBestLap, GForceRadar, GpsLapDelta, GpsSpeed, GpsGForce -> true
        else -> false
    }

    val accent: Color get() = when (this) {
        RaceTimer -> Color(0xFF8E8E93)        // systemGray
        CurrentLapTime -> Color(0xFF2196F3)   // blue
        LastLap -> Color(0xFF8E8E93)          // systemGray
        DeltaBestLap -> Color(0xFF9C27B0)     // purple
        GForceRadar -> Color(0xFF8E8E93)      // systemGray
        Position -> Color(0xFF9C27B0)         // purple
        RealPos -> Color(0xFF41D238)          // accent (green radioactive)
        GapAhead -> Color(0xFFFF453A)         // errorRed
        GapBehind -> Color(0xFF30D158)        // successGreen
        AvgLap20 -> Color(0xFF3F51B5)         // indigo
        Best3 -> Color(0xFFFF9F0A)            // warningOrange
        AvgFutureStint -> Color(0xFF00BFA5)   // teal
        BoxScore -> Color(0xFFFFCC00)         // yellow
        BestStintLap -> Color(0xFF9C27B0)     // purple
        GpsLapDelta -> Color(0xFF00BCD4)      // cyan
        GpsSpeed -> Color(0xFF2196F3)         // blue
        GpsGForce -> Color(0xFF34C759)        // emerald
        LapsToMaxStint -> Color(0xFF00BFA5)   // teal
        PitWindow -> Color(0xFF30D158)        // successGreen
        PitCount -> Color(0xFFFF9F0A)         // warningOrange
        CurrentPit -> Color(0xFF00BCD4)       // cyan
        DeltaBestS1, DeltaBestS2, DeltaBestS3 -> Color(0xFFFFCC00)  // yellow
        TheoreticalBestLap -> Color(0xFFFF4081)                     // pink
        IntervalAhead -> Color(0xFFFF453A)    // red, mirrors GapAhead
        IntervalBehind -> Color(0xFF30D158)   // green, mirrors GapBehind
        ApexPosition -> Color(0xFF9C27B0)     // purple, distinct from RealPos accent
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
    }

    companion object {
        fun fromKey(key: String): DriverCard? = entries.firstOrNull { it.key == key }

        /** Cards visible by default; GPS-only cards off. */
        val defaultVisible: Map<String, Boolean> =
            entries.associate { it.key to !it.requiresGPS }

        /** Cards sorted alphabetically within each group (Carrera → BOX → GPS).
         *  Used for rendering the config checkboxes and as the default card order
         *  for new presets. */
        val sortedByGroupAndName: List<DriverCard> = buildList {
            val collator = java.text.Collator.getInstance(java.util.Locale("es"))
            for (group in DriverCardGroup.entries) {
                addAll(entries.filter { it.group == group }.sortedWith(compareBy(collator) { it.display }))
            }
        }

        val defaultOrder: List<String> = sortedByGroupAndName.map { it.key }
    }
}
