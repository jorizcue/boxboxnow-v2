package com.boxboxnow.app.ui.config

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.ConfigViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionConfigScreen(onBack: () -> Unit) {
    val vm: ConfigViewModel = hiltViewModel()
    val session by vm.session.collectAsState()
    val circuits by vm.circuits.collectAsState()
    val error by vm.errorMessage.collectAsState()
    val hasActive by vm.hasActiveSession.collectAsState()

    var saving by remember { mutableStateOf(false) }
    var showSaved by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        vm.loadSession()
        vm.loadCircuits()
    }

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text("Sesion de carrera", color = Color.White) },
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
            // ── Circuit picker ──
            if (circuits.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        "CIRCUITO",
                        color = BoxBoxNowColors.SystemGray,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.sp,
                    )
                    var expanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(
                        expanded = expanded,
                        onExpandedChange = { expanded = it },
                        // Full-width so the anchor (and the dropdown that
                        // inherits its width) spans the whole column.
                        // Without this the dropdown shrinks to fit just
                        // the current label, making it look tiny on the
                        // form.
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(BoxBoxNowColors.SystemGray6)
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                session.circuitName ?: "Seleccionar",
                                color = Color.White,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text("⌃", color = BoxBoxNowColors.SystemGray, fontSize = 12.sp)
                        }
                        ExposedDropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false },
                            containerColor = BoxBoxNowColors.SystemGray6,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            circuits.forEach { c ->
                                DropdownMenuItem(
                                    text = { Text(c.name, color = Color.White) },
                                    onClick = {
                                        vm.updateSession { it.copy(circuitId = c.id, circuitName = c.name) }
                                        expanded = false
                                    },
                                )
                            }
                        }
                    }
                }
            }

            // ── Section: Carrera ──
            ConfigSection(title = "CARRERA", icon = Icons.Default.Flag) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    NumberCard(
                        title = "NUESTRO KART",
                        value = session.ourKartNumber,
                        accent = true,
                        tooltip = "Numero del kart de tu equipo",
                        onValueChange = { vm.updateSession { s -> s.copy(ourKartNumber = it) } },
                        modifier = Modifier.weight(1f),
                    )
                    NumberCard(
                        title = "DURACION (MIN)",
                        value = session.durationMin,
                        tooltip = "Duracion total de la carrera en minutos",
                        onValueChange = { vm.updateSession { s -> s.copy(durationMin = it) } },
                        modifier = Modifier.weight(1f),
                    )
                    NumberCard(
                        title = "PITS MINIMOS",
                        value = session.minPits,
                        tooltip = "Paradas obligatorias minimas segun reglamento",
                        onValueChange = { vm.updateSession { s -> s.copy(minPits = it) } },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // ── Section: Pit Stops ──
            ConfigSection(title = "PIT STOPS", icon = Icons.Default.Build) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    NumberCard(
                        title = "TIEMPO PIT (S)",
                        value = session.pitTimeS,
                        tooltip = "Segundos que tardas en hacer una parada en boxes",
                        onValueChange = { vm.updateSession { s -> s.copy(pitTimeS = it) } },
                        modifier = Modifier.weight(1f),
                    )
                    NumberCard(
                        title = "PIT CERRADO\nINICIO (MIN)",
                        value = session.pitClosedStartMin,
                        tooltip = "Minuto en el que se cierra la ventana de pit",
                        onValueChange = { vm.updateSession { s -> s.copy(pitClosedStartMin = it) } },
                        modifier = Modifier.weight(1f),
                    )
                    NumberCard(
                        title = "PIT CERRADO\nFINAL (MIN)",
                        value = session.pitClosedEndMin,
                        tooltip = "Minuto en el que se reabre la ventana de pit",
                        onValueChange = { vm.updateSession { s -> s.copy(pitClosedEndMin = it) } },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // ── Section: Stints y Pilotos ──
            ConfigSection(title = "STINTS Y PILOTOS", icon = Icons.Default.People) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    NumberCard(
                        title = "STINT MIN (MIN)",
                        value = session.minStintMin,
                        tooltip = "Tiempo minimo que un piloto debe estar en pista",
                        onValueChange = { vm.updateSession { s -> s.copy(minStintMin = it) } },
                        modifier = Modifier.weight(1f),
                    )
                    NumberCard(
                        title = "STINT MAX (MIN)",
                        value = session.maxStintMin,
                        tooltip = "Tiempo maximo que un piloto puede estar en pista",
                        onValueChange = { vm.updateSession { s -> s.copy(maxStintMin = it) } },
                        modifier = Modifier.weight(1f),
                    )
                    NumberCard(
                        title = "TIEMPO MIN\nPILOTO (MIN)",
                        value = session.minDriverTimeMin,
                        tooltip = "Tiempo minimo total que cada piloto debe conducir",
                        onValueChange = { vm.updateSession { s -> s.copy(minDriverTimeMin = it) } },
                        modifier = Modifier.weight(1f),
                    )
                }
                // Pilot count goes in a second row — adding it as a 4th card
                // to the row above crowded the phone width and the new card
                // ended up cropped off-screen. 1/3 width with 2 spacers
                // keeps it visually aligned with the cards above.
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    NumberCard(
                        title = "PILOTOS\nDEL EQUIPO",
                        value = session.teamDriversCount,
                        tooltip = "Numero de pilotos del equipo. 0 = automatico segun Apex.",
                        onValueChange = { vm.updateSession { s -> s.copy(teamDriversCount = it) } },
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    Spacer(modifier = Modifier.weight(1f))
                }
            }

            // ── Error ──
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }

            // ── Save button (matches iOS style) ──
            Button(
                onClick = {
                    saving = true
                    vm.saveSession()
                    saving = false
                    showSaved = true
                },
                enabled = !saving,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (showSaved) BoxBoxNowColors.SuccessGreen else BoxBoxNowColors.Accent,
                    contentColor = Color.Black,
                ),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(
                    if (showSaved) "GUARDADO ✓" else "ACTUALIZAR SESION",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                )
            }

            // Reset saved state after delay
            LaunchedEffect(showSaved) {
                if (showSaved) {
                    kotlinx.coroutines.delay(2000)
                    showSaved = false
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

// ── Section header (icon + title) ──

@Composable
private fun ConfigSection(
    title: String,
    icon: ImageVector,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(start = 4.dp),
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = BoxBoxNowColors.Accent,
                modifier = Modifier.size(13.dp),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                title,
                color = BoxBoxNowColors.SystemGray2,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
            )
        }
        content()
    }
}

// ── Number card (matches iOS NumberCard) ──

@Composable
private fun NumberCard(
    title: String,
    value: Int,
    onValueChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    accent: Boolean = false,
    tooltip: String? = null,
) {
    var text by remember(value) { mutableStateOf(value.toString()) }
    var showTooltip by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current

    val borderColor = if (accent) BoxBoxNowColors.Accent.copy(alpha = 0.5f) else BoxBoxNowColors.SystemGray4

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(BoxBoxNowColors.SystemGray6)
            .border(1.5.dp, borderColor, RoundedCornerShape(10.dp))
            .padding(vertical = 14.dp, horizontal = 8.dp),
    ) {
        // Title row with optional info icon
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            // `minLines = 2` reserves two lines of vertical space even for
            // single-line titles ("NUESTRO KART") so every card in the grid
            // ends up the same height — without it the rows whose titles
            // wrap to 2 lines (e.g. "PIT CERRADO\nFINAL (MIN)") were taller
            // than the rest.
            Text(
                title,
                color = BoxBoxNowColors.SystemGray,
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                lineHeight = 11.sp,
                minLines = 2,
                maxLines = 2,
            )
            if (tooltip != null) {
                Spacer(Modifier.width(2.dp))
                IconButton(
                    onClick = { showTooltip = true },
                    modifier = Modifier.size(14.dp),
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = "Info",
                        tint = BoxBoxNowColors.SystemGray3,
                        modifier = Modifier.size(10.dp),
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // Editable number value
        BasicTextField(
            value = text,
            onValueChange = { newText ->
                val filtered = newText.filter { it.isDigit() }
                text = filtered
                filtered.toIntOrNull()?.let { onValueChange(it) }
            },
            textStyle = TextStyle(
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = if (accent) BoxBoxNowColors.Accent else Color.White,
                textAlign = TextAlign.Center,
            ),
            singleLine = true,
            cursorBrush = SolidColor(BoxBoxNowColors.Accent),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { state ->
                    if (!state.isFocused) {
                        // Restore value if empty
                        if (text.isBlank()) text = value.toString()
                    }
                },
        )
    }

    // Tooltip dialog
    if (showTooltip && tooltip != null) {
        AlertDialog(
            onDismissRequest = { showTooltip = false },
            containerColor = BoxBoxNowColors.SystemGray6,
            titleContentColor = Color.White,
            textContentColor = Color.White,
            title = { Text(title.replace("\n", " ")) },
            text = { Text(tooltip) },
            confirmButton = {
                TextButton(onClick = { showTooltip = false }) {
                    Text("OK", color = BoxBoxNowColors.Accent)
                }
            },
        )
    }
}
