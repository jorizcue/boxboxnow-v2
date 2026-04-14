package com.boxboxnow.app.ui.driver

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.boxboxnow.app.models.DriverCard
import com.boxboxnow.app.models.GPSSample
import com.boxboxnow.app.models.KartState
import com.boxboxnow.app.util.Formatters
import com.boxboxnow.app.vm.RaceViewModel

/**
 * Renders one driver card. The underlying value is computed from the
 * RaceViewModel / DriverViewModel state passed in. Cards that require data we
 * don't yet have show "--".
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
    modifier: Modifier = Modifier,
) {
    val (value, subtitle) = computeValue(
        card, ourKart, raceVM, raceClockMs, lastLapMs, bestLapMs, deltaBestMs, gps, boxScore,
    )

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFF141414))
            .padding(10.dp),
    ) {
        Text(card.display, color = Color.Gray, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        Text(
            value,
            color = card.accent,
            fontSize = 26.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )
        if (subtitle != null) {
            Text(subtitle, color = Color.LightGray, fontSize = 11.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
        }
        Spacer(Modifier.weight(1f))
    }
}

private fun computeValue(
    card: DriverCard,
    ourKart: KartState?,
    raceVM: RaceViewModel,
    raceClockMs: Double,
    lastLapMs: Double?,
    bestLapMs: Double?,
    deltaBestMs: Double?,
    gps: GPSSample?,
    boxScore: Int,
): Pair<String, String?> = when (card) {
    DriverCard.RaceTimer -> Formatters.msToRaceTime(raceClockMs) to null
    DriverCard.CurrentLapTime -> (lastLapMs?.let { Formatters.msToLapTime(it) } ?: "--") to "vuelta"
    DriverCard.LastLap -> (ourKart?.lastLapMs?.let { Formatters.msToLapTime(it) } ?: "--") to null
    DriverCard.DeltaBestLap -> (deltaBestMs?.let { Formatters.deltaString(it) } ?: "--") to "vs best"
    DriverCard.GForceRadar -> (gps?.let { "%.2f".format(it.gForceX) + "/" + "%.2f".format(it.gForceY) } ?: "--") to "X/Y"
    DriverCard.Position -> {
        val p = raceVM.racePosition()
        (p?.let { "P${it.pos}/${it.total}" } ?: "--") to "medias"
    }
    DriverCard.RealPos -> {
        val d = raceVM.computeOurData()
        (d?.let { "P${it.realPosition}/${it.totalKarts}" } ?: "--") to "real"
    }
    DriverCard.GapAhead -> {
        val d = raceVM.computeOurData()
        (d?.aheadSeconds?.let { "%+.1fs".format(it) } ?: "--") to null
    }
    DriverCard.GapBehind -> {
        val d = raceVM.computeOurData()
        (d?.behindSeconds?.let { "%+.1fs".format(it) } ?: "--") to null
    }
    DriverCard.AvgLap20 -> (ourKart?.avgLapMs?.let { Formatters.msToLapTime(it) } ?: "--") to "20v"
    DriverCard.Best3 -> (ourKart?.bestLapMs?.let { Formatters.msToLapTime(it) } ?: "--") to "best"
    DriverCard.AvgFutureStint -> {
        val c = raceVM.computeStintCalc()
        (c.realMaxStintMin?.let { "%.1f".format(it) } ?: "--") to "min"
    }
    DriverCard.BoxScore -> boxScore.toString() to "pts"
    DriverCard.BestStintLap -> (ourKart?.bestStintLapMs?.let { Formatters.msToLapTime(it) } ?: "--") to null
    DriverCard.GpsLapDelta -> (deltaBestMs?.let { Formatters.deltaString(it) } ?: "--") to "prev"
    DriverCard.GpsSpeed -> (gps?.let { "%.0f km/h".format(it.speedKmh) } ?: "--") to null
    DriverCard.GpsGForce -> (gps?.let {
        val g = kotlin.math.sqrt(it.gForceX * it.gForceX + it.gForceY * it.gForceY)
        "%.2fG".format(g)
    } ?: "--") to null
    DriverCard.LapsToMaxStint -> {
        val c = raceVM.computeStintCalc()
        (c.lapsToMax?.let { "%.1f".format(it) } ?: "--") to "v"
    }
    DriverCard.PitWindow -> "OPEN" to null
    DriverCard.PitCount -> ((ourKart?.pitCount ?: 0).toString() + "/" + raceVM.minPits.value) to null
    DriverCard.CurrentPit -> "--" to null
}
