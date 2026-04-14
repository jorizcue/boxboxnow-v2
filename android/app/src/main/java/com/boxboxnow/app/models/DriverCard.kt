package com.boxboxnow.app.models

import androidx.compose.ui.graphics.Color

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
    CurrentPit("currentPit", "Pit en curso", "0:45");

    val group: DriverCardGroup get() = when (this) {
        BoxScore, PitCount, CurrentPit, PitWindow -> DriverCardGroup.BOX
        DeltaBestLap, GForceRadar, GpsLapDelta, GpsSpeed, GpsGForce -> DriverCardGroup.GPS
        else -> DriverCardGroup.RACE
    }

    val requiresGPS: Boolean get() = when (this) {
        CurrentLapTime, DeltaBestLap, GForceRadar, GpsLapDelta, GpsSpeed, GpsGForce -> true
        else -> false
    }

    val accent: Color get() = when (this) {
        RaceTimer -> Color.Gray
        CurrentLapTime -> Color(0xFF2196F3)
        LastLap -> Color.Gray
        DeltaBestLap -> Color(0xFF9C27B0)
        GForceRadar -> Color.Gray
        Position -> Color(0xFF9C27B0)
        RealPos -> Color(0xFFFF9800)
        GapAhead -> Color(0xFFF44336)
        GapBehind -> Color(0xFF4CAF50)
        AvgLap20 -> Color(0xFF3F51B5)
        Best3 -> Color(0xFFFF9800)
        AvgFutureStint -> Color(0xFF009688)
        BoxScore -> Color(0xFFFFEB3B)
        BestStintLap -> Color(0xFF9C27B0)
        GpsLapDelta -> Color(0xFF00BCD4)
        GpsSpeed -> Color(0xFF2196F3)
        GpsGForce -> Color(0xFF4CAF50)
        LapsToMaxStint -> Color(0xFF009688)
        PitWindow -> Color(0xFF4CAF50)
        PitCount -> Color(0xFFFF9800)
        CurrentPit -> Color(0xFF00BCD4)
    }

    companion object {
        fun fromKey(key: String): DriverCard? = entries.firstOrNull { it.key == key }

        /** Cards visible by default; GPS-only cards off. */
        val defaultVisible: Map<String, Boolean> =
            entries.associate { it.key to !it.requiresGPS }

        val defaultOrder: List<String> = entries.map { it.key }
    }
}
