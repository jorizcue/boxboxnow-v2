package com.boxboxnow.app.ui.config

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.vm.GpsSource
import com.boxboxnow.app.vm.GpsViewModel
import com.boxboxnow.app.vm.SignalQuality

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GpsConfigScreen(onBack: () -> Unit) {
    val vm: GpsViewModel = hiltViewModel()
    val source by vm.source.collectAsState()
    val isConnected by vm.isConnected.collectAsState()
    val signal by vm.signalQuality.collectAsState()
    val sampleRate by vm.sampleRate.collectAsState()
    val lastSample by vm.lastSample.collectAsState()
    val discovered by vm.bleManager.discovered.collectAsState()
    val isScanning by vm.bleManager.isScanning.collectAsState()
    val battery by vm.bleManager.batteryPercent.collectAsState()
    val calibratorPhase by vm.calibrator.phase.collectAsState()
    val calibratorProgress by vm.calibrator.progress.collectAsState()

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text("GPS", color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Black),
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .background(Color.Black)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Fuente", color = Color.White, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GpsSource.entries.forEach { src ->
                    FilterChip(
                        selected = source == src,
                        onClick = { vm.selectSource(src) },
                        label = { Text(src.display) },
                    )
                }
            }

            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1C1C1C)),
                shape = RoundedCornerShape(12.dp),
            ) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        if (isConnected) "Conectado" else "Desconectado",
                        color = if (isConnected) Color(0xFF4CAF50) else Color.Gray,
                        fontWeight = FontWeight.Bold,
                    )
                    Text("Señal: ${signal.display}", color = Color.White)
                    Text("Muestras/s: ${"%.1f".format(sampleRate)}", color = Color.White)
                    lastSample?.let {
                        Text("Satélites: ${it.numSatellites}", color = Color.White)
                        Text("Velocidad: ${"%.0f".format(it.speedKmh)} km/h", color = Color.White)
                    }
                    battery?.let { Text("Batería RaceBox: ${it}%", color = Color.White) }
                    Text("Calibrador: ${calibratorPhase.name} (${"%.0f".format(calibratorProgress * 100)}%)", color = Color.LightGray)
                }
            }

            if (source == GpsSource.RACEBOX) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Dispositivos", color = Color.White, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f))
                    if (isScanning) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    TextButton(onClick = { vm.bleManager.startScan() }) { Text("Escanear") }
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(discovered, key = { it.device.address }) { dev ->
                        Card(
                            onClick = { vm.bleManager.connect(dev.device) },
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF1C1C1C)),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(Modifier.padding(12.dp)) {
                                Text(dev.name, color = Color.White)
                                Spacer(Modifier.weight(1f))
                                Text("${dev.rssi} dBm", color = Color.Gray)
                            }
                        }
                    }
                }
            }
        }
    }
}
