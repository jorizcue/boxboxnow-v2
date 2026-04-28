package com.boxboxnow.app.ui.driver

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Full-screen flashing red overlay triggered when the box dashboard sends a
 * "call to box" event. Tap anywhere to dismiss. Mirrors iOS `BoxCallOverlay`.
 */
@Composable
fun BoxCallOverlay(onDismiss: () -> Unit) {
    // Pulse alpha between 1.0 and 0.3 every 0.5s; auto-dismiss after 5 s
    var flash by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        flash = true
        delay(5_000)
        onDismiss()
    }

    val alpha by animateFloatAsState(
        targetValue = if (flash) 1f else 0.3f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 500),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "boxCallFlash",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFFF0000).copy(alpha = alpha))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onDismiss,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                "BOX",
                color = Color.White,
                fontSize = 120.sp,
                fontWeight = FontWeight.Black,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                "Toca para cerrar",
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 14.sp,
            )
            Text(
                "Se cierra automáticamente",
                color = Color.White.copy(alpha = 0.4f),
                fontSize = 11.sp,
            )
        }
    }
}
