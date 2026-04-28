package com.boxboxnow.app.ui.driver

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.ui.text.style.TextOverflow
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
    val accent = cardAccent(card, lastLapMs, bestLapMs, deltaBestMs, ourKart, raceClockMs)
    val prominent = card == DriverCard.Position || card == DriverCard.RealPos || card == DriverCard.PitWindow
    val bgAlpha = if (prominent) 0.18f else 0.12f
    val borderAlpha = if (prominent) 0.7f else 0.5f
    val borderWidth = if (prominent) 2.dp else 1.5.dp

    // Read the actual card width so font scaling can be width-aware — cards
    // in 2-col portrait are much narrower than they are tall, so scaling only
    // by height would produce fonts too wide to fit (wrapping time strings).
    BoxWithConstraints(
        modifier = modifier
            .height(cardHeight)
            .clip(RoundedCornerShape(10.dp))
            .background(accent.copy(alpha = bgAlpha))
            .border(borderWidth, accent.copy(alpha = borderAlpha), RoundedCornerShape(10.dp)),
    ) {
        // Base dimensions target ~150dp wide × 90dp tall (iOS card baseline).
        // Use the more restrictive axis so the card never produces fonts that
        // overflow the shorter dimension.
        val widthScale = maxWidth.value / 150f
        val heightScale = cardHeight.value / 90f
        val scale: Float = min(1.8f, max(0.7f, min(widthScale, heightScale)))

        val mainFont: TextUnit = (22f * scale).sp
        val bigFont: TextUnit = (30f * scale).sp
        val subFont: TextUnit = (10f * scale).sp
        val smallFont: TextUnit = (8f * scale).sp
        val labelFont: TextUnit = (9f * scale).sp

        Column(
            modifier = Modifier
                .fillMaxSize()
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
        DriverCard.DeltaBestLap -> {
            if (deltaBestMs != null) {
                if (deltaBestMs < 0) Color(0xFF30D158) else Color(0xFFFF453A)
            } else {
                // Server-data fallback: stint-best (not race-best) so the
                // color reflects pace within the current stint.
                val last = ourKart?.lastLapMs
                val best = ourKart?.bestStintLapMs
                if (last != null && best != null && last > 0 && best > 0) {
                    if (last <= best) Color(0xFF30D158) else Color(0xFFFF453A)
                } else Color(0xFF9C27B0)
            }
        }
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
            // 3-tier: live GPS delta -> server stint-best fallback -> "--"
            // Server fallback uses bestStintLapMs (not bestLapMs) so the
            // delta resets after each pit exit and reflects current driver.
            val last = ourKart?.lastLapMs
            val stintBest = ourKart?.bestStintLapMs
            if (gps != null && deltaBestMs != null) {
                MonoValue(
                    (if (deltaBestMs < 0) "" else "+") + "%.2fs".format(deltaBestMs / 1000),
                    if (deltaBestMs < 0) Color(0xFF30D158) else Color(0xFFFF453A),
                    mainFont,
                )
            } else if (last != null && stintBest != null && last > 0 && stintBest > 0) {
                val delta = last - stintBest
                MonoValue(
                    (if (delta < 0) "" else "+") + "%.2fs".format(delta / 1000),
                    if (delta <= 0) Color(0xFF30D158) else Color(0xFFFF453A),
                    mainFont,
                )
            } else {
                Text("--", color = BoxBoxNowColors.SystemGray4, fontSize = mainFont, fontFamily = FontFamily.Monospace)
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
            if (inPit) {
                // pitInCountdownMs sent by backend at pitIn; elapsed = pitIn - raceClock.
                val pitInCd = ourKart?.pitInCountdownMs ?: 0.0
                val elapsed = if (pitInCd > 0 && raceClockMs > 0)
                    max(0.0, pitInCd - raceClockMs) / 1000.0
                else 0.0
                val m = elapsed.toInt() / 60
                val s = elapsed.toInt() % 60
                val pitM = raceVM.pitTimeS.value.toInt() / 60
                val pitS = raceVM.pitTimeS.value.toInt() % 60
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    // Pulsing cyan timer (matching web animate-pulse)
                    val alpha = androidx.compose.animation.core.rememberInfiniteTransition(label = "pitPulse")
                        .animateFloat(
                            initialValue = 1f,
                            targetValue = 0.4f,
                            animationSpec = androidx.compose.animation.core.infiniteRepeatable(
                                animation = androidx.compose.animation.core.tween(1000),
                                repeatMode = androidx.compose.animation.core.RepeatMode.Reverse,
                            ),
                            label = "pitAlpha",
                        )
                    Text(
                        "$m:${s.toString().padStart(2, '0')}",
                        color = Color(0xFF00BCD4).copy(alpha = alpha.value),
                        fontSize = mainFont,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 1,
                    )
                    Text(
                        "/ $pitM:${pitS.toString().padStart(2, '0')}",
                        color = BoxBoxNowColors.SystemGray,
                        fontSize = subFont,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    MonoValue("--:--", BoxBoxNowColors.SystemGray4, mainFont)
                    Text(
                        "inactivo",
                        color = BoxBoxNowColors.SystemGray4,
                        fontSize = subFont,
                        fontWeight = FontWeight.Medium,
                    )
                }
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
        softWrap = false,
        overflow = TextOverflow.Clip,
    )
}
