package com.boxboxnow.app.ui.config

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.models.DriverConfigPreset
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.DriverViewModel

private const val MAX_PRESETS = 10

/**
 * Driver config presets manager. Mirrors iOS `PresetsView`:
 *   - Lists saved presets with selection checkmark
 *   - Swipe-to-delete becomes trash-icon button on Android
 *   - "Guardar configuracion actual" opens a name dialog
 *   - Capped at 10 presets
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PresetsScreen(onBack: () -> Unit) {
    val driverVM: DriverViewModel = hiltViewModel()
    val presets by driverVM.presets.collectAsState()
    val selectedId by driverVM.selectedPresetId.collectAsState()

    var showSaveDialog by remember { mutableStateOf(false) }
    var presetName by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf<DriverConfigPreset?>(null) }

    LaunchedEffect(Unit) { driverVM.loadPresets() }

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text("Plantillas", color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                            tint = Color.White,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Black),
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .background(Color.Black),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text(
                    "PLANTILLAS (${presets.size}/$MAX_PRESETS)",
                    color = BoxBoxNowColors.SystemGray3,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
                )
            }

            if (presets.isEmpty()) {
                item {
                    Text(
                        "No tienes plantillas guardadas. Usa el boton de abajo para guardar la configuracion actual.",
                        color = BoxBoxNowColors.SystemGray,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            } else {
                items(presets, key = { it.id }) { preset ->
                    PresetRow(
                        preset = preset,
                        selected = selectedId == preset.id,
                        onApply = { driverVM.applyPreset(preset) },
                        onDelete = { confirmDelete = preset },
                    )
                }
            }

            item { Spacer(Modifier.height(12.dp)) }

            item {
                Button(
                    onClick = { showSaveDialog = true },
                    enabled = presets.size < MAX_PRESETS,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = BoxBoxNowColors.Accent,
                        contentColor = Color.Black,
                        disabledContainerColor = BoxBoxNowColors.SystemGray5,
                        disabledContentColor = BoxBoxNowColors.SystemGray,
                    ),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(vertical = 14.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Guardar configuracion actual", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }

    // Save dialog
    if (showSaveDialog) {
        AlertDialog(
            onDismissRequest = {
                showSaveDialog = false
                presetName = ""
            },
            containerColor = BoxBoxNowColors.SystemGray6,
            titleContentColor = Color.White,
            textContentColor = Color.White,
            title = { Text("Guardar plantilla") },
            text = {
                OutlinedTextField(
                    value = presetName,
                    onValueChange = { presetName = it },
                    label = { Text("Nombre") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = BoxBoxNowColors.Accent,
                        unfocusedBorderColor = BoxBoxNowColors.SystemGray4,
                        focusedLabelColor = BoxBoxNowColors.Accent,
                        unfocusedLabelColor = BoxBoxNowColors.SystemGray,
                        cursorColor = BoxBoxNowColors.Accent,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val trimmed = presetName.trim()
                        if (trimmed.isNotEmpty()) {
                            driverVM.saveAsPreset(trimmed)
                            presetName = ""
                            showSaveDialog = false
                        }
                    },
                ) { Text("Guardar", color = BoxBoxNowColors.Accent) }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        presetName = ""
                        showSaveDialog = false
                    },
                ) { Text("Cancelar", color = BoxBoxNowColors.SystemGray) }
            },
        )
    }

    // Delete confirmation
    confirmDelete?.let { preset ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            containerColor = BoxBoxNowColors.SystemGray6,
            titleContentColor = Color.White,
            textContentColor = Color.White,
            title = { Text("Eliminar plantilla") },
            text = { Text("Quitar '${preset.name}'? Esta accion no se puede deshacer.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        driverVM.deletePreset(preset)
                        confirmDelete = null
                    },
                ) { Text("Eliminar", color = BoxBoxNowColors.ErrorRed) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = null }) {
                    Text("Cancelar", color = BoxBoxNowColors.SystemGray)
                }
            },
        )
    }
}

@Composable
private fun PresetRow(
    preset: DriverConfigPreset,
    selected: Boolean,
    onApply: () -> Unit,
    onDelete: () -> Unit,
) {
    val visibleCount = preset.visibleCards.count { it.value }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BoxBoxNowColors.SystemGray6)
            .clickable(onClick = onApply)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    preset.name,
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                if (preset.isDefault) {
                    Spacer(Modifier.width(6.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(BoxBoxNowColors.Accent.copy(alpha = 0.2f))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(
                            "DEFAULT",
                            color = BoxBoxNowColors.Accent,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
            Text(
                "$visibleCount tarjetas visibles",
                color = BoxBoxNowColors.SystemGray,
                fontSize = 11.sp,
            )
        }
        if (selected) {
            Icon(
                Icons.Filled.Check,
                contentDescription = "Seleccionado",
                tint = BoxBoxNowColors.Accent,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(4.dp))
        }
        IconButton(onClick = onDelete) {
            Icon(
                Icons.Filled.Delete,
                contentDescription = "Eliminar",
                tint = BoxBoxNowColors.ErrorRed,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
