package com.boxboxnow.app.ui.driver

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import com.boxboxnow.app.i18n.t
import com.boxboxnow.app.models.DriverCard
import com.boxboxnow.app.models.GPSSample
import com.boxboxnow.app.models.KartState
import com.boxboxnow.app.models.SectorBest
import com.boxboxnow.app.models.SectorMeta
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
    boxScore: Double,
    hasSectors: Boolean,
    sectorMeta: SectorMeta?,
    cardHeight: Dp,
    modifier: Modifier = Modifier,
) {
    // PitWindow's accent depends on the backend's live `pitStatus.isOpen`
    // — we collect it here at the top of the composable so it flows
    // through to both the card background (in `cardAccent`) and the
    // content body. Pre-2026-05-15 the accent was a fixed
    // SuccessGreen and only the inner "CLOSED" text turned red, which
    // produced the inverted look in the user's photo: green background
    // with red text. Now closed = red bg + red text, open = green bg +
    // green text — matches iOS.
    val pitStatusForAccent = raceVM.pitStatus.collectAsState().value
    val accent = cardAccent(
        card, lastLapMs, bestLapMs, deltaBestMs, ourKart, raceClockMs,
        pitOpen = pitStatusForAccent?.isOpen,
        // Only the LapsToMaxStint card needs this; skip the (cheap but
        // pointless) stint calc for every other card.
        lapsToMax = if (card == DriverCard.LapsToMaxStint)
            raceVM.computeStintCalc(raceClockMs).lapsToMax else null,
        // Mirrors iOS cardAccentColor: AvgFutureStint card turns red
        // when out of the safe window. Only computed for that card.
        avgFutureWarn = if (card == DriverCard.AvgFutureStint)
            raceVM.computeAvgFutureStint(raceClockMs)?.warn else null,
    )
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
        // The numbers were leaving a lot of empty space inside the
        // cards. iOS uses .minimumScaleFactor to let text be large and
        // auto-shrink only if it wouldn't fit; Compose 1.7 has no
        // built-in equivalent, so the big numeric values now go through
        // `MonoValue`, which measures the string and grows it to fill
        // the card width (shrinking only to avoid clipping). That makes
        // it safe to TARGET much larger sizes here: the long strings
        // self-fit, the short ones (P3/12, 1.2G, 0:45…) stay bounded by
        // the width guard. Bases bumped 24→34 / 32→48 and the clamp
        // ceiling 2.0→2.8 so a roomy landscape card fills properly.
        val widthScale = maxWidth.value / 180f
        val heightScale = cardHeight.value / 90f
        val scale: Float = min(2.8f, max(0.8f, min(widthScale, heightScale)))

        val mainFont: TextUnit = (34f * scale).sp
        val bigFont: TextUnit = (48f * scale).sp
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
                        cardLabel(card, t(card.labelKey), ourKart, raceVM, deltaBestMs),
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
                    hasSectors = hasSectors,
                    sectorMeta = sectorMeta,
                    cardHeight = cardHeight,
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
    // Already-translated base label (resolved by the caller via
    // t(card.labelKey) so this stays a plain, non-Composable fn).
    label: String,
    ourKart: KartState?,
    raceVM: RaceViewModel,
    deltaBestMs: Double?,
): String = when (card) {
    DriverCard.GapAhead -> {
        val ahead = raceVM.computeOurData()?.aheadKart
        if (ahead != null) "$label · K${ahead.kartNumber}" else label
    }
    DriverCard.GapBehind -> {
        val behind = raceVM.computeOurData()?.behindKart
        if (behind != null) "$label · K${behind.kartNumber}" else label
    }
    DriverCard.IntervalAhead -> {
        val ahead = raceVM.apexNeighbor(-1)
        if (ahead != null) "$label · K${ahead.kartNumber}" else label
    }
    DriverCard.IntervalBehind -> {
        val behind = raceVM.apexNeighbor(1)
        if (behind != null) "$label · K${behind.kartNumber}" else label
    }
    else -> label
}

/**
 * Color for the "Vueltas hasta stint máximo" card. Shared by the card
 * accent (background / border / icon) and the big number text so the
 * two can never disagree — a faithful port of iOS
 * `cardAccentColor` + `lapsToMaxTextColor`:
 *
 *   pit window closed   → red
 *   laps ≤ 2            → red
 *   laps ≤ 5            → orange
 *   pit window open     → green
 *   otherwise           → `fallback`
 *
 * iOS uses the same conditions for both, differing only in the final
 * fallback (teal for the accent, white for the number text); we pass
 * that fallback in so the split stays identical. Android previously
 * hard-coded the teal `card.accent` for every state, which is why the
 * card stayed teal/white while iOS turned red on a closed pit.
 */
private fun lapsToMaxStintColor(pitOpen: Boolean?, laps: Double?, fallback: Color): Color {
    if (pitOpen == false) return Color(0xFFFF453A)   // red — pit closed
    if (laps != null) {
        if (laps <= 2.0) return Color(0xFFFF453A)    // red
        if (laps <= 5.0) return Color(0xFFFF9F0A)    // orange
    }
    if (pitOpen == true) return Color(0xFF30D158)    // green — pit open
    return fallback
}

private fun cardAccent(
    card: DriverCard,
    lastLapMs: Double?,
    bestLapMs: Double?,
    deltaBestMs: Double?,
    ourKart: KartState?,
    raceClockMs: Double,
    pitOpen: Boolean? = null,
    lapsToMax: Double? = null,
    avgFutureWarn: Boolean? = null,
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
        // Pit window: green when open, red when closed, gray when
        // unknown. The card's static `card.accent` is just used as a
        // fallback for the "unknown" case (initial load before the
        // first snapshot arrives).
        DriverCard.PitWindow -> when (pitOpen) {
            true  -> BoxBoxNowColors.SuccessGreen
            false -> BoxBoxNowColors.ErrorRed
            null  -> gray
        }
        // Dynamic, matching iOS: red on a closed pit / very few laps
        // left, orange when getting tight, green when the window is
        // open, teal otherwise. `card.accent` is the teal fallback.
        DriverCard.LapsToMaxStint -> lapsToMaxStintColor(pitOpen, lapsToMax, card.accent)
        // iOS cardAccentColor: warn → red, otherwise the teal
        // `card.accent`. Keeps the card's frame in sync with its value.
        DriverCard.AvgFutureStint ->
            if (avgFutureWarn == true) Color(0xFFFF453A) else card.accent
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
    boxScore: Double,
    hasSectors: Boolean,
    sectorMeta: SectorMeta?,
    cardHeight: Dp,
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
                    Text("-%.1fs".format(od.aheadSeconds), color = Color(0xFFFF453A), fontSize = mainFont, fontWeight = FontWeight.Black, style = NumericValueStyle)
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
                    Text("+%.1fs".format(od.behindSeconds), color = Color(0xFF30D158), fontSize = mainFont, fontWeight = FontWeight.Black, style = NumericValueStyle)
                    val name = od.behindKart.teamName ?: od.behindKart.driverName
                    if (name != null) {
                        Text(name, color = BoxBoxNowColors.SystemGray, fontSize = smallFont, maxLines = 1)
                    }
                }
            } else {
                Text(t("driver.cardLast"), color = BoxBoxNowColors.SystemGray, fontSize = (20f * scale).sp, fontWeight = FontWeight.Black)
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
            // Best rolling 3-lap average, NOT the single best lap.
            // `bestAvgMs` is the backend's best-3 metric (iOS reads the
            // same field as `best3Ms`). Using `bestLapMs` here was the
            // bug that made this card mirror the single best/last lap.
            val v = ourKart?.bestAvgMs
            MonoValue(
                if (v != null && v > 0) Formatters.msToLapTime(v) else "--:--.---",
                Color.White, mainFont,
            )
        }
        DriverCard.AvgFutureStint -> {
            // 1:1 with iOS: average minutes the remaining stints should
            // last (computeAvgFutureStint), NOT the maxStint-clamped
            // realMaxStintMin (which was stuck at "40:00"). Text is red
            // when out of the safe window (warn), white otherwise —
            // mirrors iOS `data.warn ? .red : .white`. Value formatted
            // M:SS from total seconds, like iOS `secondsToHMS`.
            val data = raceVM.computeAvgFutureStint(raceClockMs)
            if (data != null) {
                val totalSec = (data.avgMin * 60).toInt()
                MonoValue(
                    "%d:%02d".format(totalSec / 60, totalSec % 60),
                    if (data.warn) Color(0xFFFF453A) else Color.White,
                    mainFont,
                )
            } else {
                MonoValue("--:--", BoxBoxNowColors.SystemGray, mainFont)
            }
        }
        DriverCard.BoxScore -> {
            // 2-decimal precision to match iOS (`String(format:"%.2f")`).
            // The card used to take an Int param so the fractional part
            // of the FIFO score was silently truncated ("24" vs "24.31").
            Text(
                if (boxScore > 0) "%.2f".format(boxScore) else "0",
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
                    Text("%.1fG".format(latG), color = Color.White, fontSize = (28f * scale).sp, fontWeight = FontWeight.Black, style = NumericValueStyle)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(t("driver.cardLat", "value" to "%.1f".format(gps.gForceX)), color = BoxBoxNowColors.SystemGray, fontSize = smallFont, fontFamily = FontFamily.Monospace)
                        Text(t("driver.cardBrake", "value" to "%.1f".format(gps.gForceY)), color = BoxBoxNowColors.SystemGray, fontSize = smallFont, fontFamily = FontFamily.Monospace)
                    }
                }
            } else {
                Text("GPS --", color = BoxBoxNowColors.SystemGray4, fontSize = (16f * scale).sp)
            }
        }
        DriverCard.LapsToMaxStint -> {
            // Pass the interpolated `raceClockMs` so the value updates
            // at the same rate as the live race timer (~10 Hz from
            // `RaceViewModel.startInterpolation()`) rather than only
            // on snapshot pushes (~1 Hz). Without this argument
            // `computeStintCalc` falls back to `_raceTimerMs.value`
            // which only changes on snapshot — that's why the card
            // looked frozen on Android while the adjacent
            // `BoxScore`/timer cards refreshed normally.
            val laps = raceVM.computeStintCalc(raceClockMs).lapsToMax
            // Text follows the same state as the card accent (which is
            // already the dynamic red/orange/green/teal computed in
            // `cardAccent`). iOS keeps the number WHITE only in the
            // neutral fallback state (where the accent is teal) and
            // colors it red/orange/green otherwise — replicate that by
            // deriving from `accent` so the two never disagree.
            val lapsTextColor =
                if (accent == DriverCard.LapsToMaxStint.accent) Color.White else accent
            Text(
                laps?.let { "%.1f".format(it) } ?: "0",
                color = lapsTextColor,
                fontSize = bigFont,
                fontWeight = FontWeight.Black,
                style = NumericValueStyle,
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
                    Text(t("driver.cardFaltan", "count" to "$missing"), color = Color(0xFFFF9F0A), fontSize = smallFont, fontWeight = FontWeight.Bold)
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
                        style = NumericValueStyle,
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
                        t("driver.cardInactive"),
                        color = BoxBoxNowColors.SystemGray4,
                        fontSize = subFont,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
        DriverCard.PitWindow -> {
            // Authoritative source: backend `pitStatus.isOpen`. Same
            // verdict the web StatusBar / driver-view card use, includes
            // the driver-min-time feasibility check (see
            // `backend/app/engine/pit_gate.py`).
            //
            // When the gate is closed and the backend identifies a
            // blocker (current pilot still needs X minutes), show the
            // remaining minutes as a small subtitle — same pattern as
            // iOS DriverCardView's "pitWindowFullText + remaining".
            val ps by raceVM.pitStatus.collectAsState()
            val text: String
            val color: Color
            val cur = ps
            // Text colour matches the card accent — the background is
            // a 0.18α tint of the same colour, so using a fully-saturated
            // version of the accent for the headline keeps high contrast
            // (light-red text on pale-red bg, light-green text on pale-
            // green bg). Pre-2026-05-15 the closed state used red text
            // on a green background because the accent was fixed.
            when {
                cur == null -> { text = "--"; color = BoxBoxNowColors.SystemGray }
                cur.isOpen  -> { text = "OPEN";   color = BoxBoxNowColors.SuccessGreen }
                else        -> { text = "CLOSED"; color = BoxBoxNowColors.ErrorRed }
            }
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text,
                    color = color,
                    fontSize = mainFont,
                    fontWeight = FontWeight.Black,
                )
                // Subtitle: "Matías · 6 min" — only when CLOSED and we
                // have a remaining-time hint from the backend. Compact
                // form because the card is small.
                if (cur != null && !cur.isOpen) {
                    val rem = cur.blockingDriverRemainingMs ?: 0L
                    val remMin = if (rem > 0) ((rem + 59_999L) / 60_000L).toInt() else 0
                    if (!cur.blockingDriver.isNullOrEmpty() && remMin > 0) {
                        Text(
                            "${cur.blockingDriver} · ${remMin} min",
                            color = BoxBoxNowColors.ErrorRed.copy(alpha = 0.7f),
                            fontSize = subFont,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
        // ── Sector cards ──
        // The displayed delta carries its own sign: green-minus when
        // I'm the field leader (`myBest - secondBest` is negative —
        // I'm faster), red-plus when I'm trailing (`myCurrent -
        // fieldBest` is positive — I'm slower). The sign + color
        // pair disambiguates at a glance, so no star icon is needed.
        DriverCard.DeltaBestS1 -> SectorDeltaContent(
            sectorIdx = 1, hasSectors = hasSectors, sectorMeta = sectorMeta,
            ourKart = ourKart, raceVM = raceVM, mainFont = mainFont, bigFont = bigFont,
            smallFont = smallFont, scale = scale,
        )
        DriverCard.DeltaBestS2 -> SectorDeltaContent(
            sectorIdx = 2, hasSectors = hasSectors, sectorMeta = sectorMeta,
            ourKart = ourKart, raceVM = raceVM, mainFont = mainFont, bigFont = bigFont,
            smallFont = smallFont, scale = scale,
        )
        DriverCard.DeltaBestS3 -> SectorDeltaContent(
            sectorIdx = 3, hasSectors = hasSectors, sectorMeta = sectorMeta,
            ourKart = ourKart, raceVM = raceVM, mainFont = mainFont, bigFont = bigFont,
            smallFont = smallFont, scale = scale,
        )
        DriverCard.TheoreticalBestLap -> TheoreticalBestLapContent(
            hasSectors = hasSectors, ourKart = ourKart,
            mainFont = mainFont, smallFont = smallFont,
        )

        // ── Δ Sectores: combined S1/S2/S3 deltas in 3 lines ──
        DriverCard.DeltaSectors -> DeltaSectorsContent(
            hasSectors = hasSectors, raceVM = raceVM,
            mainFont = mainFont, cardHeight = cardHeight, scale = scale,
        )

        // ── Apex live timing: interval to kart in front ──
        // myKart.interval IS the gap to the kart in front. Empty when
        // we lead the apex order — show "LIDER" sentinel in that case
        // (per pilot feedback, "—" reads as "no data" not "leader").
        DriverCard.IntervalAhead -> {
            val leaderLabel = t("driver.cardLeader")
            val display = raceVM.formatApexInterval(ourKart?.interval, leaderSentinel = leaderLabel)
            MonoValue(
                display,
                if (display == leaderLabel) Color(0xFFFFCC00) else Color.White,
                mainFont,
            )
        }

        // ── Apex live timing: interval reported by kart behind me ──
        // The apex `interval` field for any kart measures THEIR distance
        // to the kart immediately ahead. So the kart at position+1 in
        // the apex sort has its own `.interval` equal to its gap to me
        // — exactly what the local card needs to show.
        DriverCard.IntervalBehind -> {
            val behind = raceVM.apexNeighbor(1)
            val display = if (behind == null) "—"
                else raceVM.formatApexInterval(behind.interval, leaderSentinel = "—")
            MonoValue(display, Color.White, mainFont)
        }

        // ── Apex live timing: raw position (P{n}/{total}) ──
        // Distinct from Position (avg-pace) and RealPos (adjusted
        // classification) — surfaces the value straight from Apex's
        // `data-type="rk"` column.
        DriverCard.ApexPosition -> {
            val ap = raceVM.apexPosition()
            Row(verticalAlignment = Alignment.Bottom) {
                if (ap != null) {
                    Text(
                        "P${ap.pos}",
                        color = Color.White,
                        fontSize = bigFont,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        "/${ap.total}",
                        color = BoxBoxNowColors.SystemGray,
                        fontSize = (14f * scale).sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                } else {
                    Text(
                        "—",
                        color = BoxBoxNowColors.SystemGray3,
                        fontSize = bigFont,
                        fontWeight = FontWeight.Black,
                    )
                }
            }
        }
    }
}

/** Render the "Δ Best Sn" body. Reads `kart.currentSnMs` and the
 *  field-best from `sectorMeta` (which carries the runner-up's bestMs).
 *  Three states:
 *    1. Session has no sectors / no kart yet / no field-best → "--"
 *    2. I'm the field-best holder → green "-X.XXs" (margin to 2nd)
 *    3. Not the holder → red "+X.XXs" + "#K Team / Driver"
 *
 *  Layout: the (large) delta is biased toward the top of the card and
 *  the leader name toward the bottom, so the empty middle space scales
 *  with card height — this is what makes the card readable when the
 *  three sector cards are stacked into a single tall row. Fonts scale
 *  with card height via the existing `scale` factor; minimumScaleFactor
 *  on the delta backstops the narrow-card case. */
@Composable
private fun SectorDeltaContent(
    sectorIdx: Int,
    hasSectors: Boolean,
    sectorMeta: SectorMeta?,
    ourKart: KartState?,
    raceVM: RaceViewModel,
    mainFont: TextUnit,
    bigFont: TextUnit,
    smallFont: TextUnit,
    scale: Float,
) {
    val leader = sectorMeta?.bestFor(sectorIdx)
    if (!hasSectors || leader == null || ourKart == null) {
        MonoValue("--", BoxBoxNowColors.SystemGray3, mainFont)
        return
    }

    // Delta math centralized in RaceViewModel.sectorDelta — reused by
    // the combined `Δ Sectores` card too. When I lead, `myBest -
    // secondBest` is negative (faster) and renders green with a "-"
    // prefix. When I'm trailing, `myCurrent - fieldBest` is positive
    // and renders red with "+". Sign + color pair makes leader vs.
    // trailer state unambiguous without a star icon.
    val result = raceVM.sectorDelta(sectorIdx)
    if (result == null) {
        MonoValue("--", BoxBoxNowColors.SystemGray3, mainFont)
        return
    }
    val isMine = result.isMine
    val deltaMs = result.deltaMs

    val signText = if (deltaMs < 0) "-" else "+"
    val deltaFontSp = (bigFont.value * 1.15f).sp
    val kartFontSp = (mainFont.value * 0.85f).sp
    val nameFontSp = (mainFont.value * 0.62f).sp

    // Three Spacer(weight=1) entries split the available height into
    // roughly thirds: top empty, delta in upper third, mid empty,
    // leader-block (kart # on line 1, team/driver on line 2) in
    // lower third, bottom empty. Anchors the delta a bit below the
    // title and keeps the leader info readable above the bottom edge.
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxSize()
            .padding(vertical = (4f * scale).dp),
    ) {
        Spacer(Modifier.weight(1f))
        MonoValue(
            "$signText%.2fs".format(abs(deltaMs) / 1000),
            if (isMine) Color(0xFF30D158) else Color(0xFFFF453A),
            deltaFontSp,
        )
        Spacer(Modifier.weight(1f))
        if (!isMine) {
            Text(
                "#${leader.kartNumber}",
                color = BoxBoxNowColors.SystemGray,
                fontSize = kartFontSp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            val name = leaderName(leader)
            if (name.isNotEmpty()) {
                Text(
                    name,
                    color = BoxBoxNowColors.SystemGray,
                    fontSize = nameFontSp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    softWrap = true,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.padding(horizontal = (4f * scale).dp),
                )
            }
            Spacer(Modifier.weight(1f))
        }
    }
}

/** "#K Team/Driver" label for the field-best holder. Falls back
 *  gracefully when team/driver names are missing (some circuits
 *  populate only one of the two columns). Reserved for any future
 *  single-line accessibility / TalkBack rendering — visual layout
 *  uses `leaderName(leader)` so kart # and name render on separate
 *  lines. */
private fun leaderLabel(leader: SectorBest): String {
    val t = (leader.teamName ?: "").trim()
    val d = (leader.driverName ?: "").trim()
    return when {
        t.isNotEmpty() && d.isNotEmpty() -> "#${leader.kartNumber} $t/$d"
        t.isNotEmpty() -> "#${leader.kartNumber} $t"
        d.isNotEmpty() -> "#${leader.kartNumber} $d"
        else -> "#${leader.kartNumber}"
    }
}

/** Just the team / driver name portion (no kart prefix), used as
 *  the second line of the sector-card leader block. Returns "" when
 *  neither team nor driver is populated; the caller drops the second
 *  Text in that case so the kart number isn't followed by a blank
 *  line. */
private fun leaderName(leader: SectorBest): String {
    val t = (leader.teamName ?: "").trim()
    val d = (leader.driverName ?: "").trim()
    return when {
        t.isNotEmpty() && d.isNotEmpty() -> "$t/$d"
        t.isNotEmpty() -> t
        d.isNotEmpty() -> d
        else -> ""
    }
}

/** Theoretical best lap = sum of MY session-long S1/S2/S3 PBs.
 *  Falls back to "--" when any sector is missing. Below the time we
 *  show the pilot's real best so they see how much pace they leave
 *  on the table by not stringing together their best sectors. */
@Composable
private fun TheoreticalBestLapContent(
    hasSectors: Boolean,
    ourKart: KartState?,
    mainFont: TextUnit,
    smallFont: TextUnit,
) {
    val s1 = ourKart?.bestS1Ms ?: 0.0
    val s2 = ourKart?.bestS2Ms ?: 0.0
    val s3 = ourKart?.bestS3Ms ?: 0.0
    val realBest = ourKart?.bestLapMs ?: 0.0

    if (!hasSectors || s1 <= 0 || s2 <= 0 || s3 <= 0) {
        MonoValue("--", BoxBoxNowColors.SystemGray3, mainFont)
        return
    }

    val theoMs = s1 + s2 + s3
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        MonoValue(Formatters.msToLapTime(theoMs), Color(0xFFFF4081), mainFont)
        if (realBest > 0) {
            Text(
                t("driver.cardReal", "time" to Formatters.msToLapTime(realBest)),
                color = BoxBoxNowColors.SystemGray,
                fontSize = smallFont,
                fontFamily = FontFamily.Monospace,
                maxLines = 1,
            )
        }
    }
}

/** Combined sector-delta card: 3 lines (S1/S2/S3), each with the
 *  sector label on the left and the delta value on the right. Reuses
 *  `RaceViewModel.sectorDelta(...)` so the math lives in a single
 *  spot (shared with the per-sector cards). Font sizes are derived
 *  from cardHeight directly so the values grow when the pilot lays
 *  the card alone in a single row of the grid (where the parent's
 *  `scale` factor caps and `mainFont * 1.0` leaves dead space). */
@Composable
private fun DeltaSectorsContent(
    hasSectors: Boolean,
    raceVM: RaceViewModel,
    mainFont: TextUnit,
    cardHeight: Dp,
    scale: Float,
) {
    if (!hasSectors) {
        MonoValue("--", BoxBoxNowColors.SystemGray3, mainFont)
        return
    }

    // BoxWithConstraints so the value font respects BOTH the actual
    // width AND height of the card body. Sizing only off cardHeight
    // overflowed narrow-tall cards (portrait), where the "+X.XXs"
    // text didn't fit and Compose truncated to "+0..." despite the
    // value being the focal element.
    //
    // Width budget for "+X.XXs" (6 chars, monospaced, char width ≈
    // 0.6×fontSize): value text ≈ font × 3.6, target ≤ ~70% of
    // available width to leave room for label + spacer + padding.
    // → font ≤ 0.7 × width / 3.6 ≈ width × 0.19
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val w = maxWidth.value
        val h = maxHeight.value
        val valueFontSize = minOf(h * 0.22f, w * 0.19f).coerceIn(20f, 90f)
        val labelFontSize = (valueFontSize * 0.4f).coerceIn(14f, 28f)
        val valueFontSp = valueFontSize.sp
        val labelFontSp = labelFontSize.sp

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = (6f * scale).dp),
        ) {
            for (n in 1..3) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    DeltaSectorsLine(
                        sectorIdx = n, raceVM = raceVM,
                        labelFontSp = labelFontSp, valueFontSp = valueFontSp,
                    )
                }
            }
        }
    }
}

/** One row of the combined sector-delta card: "S{n}" left, value
 *  right (or "—" when there's no data yet for that sector). Fonts
 *  arrive pre-sized from the parent so the three lines stay aligned
 *  + scale together with the card. */
@Composable
private fun DeltaSectorsLine(
    sectorIdx: Int,
    raceVM: RaceViewModel,
    labelFontSp: TextUnit,
    valueFontSp: TextUnit,
) {
    val r = raceVM.sectorDelta(sectorIdx)
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Label hugs its content (no minWidth) so the value gets all
        // remaining horizontal room on narrow cards.
        Text(
            "S$sectorIdx",
            color = BoxBoxNowColors.SystemGray,
            fontSize = labelFontSp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
        Spacer(Modifier.weight(1f))
        if (r != null) {
            val sign = if (r.deltaMs < 0) "-" else "+"
            MonoValue(
                "$sign%.2fs".format(abs(r.deltaMs) / 1000),
                if (r.isMine) Color(0xFF30D158) else Color(0xFFFF453A),
                valueFontSp,
            )
        } else {
            MonoValue("—", BoxBoxNowColors.SystemGray3, valueFontSp)
        }
    }
}

/**
 * Tabular-figures style for big numeric values. The system monospace
 * family on Android has NO 900 weight, so `FontFamily.Monospace` +
 * `FontWeight.Black` rendered visibly thin (lighter than the BoxScore
 * card, which already used the default Roboto Black). Roboto *does*
 * ship a real Black weight, and `fontFeatureSettings = "tnum"` enables
 * tabular (fixed-width) digits so a ticking timer keeps its columns
 * aligned just like monospace did — only now properly heavy.
 */
private val NumericValueStyle = TextStyle(fontFeatureSettings = "tnum")

/**
 * Big numeric value that GROWS to fill the card width. `size` is the
 * preferred/maximum; the string is measured and the font shrunk (down
 * to 55% of `size`) only if it wouldn't otherwise fit on one line.
 * This is the Compose-1.7 stand-in for iOS's `.minimumScaleFactor`:
 * short values (a lap time, an average) get big and bold instead of
 * floating in empty space, and a long value on a narrow card never
 * clips. Measuring a <10-char string is microsecond-cheap.
 */
@Composable
private fun MonoValue(text: String, color: Color, size: TextUnit) {
    BoxWithConstraints(contentAlignment = Alignment.Center) {
        val measurer = rememberTextMeasurer()
        val availPx = with(LocalDensity.current) { maxWidth.toPx() } * 0.96f
        var fs = size.value
        val floor = fs * 0.55f
        var guard = 0
        while (fs > floor && guard < 28) {
            val w = measurer.measure(
                AnnotatedString(text),
                style = TextStyle(
                    fontSize = fs.sp,
                    fontWeight = FontWeight.Black,
                    fontFeatureSettings = "tnum",
                ),
                maxLines = 1,
                softWrap = false,
            ).size.width
            if (w <= availPx) break
            fs *= 0.92f
            guard++
        }
        Text(
            text,
            color = color,
            fontSize = fs.sp,
            fontWeight = FontWeight.Black,
            style = NumericValueStyle,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Clip,
        )
    }
}
