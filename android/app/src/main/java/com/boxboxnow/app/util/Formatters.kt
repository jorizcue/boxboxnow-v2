package com.boxboxnow.app.util

import androidx.compose.ui.graphics.Color

object Formatters {
    /** Convert ms to M:SS.mmm */
    fun msToLapTime(ms: Double): String {
        if (ms <= 0) return "-"
        val totalMs = ms.toInt()
        val minutes = totalMs / 60000
        val seconds = (totalMs % 60000) / 1000
        val millis = totalMs % 1000
        return if (minutes > 0) {
            "%d:%02d.%03d".format(minutes, seconds, millis)
        } else {
            "%d.%03d".format(seconds, millis)
        }
    }

    fun deltaString(ms: Double): String {
        val sign = if (ms >= 0) "+" else ""
        return "%s%.1fs".format(sign, ms / 1000.0)
    }

    fun deltaColor(ms: Double): Color = when {
        ms < -10 -> Color(0xFF00C853)
        ms > 10 -> Color(0xFFFF1744)
        else -> Color.White
    }

    fun speedString(kmh: Double): String = "%.0f".format(kmh)
    fun gForceString(g: Double): String = "%.2f".format(g)

    /** Race clock H:MM:SS */
    fun msToRaceTime(ms: Double): String {
        if (ms <= 0) return "--:--:--"
        val total = (ms / 1000).toInt()
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return "%d:%02d:%02d".format(h, m, s)
    }

    fun secondsToHMS(seconds: Int): String {
        if (seconds <= 0) return "00:00:00"
        val h = seconds / 3600
        val m = (seconds % 3600) / 60
        val s = seconds % 60
        return "%02d:%02d:%02d".format(h, m, s)
    }

    fun secondsToStint(seconds: Double): String {
        if (seconds <= 0) return "0:00"
        val min = seconds.toInt() / 60
        val sec = seconds.toInt() % 60
        return "%d:%02d".format(min, sec)
    }

    /** Tier hex color for box score (0-100) — matches web tierHex() */
    fun tierColor(score: Int): Color = when {
        score >= 100 -> Color(0xFF9FE556)
        score >= 75 -> Color(0xFFC8E946)
        score >= 50 -> Color(0xFFE5D43A)
        score >= 25 -> Color(0xFFE59A2E)
        else -> Color(0xFFE54444)
    }

    fun distanceString(m: Double): String =
        if (m >= 1000) "%.1f km".format(m / 1000) else "%.0f m".format(m)
}
