package com.boxboxnow.app.ui.config

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.vm.ConfigViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionConfigScreen(onBack: () -> Unit) {
    val vm: ConfigViewModel = hiltViewModel()
    val session by vm.session.collectAsState()
    val circuits by vm.circuits.collectAsState()
    val error by vm.errorMessage.collectAsState()
    val hasActive by vm.hasActiveSession.collectAsState()

    LaunchedEffect(Unit) {
        vm.loadSession()
        vm.loadCircuits()
    }

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text("Sesión", color = Color.White) },
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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Circuito", color = Color.White)
            var expanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                OutlinedTextField(
                    value = session.circuitName ?: "Selecciona...",
                    onValueChange = {},
                    readOnly = true,
                    modifier = Modifier.menuAnchor().fillMaxWidth(),
                )
                ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    circuits.forEach { c ->
                        DropdownMenuItem(
                            text = { Text(c.name) },
                            onClick = {
                                vm.updateSession { it.copy(circuitId = c.id, circuitName = c.name) }
                                expanded = false
                            },
                        )
                    }
                }
            }

            NumberField("Kart nº", session.ourKartNumber) { v ->
                vm.updateSession { it.copy(ourKartNumber = v) }
            }
            NumberField("Duración (min)", session.durationMin) { v ->
                vm.updateSession { it.copy(durationMin = v) }
            }
            NumberField("Mín pits", session.minPits) { v ->
                vm.updateSession { it.copy(minPits = v) }
            }
            NumberField("Tiempo pit (s)", session.pitTimeS) { v ->
                vm.updateSession { it.copy(pitTimeS = v) }
            }
            NumberField("Stint mín (min)", session.minStintMin) { v ->
                vm.updateSession { it.copy(minStintMin = v) }
            }
            NumberField("Stint máx (min)", session.maxStintMin) { v ->
                vm.updateSession { it.copy(maxStintMin = v) }
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            Button(
                onClick = { vm.saveSession() },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE10600)),
            ) {
                Text(if (hasActive) "Actualizar sesión" else "Crear sesión")
            }
        }
    }
}

@Composable
private fun NumberField(label: String, value: Int, onChange: (Int) -> Unit) {
    OutlinedTextField(
        value = value.toString(),
        onValueChange = { onChange(it.toIntOrNull() ?: 0) },
        label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}
