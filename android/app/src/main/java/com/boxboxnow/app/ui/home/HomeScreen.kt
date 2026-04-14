package com.boxboxnow.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SportsMotorsports
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.vm.AuthViewModel
import com.boxboxnow.app.vm.ConfigViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    authVM: AuthViewModel,
    onOpenConfig: () -> Unit,
    onOpenDriver: () -> Unit,
) {
    val user by authVM.user.collectAsState()
    val configVM: ConfigViewModel = hiltViewModel()
    val session by configVM.session.collectAsState()
    val hasActiveSession by configVM.hasActiveSession.collectAsState()

    LaunchedEffect(Unit) { configVM.loadSession() }

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text("BoxBoxNow", fontWeight = FontWeight.Black, color = Color(0xFFE10600)) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Black),
                actions = {
                    IconButton(onClick = { authVM.fullSignOut() }) {
                        Icon(Icons.Default.Logout, contentDescription = "Salir", tint = Color.White)
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .background(Color.Black)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            user?.let {
                Text("Hola, ${it.username}", color = Color.White, fontSize = 18.sp)
            }

            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1C1C1C)),
                shape = RoundedCornerShape(16.dp),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        if (hasActiveSession) "Sesión activa" else "Sin sesión activa",
                        color = if (hasActiveSession) Color(0xFF4CAF50) else Color.Gray,
                        fontWeight = FontWeight.Bold,
                    )
                    session.circuitName?.let { Text("Circuito: $it", color = Color.White) }
                    if (session.ourKartNumber > 0) Text("Kart: ${session.ourKartNumber}", color = Color.White)
                    if (session.durationMin > 0) Text("Duración: ${session.durationMin} min", color = Color.White)
                }
            }

            Button(
                onClick = onOpenDriver,
                modifier = Modifier.fillMaxWidth().height(64.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE10600)),
            ) {
                Icon(Icons.Default.SportsMotorsports, contentDescription = null)
                Spacer(Modifier.width(12.dp))
                Text("Vista Piloto", fontSize = 20.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = onOpenConfig,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(16.dp),
            ) {
                Icon(Icons.Default.Settings, contentDescription = null, tint = Color.White)
                Spacer(Modifier.width(12.dp))
                Text("Configuración", color = Color.White, fontSize = 18.sp)
            }
        }
    }
}
