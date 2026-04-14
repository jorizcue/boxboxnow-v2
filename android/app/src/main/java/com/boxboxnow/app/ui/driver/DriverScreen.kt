package com.boxboxnow.app.ui.driver

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.vm.DriverViewModel
import com.boxboxnow.app.vm.GpsViewModel
import com.boxboxnow.app.vm.RaceViewModel
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DriverScreen(onBack: () -> Unit) {
    val driverVM: DriverViewModel = hiltViewModel()
    val raceVM: RaceViewModel = hiltViewModel()
    val gpsVM: GpsViewModel = hiltViewModel()

    val visible by driverVM.visibleCards.collectAsState()
    val order by driverVM.cardOrder.collectAsState()
    val gps by gpsVM.lastSample.collectAsState()
    val karts by raceVM.karts.collectAsState()
    val ourKartNum by raceVM.ourKartNumber.collectAsState()
    val boxScore by raceVM.boxScore.collectAsState()
    val lastLap by driverVM.lapTracker.lastLapMs.collectAsState()
    val bestLap by driverVM.lapTracker.bestLapMs.collectAsState()
    val deltaBest by driverVM.lapTracker.deltaBestMs.collectAsState()

    // 10 Hz clock tick
    var clockMs by remember { mutableStateOf(0.0) }
    LaunchedEffect(Unit) {
        raceVM.connect()
        driverVM.applyDefaultPresetIfAny()
        while (true) {
            clockMs = raceVM.interpolatedClockMs()
            delay(100)
        }
    }
    DisposableEffect(Unit) {
        onDispose { raceVM.disconnect() }
    }

    // Wire GPS → LapTracker
    LaunchedEffect(Unit) {
        gpsVM.onSample = { sample -> driverVM.processSample(sample) }
    }

    val ourKart = karts.firstOrNull { it.kartNumber == ourKartNum }
    val cards = order.mapNotNull { key ->
        if (visible[key] == true) com.boxboxnow.app.models.DriverCard.fromKey(key) else null
    }

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text("Vista Piloto", color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Black),
            )
        },
    ) { padding ->
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            contentPadding = PaddingValues(10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .background(Color.Black),
        ) {
            items(cards, key = { it.key }) { card ->
                DriverCardView(
                    card = card,
                    ourKart = ourKart,
                    raceVM = raceVM,
                    raceClockMs = clockMs,
                    lastLapMs = lastLap,
                    bestLapMs = bestLap,
                    deltaBestMs = deltaBest,
                    gps = gps,
                    boxScore = boxScore.toInt(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(110.dp),
                )
            }
        }
    }
}
