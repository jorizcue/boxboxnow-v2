package com.boxboxnow.app.ui.driver

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import kotlin.math.min

/**
 * Small polar plot showing current lateral/longitudinal G-force.
 * Mirrors iOS `GForceRadarView`: three rings at 0.5/1.0/1.5 G, crosshair, green dot.
 * Expects gx/gy in G units (typical range -2..+2).
 */
@Composable
fun GForceRadar(
    gx: Double,
    gy: Double,
    modifier: Modifier = Modifier,
    maxG: Double = 2.0,
) {
    val grid = Color.White.copy(alpha = 0.25f)
    Canvas(modifier = modifier) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val radius = min(size.width, size.height) / 2f - 4f

        // Rings
        for (ring in listOf(0.5, 1.0, 1.5)) {
            val r = radius * (ring / maxG).toFloat()
            drawCircle(
                color = grid,
                radius = r,
                center = center,
                style = Stroke(width = 1f),
            )
        }
        // Outer ring (the 2G boundary)
        drawCircle(
            color = grid,
            radius = radius,
            center = center,
            style = Stroke(width = 1.5f),
        )

        // Crosshair
        drawLine(
            color = grid,
            start = Offset(center.x - radius, center.y),
            end = Offset(center.x + radius, center.y),
            strokeWidth = 1f,
        )
        drawLine(
            color = grid,
            start = Offset(center.x, center.y - radius),
            end = Offset(center.x, center.y + radius),
            strokeWidth = 1f,
        )

        // Current G dot
        val dotX = center.x + (gx / maxG).toFloat() * radius
        val dotY = center.y - (gy / maxG).toFloat() * radius
        drawCircle(
            color = Color(0xFF41D238),
            radius = 6f,
            center = Offset(
                dotX.coerceIn(center.x - radius, center.x + radius),
                dotY.coerceIn(center.y - radius, center.y + radius),
            ),
        )
    }
}

/** Convenience wrapper that draws a small centered radar with a given size. */
@Composable
fun GForceRadarSized(gx: Double, gy: Double, sizeOverride: Size? = null) {
    GForceRadar(gx = gx, gy = gy, modifier = Modifier)
}
