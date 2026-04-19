package com.boxboxnow.app.ui.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import com.boxboxnow.app.ui.theme.InterFontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.models.RaceSession
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.AuthViewModel
import com.boxboxnow.app.vm.ConfigViewModel
import com.boxboxnow.app.vm.RaceViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    authVM: AuthViewModel,
    onOpenConfig: () -> Unit,
    onOpenDriver: () -> Unit,
    onOpenSession: () -> Unit = onOpenConfig,
) {
    val configVM: ConfigViewModel = hiltViewModel()
    val raceVM: RaceViewModel = hiltViewModel()
    val user by authVM.user.collectAsState()
    val session by configVM.session.collectAsState()
    val circuits by configVM.circuits.collectAsState()
    val isConnected by raceVM.isConnected.collectAsState()

    LaunchedEffect(Unit) {
        configVM.loadSession()
        configVM.loadCircuits()
    }

    val hasSession = session.ourKartNumber > 0 && session.durationMin > 0

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(RoundedCornerShape(50))
                                .background(if (isConnected) BoxBoxNowColors.SuccessGreen else BoxBoxNowColors.SystemGray4),
                        )
                        Spacer(Modifier.width(6.dp))
                        Icon(
                            Icons.Default.Person,
                            contentDescription = null,
                            tint = BoxBoxNowColors.Accent,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            user?.username ?: "",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Black),
                actions = {
                    // Full sign-out wipes the local token + biometric AND
                    // tells the server to delete the DeviceSession so the
                    // admin "Sesiones activas" panel reflects the exit.
                    // Previously this called `logout()`, which only reset
                    // in-memory state and left the server session alive —
                    // users reported stale mobile sessions lingering after
                    // they closed the app.
                    TextButton(onClick = { authVM.fullSignOut() }) {
                        Text("Salir", color = BoxBoxNowColors.ErrorRed, fontWeight = FontWeight.SemiBold)
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Spacer(Modifier.height(12.dp))

            // Branding
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row {
                    Text("BB", fontSize = 48.sp, fontWeight = FontWeight.Black, color = Color.White, fontFamily = InterFontFamily)
                    Text("N", fontSize = 48.sp, fontWeight = FontWeight.Black, color = BoxBoxNowColors.Accent, fontFamily = InterFontFamily)
                }
                Row {
                    Text("BOXBOX", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Text("NOW", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = BoxBoxNowColors.Accent)
                }
                Text(
                    "ESTRATEGIA DE KARTING EN TIEMPO REAL",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 1.5.sp,
                    color = BoxBoxNowColors.SystemGray,
                )
            }

            // Session summary or warning — tap to go to session config
            if (hasSession) {
                Box(modifier = Modifier.clickable(onClick = onOpenSession)) {
                    SessionSummaryCard(session, circuits.map { it.id to it.name }.toMap())
                }
            } else {
                NoSessionCard()
            }

            // Action cards
            HomeCard(
                icon = Icons.Default.Settings,
                title = "Configuración",
                subtitle = "Carrera, Plantillas, GPS",
                onClick = onOpenConfig,
            )
            HomeCard(
                icon = Icons.Default.Speed,
                title = "Vista Piloto",
                subtitle = if (hasSession)
                    "Kart #${session.ourKartNumber} · ${session.durationMin} min"
                else "Pantalla completa",
                accentBorder = true,
                onClick = onOpenDriver,
            )

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SessionSummaryCard(session: RaceSession, circuitNames: Map<Int, String>) {
    val circuitName = session.circuitId?.let { circuitNames[it] } ?: session.circuitName ?: "Sin circuito"
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BoxBoxNowColors.SystemGray6)
            .border(1.dp, BoxBoxNowColors.Accent.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "SESIÓN ACTIVA",
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                color = BoxBoxNowColors.Accent,
            )
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.Flag, contentDescription = null, tint = BoxBoxNowColors.SystemGray3, modifier = Modifier.size(14.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            InfoPill(label = "KART", value = "#${session.ourKartNumber}", accent = true, modifier = Modifier.weight(1f))
            InfoPill(label = "DURACIÓN", value = "${session.durationMin} min", modifier = Modifier.weight(1f))
            InfoPill(label = "PITS", value = session.minPits.toString(), modifier = Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            InfoPill(label = "CIRCUITO", value = circuitName, modifier = Modifier.weight(1f))
            InfoPill(label = "MAX STINT", value = "${session.maxStintMin} min", modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun InfoPill(label: String, value: String, modifier: Modifier = Modifier, accent: Boolean = false) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, fontSize = 8.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp, color = BoxBoxNowColors.SystemGray3)
        Text(
            value,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = if (accent) BoxBoxNowColors.Accent else Color.White,
            maxLines = 1,
        )
    }
}

@Composable
private fun NoSessionCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BoxBoxNowColors.WarningOrange.copy(alpha = 0.08f))
            .border(1.dp, BoxBoxNowColors.WarningOrange.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(Icons.Default.WarningAmber, contentDescription = null, tint = BoxBoxNowColors.WarningOrange, modifier = Modifier.size(28.dp))
        Text("Configura la sesión antes de entrar", color = BoxBoxNowColors.WarningOrange, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Text("Necesitas definir al menos el kart y la duración", color = BoxBoxNowColors.SystemGray3, fontSize = 11.sp)
    }
}

@Composable
private fun HomeCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    accentBorder: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(BoxBoxNowColors.SystemGray6)
            .then(
                if (accentBorder)
                    Modifier.border(BorderStroke(1.dp, BoxBoxNowColors.Accent.copy(alpha = 0.25f)), RoundedCornerShape(16.dp))
                else Modifier,
            )
            .clickable(onClick = onClick)
            .padding(20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = BoxBoxNowColors.Accent, modifier = Modifier.size(32.dp))
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = BoxBoxNowColors.SystemGray, fontSize = 13.sp)
        }
        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = BoxBoxNowColors.SystemGray, modifier = Modifier.size(20.dp))
    }
}
