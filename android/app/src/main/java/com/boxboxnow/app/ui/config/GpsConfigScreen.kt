package com.boxboxnow.app.ui.config

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.imu.ImuCalibrator
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.GpsSource
import com.boxboxnow.app.vm.GpsViewModel

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
    val connectedDevice by vm.bleManager.connectedDevice.collectAsState()
    val battery by vm.bleManager.batteryPercent.collectAsState()
    val calibratorPhase by vm.calibrator.phase.collectAsState()
    val calibratorProgress by vm.calibrator.progress.collectAsState()

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text("GPS / RaceBox", color = Color.White) },
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
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .background(Color.Black)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            // ── Section: Fuente GPS ──
            SectionCard(title = "Fuente GPS") {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    // App is RaceBox-only. Hide the "Telefono" option from
                    // the picker — only "Ninguno" and "RaceBox BLE" are
                    // selectable.
                    GpsSource.selectable.forEach { src ->
                        FilterChip(
                            selected = source == src,
                            onClick = { vm.selectSource(src) },
                            label = {
                                Text(
                                    src.display,
                                    fontWeight = if (source == src) FontWeight.SemiBold else FontWeight.Normal,
                                )
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = BoxBoxNowColors.SystemGray4,
                                selectedLabelColor = Color.White,
                                containerColor = BoxBoxNowColors.SystemGray6,
                                labelColor = Color.White,
                            ),
                        )
                    }
                }
            }

            // ── Section: RaceBox BLE (only when RaceBox source) ──
            if (source == GpsSource.RACEBOX) {
                SectionCard(title = "RaceBox BLE") {
                    if (connectedDevice != null) {
                        // Connected device row
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = null,
                                tint = BoxBoxNowColors.SuccessGreen,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "RaceBox",
                                color = Color.White,
                                fontSize = 15.sp,
                            )
                            Spacer(Modifier.weight(1f))
                            TextButton(onClick = {
                                vm.bleManager.disconnect()
                            }) {
                                Text(
                                    "Desconectar",
                                    color = BoxBoxNowColors.ErrorRed,
                                    fontSize = 13.sp,
                                )
                            }
                        }
                    } else {
                        // Scanning state
                        if (isScanning) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(vertical = 8.dp),
                            ) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(16.dp),
                                    color = BoxBoxNowColors.Accent,
                                )
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    "Buscando dispositivos...",
                                    color = BoxBoxNowColors.SystemGray,
                                    fontSize = 14.sp,
                                )
                            }
                        }

                        // Empty state
                        if (discovered.isEmpty() && !isScanning) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text(
                                    "No se encontraron dispositivos",
                                    color = BoxBoxNowColors.SystemGray,
                                    fontSize = 14.sp,
                                )
                                Text(
                                    "Asegurate de que tu RaceBox esta encendido y cerca",
                                    color = BoxBoxNowColors.SystemGray3,
                                    fontSize = 12.sp,
                                )
                            }
                        }

                        // Discovered devices list
                        discovered.forEachIndexed { index, dev ->
                            if (index > 0 || isScanning) {
                                HorizontalDivider(
                                    color = BoxBoxNowColors.SystemGray4.copy(alpha = 0.4f),
                                    thickness = 0.5.dp,
                                )
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { vm.bleManager.connect(dev.device) }
                                    .padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    Icons.Filled.Bluetooth,
                                    contentDescription = null,
                                    tint = BoxBoxNowColors.Accent,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(Modifier.width(10.dp))
                                Text(dev.name, color = Color.White, fontSize = 15.sp)
                                Spacer(Modifier.weight(1f))
                                Text(
                                    "${dev.rssi} dBm",
                                    color = BoxBoxNowColors.SystemGray,
                                    fontSize = 13.sp,
                                )
                            }
                        }

                        // Scan button
                        if (!isScanning) {
                            if (discovered.isNotEmpty()) {
                                HorizontalDivider(
                                    color = BoxBoxNowColors.SystemGray4.copy(alpha = 0.4f),
                                    thickness = 0.5.dp,
                                )
                            }
                            TextButton(
                                onClick = { vm.bleManager.startScan() },
                                modifier = Modifier.padding(top = 4.dp),
                            ) {
                                Text(
                                    "Buscar dispositivos",
                                    color = BoxBoxNowColors.Accent,
                                    fontSize = 15.sp,
                                )
                            }
                        }
                    }
                }
            }

            // The phone GPS source is no longer selectable — the entire
            // "GPS del telefono" section is intentionally removed.

            // ── Section: Estado (when source is not NONE) ──
            if (source != GpsSource.NONE) {
                SectionCard(title = "Estado") {
                    StatusRow(label = "Conectado") {
                        Icon(
                            if (isConnected) Icons.Filled.CheckCircle else Icons.Filled.Cancel,
                            contentDescription = null,
                            tint = if (isConnected) BoxBoxNowColors.SuccessGreen else BoxBoxNowColors.ErrorRed,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    SectionDivider()
                    StatusRow(label = "Senal") {
                        Text(signal.display, color = BoxBoxNowColors.SystemGray, fontSize = 15.sp)
                    }
                    SectionDivider()
                    StatusRow(label = "Satelites") {
                        Text(
                            "${lastSample?.numSatellites ?: 0}",
                            color = BoxBoxNowColors.SystemGray,
                            fontSize = 15.sp,
                        )
                    }
                    SectionDivider()
                    StatusRow(label = "Frecuencia") {
                        Text(
                            "${sampleRate.toInt()} Hz",
                            color = BoxBoxNowColors.SystemGray,
                            fontSize = 15.sp,
                        )
                    }
                    battery?.let { bat ->
                        SectionDivider()
                        StatusRow(label = "Bateria RaceBox") {
                            Text(
                                "${bat}%",
                                color = BoxBoxNowColors.SystemGray,
                                fontSize = 15.sp,
                            )
                        }
                    }
                }
            }

            // ── Section: Calibracion IMU (only for RaceBox) ──
            if (source == GpsSource.RACEBOX) {
                SectionCard(title = "Calibracion IMU") {
                    // Phase row
                    StatusRow(label = "Fase") {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(
                                    when (calibratorPhase) {
                                        ImuCalibrator.Phase.IDLE -> BoxBoxNowColors.SystemGray
                                        ImuCalibrator.Phase.SAMPLING -> Color(0xFF2196F3)
                                        ImuCalibrator.Phase.READY -> Color(0xFF00BCD4)
                                        ImuCalibrator.Phase.ALIGNED -> BoxBoxNowColors.SuccessGreen
                                    },
                                ),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            when (calibratorPhase) {
                                ImuCalibrator.Phase.IDLE -> "Sin calibrar"
                                ImuCalibrator.Phase.SAMPLING -> "Capturando gravedad..."
                                ImuCalibrator.Phase.READY -> "Gravedad OK — alineando"
                                ImuCalibrator.Phase.ALIGNED -> "Calibrado"
                            },
                            color = BoxBoxNowColors.SystemGray,
                            fontSize = 15.sp,
                        )
                    }

                    // Progress bar during sampling
                    if (calibratorPhase == ImuCalibrator.Phase.SAMPLING) {
                        SectionDivider()
                        Column(modifier = Modifier.padding(vertical = 4.dp)) {
                            Text(
                                "Muestras: ${"%.0f".format(calibratorProgress * 100)}%",
                                color = BoxBoxNowColors.SystemGray,
                                fontSize = 12.sp,
                            )
                            Spacer(Modifier.height(6.dp))
                            LinearProgressIndicator(
                                progress = { calibratorProgress.toFloat() },
                                color = Color(0xFF2196F3),
                                trackColor = BoxBoxNowColors.SystemGray4,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(4.dp)
                                    .clip(RoundedCornerShape(2.dp)),
                            )
                        }
                    }

                    // Ready state hint
                    if (calibratorPhase == ImuCalibrator.Phase.READY) {
                        SectionDivider()
                        Text(
                            "Conduce a mas de 15 km/h para alinear los ejes del dispositivo",
                            color = Color(0xFF00BCD4),
                            fontSize = 13.sp,
                            modifier = Modifier.padding(vertical = 4.dp),
                        )
                    }

                    // Aligned state
                    if (calibratorPhase == ImuCalibrator.Phase.ALIGNED) {
                        SectionDivider()
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(vertical = 4.dp),
                        ) {
                            Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = null,
                                tint = BoxBoxNowColors.SuccessGreen,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "Calibracion completa",
                                color = BoxBoxNowColors.SuccessGreen,
                                fontSize = 14.sp,
                            )
                        }
                    }

                    SectionDivider()

                    // Action buttons based on phase
                    when (calibratorPhase) {
                        ImuCalibrator.Phase.IDLE -> {
                            TextButton(
                                onClick = { vm.calibrator.startCalibration() },
                                enabled = connectedDevice != null,
                            ) {
                                Text(
                                    "Iniciar calibracion",
                                    color = if (connectedDevice != null) BoxBoxNowColors.Accent
                                    else BoxBoxNowColors.SystemGray3,
                                    fontSize = 15.sp,
                                )
                            }
                            if (connectedDevice == null) {
                                Text(
                                    "Conecta un RaceBox para calibrar",
                                    color = BoxBoxNowColors.SystemGray3,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(start = 12.dp, bottom = 4.dp),
                                )
                            }
                        }
                        ImuCalibrator.Phase.SAMPLING -> {
                            Text(
                                "Manten el kart quieto...",
                                color = Color(0xFF2196F3),
                                fontSize = 13.sp,
                                modifier = Modifier.padding(vertical = 4.dp),
                            )
                        }
                        ImuCalibrator.Phase.READY -> {
                            TextButton(onClick = { vm.calibrator.skipAlignment() }) {
                                Text(
                                    "Omitir alineacion",
                                    color = BoxBoxNowColors.Accent,
                                    fontSize = 15.sp,
                                )
                            }
                        }
                        ImuCalibrator.Phase.ALIGNED -> {
                            TextButton(onClick = {
                                vm.calibrator.reset()
                                vm.calibrator.startCalibration()
                            }) {
                                Text(
                                    "Recalibrar",
                                    color = BoxBoxNowColors.Accent,
                                    fontSize = 15.sp,
                                )
                            }
                        }
                    }

                    // Reset button (always available when not idle)
                    if (calibratorPhase != ImuCalibrator.Phase.IDLE) {
                        HorizontalDivider(
                            color = BoxBoxNowColors.SystemGray4.copy(alpha = 0.4f),
                            thickness = 0.5.dp,
                        )
                        TextButton(onClick = { vm.calibrator.reset() }) {
                            Text(
                                "Resetear calibracion",
                                color = BoxBoxNowColors.ErrorRed,
                                fontSize = 15.sp,
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

// ── Shared section components ──

@Composable
private fun SectionCard(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            title,
            color = BoxBoxNowColors.SystemGray,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 4.dp),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(BoxBoxNowColors.SystemGray6)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            content()
        }
    }
}

@Composable
private fun StatusRow(
    label: String,
    trailing: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = Color.White, fontSize = 15.sp)
        Spacer(Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically) {
            trailing()
        }
    }
}

@Composable
private fun SectionDivider() {
    HorizontalDivider(
        color = BoxBoxNowColors.SystemGray4.copy(alpha = 0.4f),
        thickness = 0.5.dp,
    )
}
