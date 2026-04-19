package com.boxboxnow.app.ui.driver

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.WindowManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.models.DriverCard
import com.boxboxnow.app.models.FinishLine
import com.boxboxnow.app.models.GeoPoint
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.AuthViewModel
import com.boxboxnow.app.vm.ConfigViewModel
import com.boxboxnow.app.vm.DriverViewModel
import com.boxboxnow.app.vm.GpsViewModel
import com.boxboxnow.app.vm.OrientationLock
import com.boxboxnow.app.vm.RaceViewModel
import kotlinx.coroutines.delay

/**
 * The pilot view — mirrors iOS `DriverView`:
 *   - Responsive grid: 2 cols portrait, 3 cols landscape
 *   - Card heights computed dynamically to fill the available space
 *   - Tap anywhere toggles the right-side menu overlay
 *   - Full-screen BOX call overlay on `raceVM.boxCallActive`
 *   - "Reconectando..." banner when connection drops mid-race
 *   - Keeps the screen awake, forces brightness to max, applies orientation lock
 *   - Hides status bar / navigation bar for full-screen immersion
 */
@Composable
fun DriverScreen(onBack: () -> Unit) {
    val driverVM: DriverViewModel = hiltViewModel()
    val raceVM: RaceViewModel = hiltViewModel()
    val gpsVM: GpsViewModel = hiltViewModel()
    val authVM: AuthViewModel = hiltViewModel()
    val configVM: ConfigViewModel = hiltViewModel()

    val visible by driverVM.visibleCards.collectAsState()
    val order by driverVM.cardOrder.collectAsState()
    val gps by gpsVM.lastSample.collectAsState()
    val karts by raceVM.karts.collectAsState()
    val ourKartNum by raceVM.ourKartNumber.collectAsState()
    val boxScore by raceVM.boxScore.collectAsState()
    val isConnected by raceVM.isConnected.collectAsState()
    val boxCall by raceVM.boxCallActive.collectAsState()
    val lastLap by driverVM.lapTracker.lastLapMs.collectAsState()
    val bestLap by driverVM.lapTracker.bestLapMs.collectAsState()
    val deltaBest by driverVM.lapTracker.deltaBestMs.collectAsState()
    val orientation by driverVM.orientationLock.collectAsState()
    val audioEnabled by driverVM.audioEnabled.collectAsState()
    val brightness by driverVM.brightness.collectAsState()
    val user by authVM.user.collectAsState()

    // Clock tick every 100ms for smooth race timer updates
    var clockMs by remember { mutableStateOf(0.0) }
    LaunchedEffect(Unit) {
        raceVM.connect()
        driverVM.applyDefaultPresetIfAny()
        // Re-fetch the user's circuits so any admin-side edit to the GPS
        // finish-line (finish_lat1/lon1/lat2/lon2) is picked up without
        // having to kill the app. Mirrors the iOS DriverView.task flow.
        configVM.loadSession()
        configVM.loadCircuits()
        while (true) {
            clockMs = raceVM.interpolatedClockMs()
            delay(100)
        }
    }

    // Apply the active circuit's GPS finish line to the LapTracker whenever
    // the circuits list or the active circuit id changes. Keyed on both so
    // an admin update (new list) or a session switch (new id) re-binds.
    val circuits by configVM.circuits.collectAsState()
    val session by configVM.session.collectAsState()
    LaunchedEffect(circuits, session.circuitId) {
        val circuitId = session.circuitId ?: return@LaunchedEffect
        val circuit = circuits.firstOrNull { it.id == circuitId } ?: return@LaunchedEffect
        val lat1 = circuit.finishLat1
        val lon1 = circuit.finishLon1
        val lat2 = circuit.finishLat2
        val lon2 = circuit.finishLon2
        if (lat1 != null && lon1 != null && lat2 != null && lon2 != null) {
            driverVM.lapTracker.setFinishLine(
                FinishLine(p1 = GeoPoint(lat1, lon1), p2 = GeoPoint(lat2, lon2))
            )
        } else {
            // Admin removed the GPS points — drop the cached line so we
            // don't keep detecting crossings at the wrong place.
            driverVM.lapTracker.clearFinishLine()
        }
    }

    // Wire GPS samples into the lap tracker
    LaunchedEffect(Unit) {
        gpsVM.onSample = { sample -> driverVM.processSample(sample) }
    }

    // Disconnect on screen exit
    DisposableEffect(Unit) {
        onDispose { raceVM.disconnect() }
    }

    // Audio narration on every new lap — mirrors iOS DriverView.detectLapDelta.
    // Triggers when driverVM.lapTracker.lastLapMs changes; the VM dedupes
    // repeat values internally so keyed LaunchedEffect is enough.
    var lastSpokenLap by remember { mutableStateOf(0.0) }
    var previousLapMs by remember { mutableStateOf(0.0) }
    LaunchedEffect(lastLap) {
        val ms = lastLap ?: return@LaunchedEffect
        if (ms <= 0 || ms == lastSpokenLap) return@LaunchedEffect
        val prev = previousLapMs
        val lapDelta: String? = when {
            prev <= 0 -> null
            ms < prev -> "faster"
            else -> "slower"
        }
        val pos = raceVM.racePosition()
        val stintCalc = raceVM.computeStintCalc()
        driverVM.speakLapData(
            lastLapMs = ms,
            prevLapMs = prev,
            lapDelta = lapDelta,
            realPosition = pos?.pos,
            totalKarts = pos?.total,
            boxScore = boxScore,
            lapsToMaxStint = stintCalc.lapsToMax,
        )
        previousLapMs = ms
        lastSpokenLap = ms
    }

    // Screen-on flag, max brightness, orientation lock, immersive mode
    val context = LocalContext.current
    DisposableEffect(orientation) {
        val activity = context as? Activity
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val prevBrightness = activity?.window?.attributes?.screenBrightness
        activity?.window?.attributes = activity?.window?.attributes?.apply {
            screenBrightness = 1.0f
        }
        val prevRequestedOrientation = activity?.requestedOrientation ?: ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        activity?.requestedOrientation = when (orientation) {
            OrientationLock.PORTRAIT -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            OrientationLock.LANDSCAPE -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            OrientationLock.FREE -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            activity?.window?.attributes = activity?.window?.attributes?.apply {
                screenBrightness = prevBrightness ?: -1f
            }
            activity?.requestedOrientation = prevRequestedOrientation
        }
    }

    // Box-group cards require the `app-config-box` permission
    val canShowBox = user?.isAdmin == true ||
        user?.tabAccess?.contains("app-config-box") == true

    val cards: List<DriverCard> = order.mapNotNull { key ->
        val card = DriverCard.fromKey(key) ?: return@mapNotNull null
        if (visible[key] != true) return@mapNotNull null
        if (!canShowBox && card.group == com.boxboxnow.app.models.DriverCardGroup.BOX) return@mapNotNull null
        card
    }

    val ourKart = karts.firstOrNull { it.kartNumber == ourKartNum }

    var showMenu by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = {
                    if (boxCall) raceVM.clearBoxCall()
                    else showMenu = !showMenu
                },
            ),
    ) {
        // Always render the grid — matches iOS DriverView. When the socket
        // drops, cards simply keep their last values (or show "--" placeholders
        // if we haven't received any snapshot yet) and the "Reconectando..."
        // banner below signals that we're working on it. Previously we
        // rendered a full-screen spinner here when `karts.isEmpty()`, but the
        // reconnect flow would leave the user stuck on that screen whenever
        // the backend reaped an idle connection.
        //
        // The `contrastFilterModifier` mirrors iOS's
        // `.brightness / .contrast / .saturation` stack — when the user
        // drags the contrast slider in the menu, we run the cards through a
        // ColorMatrix-backed paint so the view pops in direct sunlight.
        Box(modifier = Modifier.fillMaxSize().then(contrastFilterModifier(brightness))) {
            CardsGrid(
                cards = cards,
                ourKart = ourKart,
                raceVM = raceVM,
                raceClockMs = clockMs,
                lastLapMs = lastLap,
                bestLapMs = bestLap,
                deltaBestMs = deltaBest,
                gps = gps,
                boxScore = boxScore.toInt(),
            )
        }

        // Menu handle — small dots on the right edge
        AnimatedVisibility(
            visible = !showMenu && !boxCall,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.CenterEnd),
        ) {
            Row(
                modifier = Modifier.padding(end = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(Color.White.copy(alpha = 0.08f))
                        .padding(horizontal = 4.dp, vertical = 12.dp),
                ) {
                    repeat(3) {
                        Box(
                            Modifier
                                .size(4.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.3f)),
                        )
                    }
                }
            }
        }

        // Connection lost banner — visible whenever the socket isn't up,
        // regardless of whether we already have kart data cached. On first
        // entry this tells the user the initial connect is in flight; on an
        // interrupted session it signals the reconnect attempt.
        AnimatedVisibility(
            visible = !isConnected,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopCenter),
        ) {
            Row(
                modifier = Modifier
                    .padding(top = 12.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color(0xFFFF453A).copy(alpha = 0.85f))
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 1.5.dp, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(8.dp))
                Text("Reconectando...", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }

        // Audio indicator — small speaker icon top-left when narration is on.
        // Matches iOS DriverView. Hidden while the menu/box-call overlays are
        // visible to keep the screen clean.
        AnimatedVisibility(
            visible = audioEnabled && !showMenu && !boxCall,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopStart),
        ) {
            Box(
                modifier = Modifier
                    .padding(start = 12.dp, top = 8.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.6f))
                    .padding(6.dp),
            ) {
                Icon(
                    Icons.Filled.VolumeUp,
                    contentDescription = "Audio activado",
                    tint = BoxBoxNowColors.Accent,
                    modifier = Modifier.size(14.dp),
                )
            }
        }

        // Right-side menu overlay
        AnimatedVisibility(
            visible = showMenu,
            enter = slideInHorizontally(initialOffsetX = { it }),
            exit = slideOutHorizontally(targetOffsetX = { it }),
        ) {
            DriverMenuOverlay(
                driverVM = driverVM,
                onDismiss = { showMenu = false },
                onExit = {
                    showMenu = false
                    onBack()
                },
            )
        }

        // Full-screen BOX call overlay
        AnimatedVisibility(
            visible = boxCall,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            BoxCallOverlay(onDismiss = { raceVM.clearBoxCall() })
        }
    }
}

/**
 * Renders the pilot-view grid. Uses `BoxWithConstraints` to read the current
 * viewport dimensions and computes a responsive card height that fills the
 * available space (2 cols portrait / 3 cols landscape).
 */
@Composable
private fun CardsGrid(
    cards: List<DriverCard>,
    ourKart: com.boxboxnow.app.models.KartState?,
    raceVM: RaceViewModel,
    raceClockMs: Double,
    lastLapMs: Double?,
    bestLapMs: Double?,
    deltaBestMs: Double?,
    gps: com.boxboxnow.app.models.GPSSample?,
    boxScore: Int,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val isLandscape = maxWidth > maxHeight
        val numCols = if (isLandscape) 3 else 2
        val spacing = 6.dp
        val numRows = (cards.size + numCols - 1) / numCols

        val availableHeight: Dp = maxHeight - (spacing * (numRows + 1).coerceAtLeast(1))
        val idealCardHeight: Dp =
            if (numRows > 0) (availableHeight.value / numRows).dp else 90.dp
        val cardHeight: Dp = idealCardHeight.coerceAtLeast(70.dp)

        // If the computed height is smaller than the floor, fall back to a scrollable grid
        val fits = numRows > 0 && idealCardHeight >= 70.dp

        if (fits) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(spacing),
                verticalArrangement = Arrangement.spacedBy(spacing),
            ) {
                cards.chunked(numCols).forEach { row ->
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(spacing),
                        modifier = Modifier.fillMaxSize().weight(1f),
                    ) {
                        row.forEach { card ->
                            DriverCardView(
                                card = card,
                                ourKart = ourKart,
                                raceVM = raceVM,
                                raceClockMs = raceClockMs,
                                lastLapMs = lastLapMs,
                                bestLapMs = bestLapMs,
                                deltaBestMs = deltaBestMs,
                                gps = gps,
                                boxScore = boxScore,
                                cardHeight = cardHeight,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        // Pad the final row if it's short so remaining cells keep their width
                        repeat(numCols - row.size) {
                            Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        } else {
            val listState = rememberLazyListState()
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().padding(spacing),
                verticalArrangement = Arrangement.spacedBy(spacing),
            ) {
                items(cards.chunked(numCols)) { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(spacing)) {
                        row.forEach { card ->
                            DriverCardView(
                                card = card,
                                ourKart = ourKart,
                                raceVM = raceVM,
                                raceClockMs = raceClockMs,
                                lastLapMs = lastLapMs,
                                bestLapMs = bestLapMs,
                                deltaBestMs = deltaBestMs,
                                gps = gps,
                                boxScore = boxScore,
                                cardHeight = 90.dp,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        repeat(numCols - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

/**
 * Mirrors iOS `DriverView`'s `.brightness / .contrast / .saturation` stack.
 *
 * The slider value (`brightness`) runs 0.0..1.0 where 0 is "normal" and 1 is
 * "max contrast boost". We combine:
 *   - saturation: 1.0 + brightness * 0.5
 *   - contrast:   1.0 + brightness * 0.8
 *   - brightness: brightness * 0.15 (added to each channel in 0..255 space)
 *
 * When `brightness == 0.0` we return `Modifier` unchanged so we don't pay the
 * cost of an offscreen layer for no visible effect.
 */
private fun contrastFilterModifier(brightness: Double): Modifier {
    if (brightness <= 0.0) return Modifier
    val b = brightness.toFloat()
    val saturation = 1f + b * 0.5f
    val contrast = 1f + b * 0.8f
    val brightnessOffset = b * 0.15f * 255f

    val satMatrix = android.graphics.ColorMatrix().apply { setSaturation(saturation) }
    val bcMatrix = android.graphics.ColorMatrix(
        floatArrayOf(
            contrast, 0f, 0f, 0f, brightnessOffset + (1f - contrast) * 127.5f,
            0f, contrast, 0f, 0f, brightnessOffset + (1f - contrast) * 127.5f,
            0f, 0f, contrast, 0f, brightnessOffset + (1f - contrast) * 127.5f,
            0f, 0f, 0f, 1f, 0f,
        ),
    )
    val combined = android.graphics.ColorMatrix().apply {
        postConcat(satMatrix)
        postConcat(bcMatrix)
    }
    val paint = android.graphics.Paint().apply {
        colorFilter = android.graphics.ColorMatrixColorFilter(combined)
    }
    return Modifier.drawWithContent {
        val canvas = drawContext.canvas.nativeCanvas
        val layerId = canvas.saveLayer(null, paint)
        drawContent()
        canvas.restoreToCount(layerId)
    }
}
