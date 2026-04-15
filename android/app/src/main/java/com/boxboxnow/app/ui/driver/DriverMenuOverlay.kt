package com.boxboxnow.app.ui.driver

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.DriverViewModel
import com.boxboxnow.app.vm.OrientationLock

/**
 * Right-side sliding panel with preset picker, contrast slider, orientation
 * lock, and exit button. Tap the dark backdrop to close. Mirrors iOS
 * `DriverMenuOverlay`.
 */
@Composable
fun DriverMenuOverlay(
    driverVM: DriverViewModel,
    onDismiss: () -> Unit,
    onExit: () -> Unit,
) {
    val brightness by driverVM.brightness.collectAsState()
    val orientation by driverVM.orientationLock.collectAsState()
    val presets by driverVM.presets.collectAsState()
    val selectedPresetId by driverVM.selectedPresetId.collectAsState()

    Row(modifier = Modifier.fillMaxSize()) {
        // Dim backdrop — tap outside to close
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .background(Color.Black.copy(alpha = 0.35f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss,
                ),
        )
        // The panel itself (280dp wide, card gray background)
        Column(
            modifier = Modifier
                .width(280.dp)
                .fillMaxHeight()
                .background(BoxBoxNowColors.SystemGray6.copy(alpha = 0.97f)),
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Menu", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onDismiss) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Cerrar",
                        tint = BoxBoxNowColors.SystemGray,
                    )
                }
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(BoxBoxNowColors.SystemGray5),
            )

            // Scrollable body
            Column(
                modifier = Modifier
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(22.dp),
            ) {
                // Preset picker
                if (presets.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("PLANTILLA", color = BoxBoxNowColors.SystemGray3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp)
                        var expanded by remember { mutableStateOf(false) }
                        val selected = presets.firstOrNull { it.id == selectedPresetId }?.name ?: "Ninguna"
                        Box {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(BoxBoxNowColors.SystemGray5)
                                    .clickable { expanded = true }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(selected, color = Color.White, fontSize = 14.sp)
                            }
                            DropdownMenu(
                                expanded = expanded,
                                onDismissRequest = { expanded = false },
                            ) {
                                presets.forEach { preset ->
                                    DropdownMenuItem(
                                        text = { Text(preset.name) },
                                        onClick = {
                                            driverVM.applyPreset(preset)
                                            expanded = false
                                        },
                                    )
                                }
                            }
                        }
                    }
                }

                // Contrast / brightness slider
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("CONTRASTE", color = BoxBoxNowColors.SystemGray3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp)
                        Spacer(Modifier.weight(1f))
                        Text(
                            if (brightness == 0.0) "Normal" else "+${(brightness * 100).toInt()}%",
                            color = Color.White,
                            fontSize = 11.sp,
                        )
                    }
                    Slider(
                        value = brightness.toFloat(),
                        onValueChange = { driverVM.setBrightness(it.toDouble()) },
                        valueRange = 0f..1f,
                        steps = 19,
                        colors = SliderDefaults.colors(
                            thumbColor = BoxBoxNowColors.Accent,
                            activeTrackColor = BoxBoxNowColors.Accent,
                            inactiveTrackColor = BoxBoxNowColors.SystemGray5,
                        ),
                    )
                }

                // Orientation segmented
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("ORIENTACION", color = BoxBoxNowColors.SystemGray3, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(BoxBoxNowColors.SystemGray5),
                    ) {
                        OrientationLock.entries.forEach { lock ->
                            val selected = lock == orientation
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (selected) BoxBoxNowColors.Accent else Color.Transparent)
                                    .clickable { driverVM.setOrientationLock(lock) }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    lock.display,
                                    color = if (selected) Color.Black else Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }

                // Exit
                Button(
                    onClick = {
                        driverVM.saveConfig()
                        onExit()
                    },
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = BoxBoxNowColors.ErrorRed.copy(alpha = 0.15f),
                        contentColor = BoxBoxNowColors.ErrorRed,
                    ),
                    contentPadding = PaddingValues(vertical = 12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Salir", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                }
            }
        }
    }
}
