package com.boxboxnow.app.ui.driver

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.boxboxnow.app.models.DriverCard
import com.boxboxnow.app.models.GPSSample
import com.boxboxnow.app.models.KartState
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.util.Formatters
import com.boxboxnow.app.vm.RaceViewModel
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * One pilot-view card. Matches iOS `DriverCardView` visually:
 *   - tinted background (12% accent, 18% for prominent cards)
 *   - colored border
 *   - icon + label header (hidden for pitWindow)
 *   - dynamic font scaling based on card height
 *   - per-card custom content
 */
@Composable
fun DriverCardView(
    card: DriverCard,
    ourKart: KartState?,
    raceVM: RaceViewModel,
    raceClockMs: Double,
    lastLapMs: Double?,
    bestLapMs: Double?,
    deltaBestMs: Double?,
    gps: GPSSample?,
    boxScore: Int,
    cardHeight: Dp,
    modifier: Modifier = Modifier,
) {
    // Scale factor relative to the iOS base height (90dp)
    val scale: Float = min(2.0f, max(0.8f, cardHeight.value / 90f))
    val mainFont: TextUnit = (24f * scale).sp
    val bigFont: TextUnit = (32f * scale).sp
    val subFont: TextUnit = (10f * scale).sp
    val smallFont: TextUnit = (8f * scale).sp
    val labelFont: TextUnit = (9f * scale).sp

    val accent = cardAccent(card, lastLapMs, bestLapMs, deltaBestMs, ourKart, raceClockMs)
    val prominent = card == DriverCard.Position || card == DriverCard.RealPos || card == DriverCard.PitWindow
    val bgAlpha = if (prominent) 0.18f else 0.12f
    val borderAlpha = if (prominent) 0.7f else 0.5f
    val borderWidth = if (prominent) 2.dp else 1.5.dp

    Column(
        modifier = modifier
            .height(cardHeight)
            .clip(RoundedCornerShape(10.dp))
            .background(accent.copy(alpha = bgAlpha))
            .border(borderWidth, accent.copy(alpha = borderAlpha), RoundedCornerShape(10.dp))
            .padding((8f * scale).dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Header (label + icon) — hidden for pitWindow
        if (card != DriverCard.PitWindow) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    card.iconMaterial,
                    contentDescription = null,
                    tint = accent.copy(alpha = 0.7f),
                    modifier = Modifier.size((11f * scale).dp),
                )
                Text(
                    cardLabel(card, ourKart, raceVM, deltaBestMs),
                    color = BoxBoxNowColors.SystemGray,
                    fontSize = labelFont,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                )
            }
            Spacer(Modifier.height((2f * scale).dp))
        }

        // Content
        Box(
            modifier = Modifier.fillMaxWidth().weight(1f),
            contentAlignment = Alignment.Center,
        ) {
            CardContent(
                card = card,
                ourKart = ourKart,
                raceVM = raceVM,
                raceClockMs = raceClockMs,
                lastLapMs = lastLapMs,
                bestLapMs = bestLapMs,
                deltaBestMs = deltaBestMs,
                gps = gps,
                boxScore = boxScore,
                mainFont = mainFont,
                bigFont = bigFont,
                subFont = subFont,
                smallFont = smallFont,
                scale = scale,
                accent = accent,
            )
        }
    }
}

// ─────────────────────── Label / Accent helpers ───────────────────────

private fun cardLabel(
    card: DriverCard,
    ourKart: KartState?,
    raceVM: RaceViewModel,
    deltaBestMs: Double?,
): String = when (card) {
    DriverCard.GapAhead -> {
        val ahead = raceVM.computeOurData()?.aheadKart
        if (ahead != null) "${card.display} · K${ahead.kartNumber}" else card.display
    }
    DriverCard.GapBehind -> {
        val behind = raceVM.computeOurData()?.behindKart
        if (behind != null) "${card.display} · K${behind.kartNumber}" else card.display
    }
    else -> card.display
}

private fun cardAccent(
    card: DriverCard,
    lastLapMs: Double?,
    bestLapMs: Double?,
    deltaBestMs: Double?,
    ourKart: KartState?,
    raceClockMs: Double,
): Color {
    val gray = BoxBoxNowColors.SystemGray
    return when (card) {
        DriverCard.RaceTimer ->
            if (raceClockMs in 1.0..600_000.0) Color(0xFFFF453A) else gray
        DriverCard.LastLap -> {
            val last = lastLapMs ?: ourKart?.lastLapMs
            val best = bestLapMs ?: ourKart?.bestLapMs
            if (last != null && best != null) {
                if (last <= best) Color(0xFF30D158) else Color(0xFFFFCC00)
            } else gray
        }
        DriverCard.DeltaBestLap ->
            if (deltaBestMs != null) {
                if (deltaBestMs < 0) Color(0xFF30D158) else Color(0xFFFF453A)
            } else Color(0xFF9C27B0)
        DriverCard.BestStintLap ->
            if ((ourKart?.bestStintLapMs ?: 0.0) > 0) Color(0xFF9C27B0) else gray
        else -> card.accent
    }
}

// ─────────────────────── Per-card content ───────────────────────

@Composable
private fun CardContent(
    card: DriverCard,
    ourKart: KartState?,
    raceVM: RaceViewModel,
    raceClockMs: Double,
    lastLapMs: Double?,
    bestLapMs: Double?,
    deltaBestMs: Double?,
    gps: GPSSample?,
    boxScore: Int,
    mainFont: TextUnit,
    bigFont: TextUnit,
    subFont: TextUnit,
    smallFont: TextUnit,
    scale: Float,
    accent: Color,
) {
    when (card) {
        DriverCard.RaceTimer -> {
            val endingSoon = raceClockMs in 1.0..600_000.0
            MonoValue(
                Formatters.msToRaceTime(raceClockMs),
                if (endingSoon) Color(0xFFFF453A) else Color.White,
                mainFont,
            )
        }
        DriverCard.CurrentLapTime -> MonoValue("--:--.---", Color.White, mainFont)
        DriverCard.LastLap -> {
            val last = ourKart?.lastLapMs
            MonoValue(
                if (last != null && last > 0) Formatters.msToLapTime(last) else "--:--.---",
                Color.White,
                mainFont,
            )
        }
        DriverCard.DeltaBestLap -> {
            if (gps == null) {
                Text("GPS --", color = BoxBoxNowColors.SystemGray4, fontSize = (16f * scale).sp, fontFamily = FontFamily.Monospace)
            } else if (deltaBestMs != null) {
                MonoValue(
                    (if (deltaBestMs < 0) "" else "+") + "%.2fs".format(deltaBestMs / 1000),
                    if (deltaBestMs < 0) Color(0xFF30D158) else Color(0xFFFF453A),
                    mainFont,
                )
            } else {
                Text("Esperando vuelta...", color = BoxBoxNowColors.SystemGray4, fontSize = (12f * scale).sp)
            }
        }
        DriverCard.GForceRadar -> {
            if (gps != null) {
                GForceRadar(gx = gps.gForceX, gy = gps.gForceY, modifier = Modifier.fillMaxSize())
            } else {
                Text("GPS --", color = BoxBoxNowColors.SystemGray4, fontSize = (16f * scale).sp)
            }
        }
        DriverCard.Position -> {
            val rp = raceVM.racePosition()
            Row(verticalAlignment = Alignment.Bottom) {
                Text(rp?.let { "P${it.pos}" } ?: "-", color = Color.White, fontSize = bigFont, fontWeight = FontWeight.Black)
                rp?.let {
                    Text("/${it.total}", color = BoxBoxNowColors.SystemGray, fontSize = (14f * scale).sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        DriverCard.RealPos -> {
            val od = raceVM.computeOurData()
            Row(verticalAlignment = Alignment.Bottom) {
                Text(od?.let { "P${it.realPosition}" } ?: "-", color = BoxBoxNowColors.Accent, fontSize = bigFont, fontWeight = FontWeight.Black)
                od?.let {
                    Text("/${it.totalKarts}", color = BoxBoxNowColors.SystemGray, fontSize = (14f * scale).sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        DriverCard.GapAhead -> {
            val od = raceVM.computeOurData()
            if (od?.aheadKart != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("-%.1fs".format(od.aheadSeconds), color = Color(0xFFFF453A), fontSize = mainFont, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace)
                    val name = od.aheadKart.teamName ?: od.aheadKart.driverName
                    if (name != null) {
                        Text(name, color = BoxBoxNowColors.SystemGray, fontSize = smallFont, maxLines = 1)
                    }
                }
            } else {
                Text("P1", color = BoxBoxNowColors.Accent, fontSize = bigFont, fontWeight = FontWeight.Black)
            }
        }
        DriverCard.GapBehind -> {
            val od = raceVM.computeOurData()
            if (od?.behindKart != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("+%.1fs".format(od.behindSeconds), color = Color(0xFF30D158), fontSize = mainFont, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace)
                    val name = od.behindKart.teamName ?: od.behindKart.driverName
                    if (name != null) {
                        Text(name, color = BoxBoxNowColors.SystemGray, fontSize = smallFont, maxLines = 1)
                    }
                }
            } else {
                Text("Ultimo", color = BoxBoxNowColors.SystemGray, fontSize = (20f * scale).sp, fontWeight = FontWeight.Black)
            }
        }
        DriverCard.AvgLap20 -> {
            val v = ourKart?.avgLapMs
            MonoValue(
                if (v != null && v > 0) Formatters.msToLapTime(v) else "--:--.---",
                Color.White, mainFont,
            )
        }
        DriverCard.Best3 -> {
            val v = ourKart?.bestLapMs
            MonoValue(
                if (v != null && v > 0) Formatters.msToLapTime(v) else "--:--.---",
                Color.White, mainFont,
            )
        }
        DriverCard.AvgFutureStint -> {
            val calc = raceVM.computeStintCalc()
            val v = calc.realMaxStintMin
            if (v != null) {
                val m = v.toInt()
                val s = ((v - m) * 60).toInt()
                MonoValue("%d:%02d".format(m, s), Color.White, mainFont)
            } else {
                MonoValue("--:--", BoxBoxNowColors.SystemGray, mainFont)
            }
        }
        DriverCard.BoxScore -> {
            Text(
                if (boxScore > 0) boxScore.toString() else "0",
                color = Color(0xFFFFCC00),
                fontSize = bigFont,
                fontWeight = FontWeight.Black,
            )
        }
        DriverCard.BestStintLap -> {
            val v = ourKart?.bestStintLapMs
            MonoValue(
                if (v != null && v > 0) Formatters.msToLapTime(v) else "--:--.---",
                Color.White, mainFont,
            )
        }
        DriverCard.GpsLapDelta -> {
            if (gps == null) {
                Text("GPS --", color = BoxBoxNowColors.SystemGray4, fontSize = (16f * scale).sp)
            } else if (deltaBestMs != null) {
                MonoValue(
                    (if (deltaBestMs < 0) "" else "+") + "%.2fs".format(deltaBestMs / 1000),
                    if (deltaBestMs < 0) Color(0xFF30D158) else Color(0xFFFF453A),
                    mainFont,
                )
            } else {
                MonoValue("--:--.---", BoxBoxNowColors.SystemGray, mainFont)
            }
        }
        DriverCard.GpsSpeed -> {
            if (gps != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("%.0f".format(gps.speedKmh), color = Color.White, fontSize = (30f * scale).sp, fontWeight = FontWeight.Black)
                    Text("KM/H", color = BoxBoxNowColors.SystemGray, fontSize = smallFont)
                }
            } else {
                Text("GPS --", color = BoxBoxNowColors.SystemGray4, fontSize = (16f * scale).sp)
            }
        }
        DriverCard.GpsGForce -> {
            if (gps != null) {
                val latG = abs(gps.gForceX)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("%.1fG".format(latG), color = Color.White, fontSize = (28f * scale).sp, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Lat: %.1f".format(gps.gForceX), color = BoxBoxNowColors.SystemGray, fontSize = smallFont, fontFamily = FontFamily.Monospace)
                        Text("Fren: %.1f".format(gps.gForceY), color = BoxBoxNowColors.SystemGray, fontSize = smallFont, fontFamily = FontFamily.Monospace)
                    }
                }
            } else {
                Text("GPS --", color = BoxBoxNowColors.SystemGray4, fontSize = (16f * scale).sp)
            }
        }
        DriverCard.LapsToMaxStint -> {
            val laps = raceVM.computeStintCalc().lapsToMax
            Text(
                laps?.let { "%.1f".format(it) } ?: "0",
                color = Color.White,
                fontSize = bigFont,
                fontWeight = FontWeight.Black,
                fontFamily = FontFamily.Monospace,
            )
        }
        DriverCard.PitCount -> {
            val done = ourKart?.pitCount ?: 0
            val min = raceVM.minPits.value
            val missing = max(0, min - done)
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        "$done",
                        color = if (missing == 0) Color(0xFF30D158) else Color.White,
                        fontSize = bigFont,
                        fontWeight = FontWeight.Black,
                    )
                    Text("/$min", color = BoxBoxNowColors.SystemGray, fontSize = (14f * scale).sp, fontWeight = FontWeight.SemiBold)
                }
                if (missing > 0) {
                    Text("Faltan $missing", color = Color(0xFFFF9F0A), fontSize = smallFont, fontWeight = FontWeight.Bold)
                }
            }
        }
        DriverCard.CurrentPit -> {
            val inPit = ourKart?.pitStatus == "in_pit"
            if (inPit && ourKart != null) {
                MonoValue("--", Color(0xFF00BCD4), mainFont)
            } else {
                MonoValue("--", BoxBoxNowColors.SystemGray4, mainFont)
            }
        }
        DriverCard.PitWindow -> {
            Text(
                "--",
                color = BoxBoxNowColors.SystemGray,
                fontSize = mainFont,
                fontWeight = FontWeight.Black,
            )
        }
    }
}

@Composable
private fun MonoValue(text: String, color: Color, size: TextUnit) {
    Text(
        text,
        color = color,
        fontSize = size,
        fontWeight = FontWeight.Black,
        fontFamily = FontFamily.Monospace,
        maxLines = 1,
    )
}
