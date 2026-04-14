package com.boxboxnow.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkScheme = darkColorScheme(
    primary = Color(0xFFE10600),          // F1-style red accent
    onPrimary = Color.White,
    secondary = Color(0xFF2196F3),
    onSecondary = Color.White,
    background = Color.Black,
    onBackground = Color.White,
    surface = Color(0xFF111111),
    onSurface = Color.White,
    surfaceVariant = Color(0xFF1C1C1C),
    onSurfaceVariant = Color(0xFFE0E0E0),
    error = Color(0xFFFF1744),
    onError = Color.White,
)

@Composable
fun BoxBoxNowTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = DarkScheme,
        typography = MaterialTheme.typography,
        content = content,
    )
}
