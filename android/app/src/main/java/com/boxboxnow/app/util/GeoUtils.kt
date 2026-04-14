package com.boxboxnow.app.util

import com.boxboxnow.app.models.GeoPoint
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

object GeoUtils {
    private const val DEG_TO_M_LAT = 111_320.0

    private fun degToMLon(lat: Double): Double = DEG_TO_M_LAT * cos(lat * PI / 180)

    fun haversineDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6_371_000.0
        val dLat = (lat2 - lat1) * PI / 180
        val dLon = (lon2 - lon1) * PI / 180
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(lat1 * PI / 180) * cos(lat2 * PI / 180) *
            sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }

    /**
     * Returns fraction `t` (0..1) along a1→a2 where it crosses b1→b2,
     * or null if they don't intersect. Matches web segmentCrossingFraction.
     */
    fun segmentCrossingFraction(a1: GeoPoint, a2: GeoPoint, b1: GeoPoint, b2: GeoPoint): Double? {
        val mLon = degToMLon((a1.lat + b1.lat) / 2)
        val ax1 = 0.0; val ay1 = 0.0
        val ax2 = (a2.lat - a1.lat) * DEG_TO_M_LAT
        val ay2 = (a2.lon - a1.lon) * mLon
        val bx1 = (b1.lat - a1.lat) * DEG_TO_M_LAT
        val by1 = (b1.lon - a1.lon) * mLon
        val bx2 = (b2.lat - a1.lat) * DEG_TO_M_LAT
        val by2 = (b2.lon - a1.lon) * mLon

        val dx = ax2 - ax1
        val dy = ay2 - ay1
        val ex = bx2 - bx1
        val ey = by2 - by1

        val denom = dx * ey - dy * ex
        if (kotlin.math.abs(denom) < 1e-10) return null

        val t = ((bx1 - ax1) * ey - (by1 - ay1) * ex) / denom
        val u = ((bx1 - ax1) * dy - (by1 - ay1) * dx) / denom

        return if (t in 0.0..1.0 && u in 0.0..1.0) t else null
    }

    fun bearingBetween(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLon = (lon2 - lon1) * PI / 180
        val la1 = lat1 * PI / 180
        val la2 = lat2 * PI / 180
        val y = sin(dLon) * cos(la2)
        val x = cos(la1) * sin(la2) - sin(la1) * cos(la2) * cos(dLon)
        val bearing = atan2(y, x) * 180 / PI
        return (bearing + 360) % 360
    }
}
