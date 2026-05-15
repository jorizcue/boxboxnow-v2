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
import com.boxboxnow.app.i18n.t
import com.boxboxnow.app.imu.ImuCalibrator
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.DriverViewModel
import com.boxboxnow.app.vm.GpsSource
import com.boxboxnow.app.vm.GpsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GpsConfigScreen(onBack: () -> Unit) {
    val vm: GpsViewModel = hiltViewModel()
    // Picker for the GPS delta refresh rate (1/2/4 Hz) lives in
    // DriverViewModel so the delta cards can observe the same flow
    // and re-sample their value stream live without a restart.
    val driverVM: DriverViewModel = hiltViewModel()
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
    val deltaRefreshHz by driverVM.gpsDeltaRefreshHz.collectAsState()

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text(t("gps.title"), color = Color.White) },
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
            SectionCard(title = t("gps.source")) {
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
                SectionCard(title = t("gps.raceboxBle")) {
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
                                t("gps.raceboxName"),
                                color = Color.White,
                                fontSize = 15.sp,
                            )
                            Spacer(Modifier.weight(1f))
                            TextButton(onClick = {
                                vm.bleManager.disconnect()
                            }) {
                                Text(
                                    t("gps.disconnect"),
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
                                    t("common.searching"),
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
                                    t("gps.noDevices"),
                                    color = BoxBoxNowColors.SystemGray,
                                    fontSize = 14.sp,
                                )
                                Text(
                                    t("gps.noDevicesHint"),
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
                                    t("gps.searchDevices"),
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

            // ── Section: Pantalla (delta refresh rate, RaceBox-only) ──
            // The delta cards on the driver dashboard render meaningful
            // values only when a RaceBox is feeding samples, so the
            // picker is hidden otherwise. The underlying delta on
            // LapTracker is recomputed at the device sample rate
            // (~50Hz); this only controls how often the visible Text
            // flips. Mirrors iOS GPSConfigView.
            if (source == GpsSource.RACEBOX) {
                SectionCard(title = t("gps.displaySection")) {
                    Text(
                        t("gps.deltaFrequency"),
                        color = Color.White,
                        fontSize = 15.sp,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        listOf(1, 2, 4).forEach { hz ->
                            FilterChip(
                                selected = deltaRefreshHz == hz,
                                onClick = { driverVM.setGpsDeltaRefreshHz(hz) },
                                label = {
                                    Text(
                                        "$hz Hz",
                                        fontWeight = if (deltaRefreshHz == hz) FontWeight.SemiBold else FontWeight.Normal,
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
                    Spacer(Modifier.height(8.dp))
                    Text(
                        t("gps.deltaHint"),
                        color = BoxBoxNowColors.SystemGray,
                        fontSize = 12.sp,
                    )
                }
            }

            // ── Section: Estado (when source is not NONE) ──
            if (source != GpsSource.NONE) {
                SectionCard(title = t("gps.status")) {
                    StatusRow(label = t("gps.connected")) {
                        Icon(
                            if (isConnected) Icons.Filled.CheckCircle else Icons.Filled.Cancel,
                            contentDescription = null,
                            tint = if (isConnected) BoxBoxNowColors.SuccessGreen else BoxBoxNowColors.ErrorRed,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    SectionDivider()
                    StatusRow(label = t("gps.signal")) {
                        Text(signal.display, color = BoxBoxNowColors.SystemGray, fontSize = 15.sp)
                    }
                    SectionDivider()
                    StatusRow(label = t("gps.satellites")) {
                        Text(
                            "${lastSample?.numSatellites ?: 0}",
                            color = BoxBoxNowColors.SystemGray,
                            fontSize = 15.sp,
                        )
                    }
                    SectionDivider()
                    StatusRow(label = t("gps.frequency")) {
                        Text(
                            "${sampleRate.toInt()} Hz",
                            color = BoxBoxNowColors.SystemGray,
                            fontSize = 15.sp,
                        )
                    }
                    battery?.let { bat ->
                        SectionDivider()
                        StatusRow(label = t("gps.battery")) {
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
                SectionCard(title = t("gps.imuTitle")) {
                    // Phase row
                    StatusRow(label = t("gps.phase")) {
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
                                ImuCalibrator.Phase.IDLE -> t("gps.phaseIdle")
                                ImuCalibrator.Phase.SAMPLING -> t("gps.phaseSampling")
                                ImuCalibrator.Phase.READY -> t("gps.phaseReady")
                                ImuCalibrator.Phase.ALIGNED -> t("gps.phaseAligned")
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
                                t("gps.samples", "pct" to "%.0f".format(calibratorProgress * 100)),
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
                            t("gps.driveHint"),
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
                                t("gps.calibrationComplete"),
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
                                    t("gps.startCalibration"),
                                    color = if (connectedDevice != null) BoxBoxNowColors.Accent
                                    else BoxBoxNowColors.SystemGray3,
                                    fontSize = 15.sp,
                                )
                            }
                            if (connectedDevice == null) {
                                Text(
                                    t("gps.connectFirst"),
                                    color = BoxBoxNowColors.SystemGray3,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(start = 12.dp, bottom = 4.dp),
                                )
                            }
                        }
                        ImuCalibrator.Phase.SAMPLING -> {
                            Text(
                                t("gps.holdStill"),
                                color = Color(0xFF2196F3),
                                fontSize = 13.sp,
                                modifier = Modifier.padding(vertical = 4.dp),
                            )
                        }
                        ImuCalibrator.Phase.READY -> {
                            TextButton(onClick = { vm.calibrator.skipAlignment() }) {
                                Text(
                                    t("gps.skipAlign"),
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
                                    t("gps.recalibrate"),
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
                                t("gps.resetCalibration"),
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
