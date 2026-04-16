package com.boxboxnow.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * BoxBoxNow palette — matches iOS:
 *   - Accent / primary: #41D238 (verde "radioactive")
 *   - Background: #000000 (full black, no gradients in base theme)
 *   - Card surface: #1C1C1E (UIColor.systemGray6 dark)
 *   - Card stroke: #2C2C2E (systemGray5 dark)
 *   - systemGray3: #48484A used for placeholder icons & dividers
 *   - systemGray2: #636366
 *   - systemGray: #8E8E93
 */
object BoxBoxNowColors {
    val Accent = Color(0xFF41D238)
    val AccentSoft = Color(0xFF41D238).copy(alpha = 0.25f)
    val Black = Color.Black
    val DarkBg1 = Color(0xFF0B100B)   // subtle gradient start (dark olive)
    val DarkBg2 = Color(0xFF050705)   // gradient end
    val SystemGray6 = Color(0xFF1C1C1E)
    val SystemGray5 = Color(0xFF2C2C2E)
    val SystemGray4 = Color(0xFF3A3A3C)
    val SystemGray3 = Color(0xFF48484A)
    val SystemGray2 = Color(0xFF636366)
    val SystemGray = Color(0xFF8E8E93)
    val ErrorRed = Color(0xFFFF453A)
    val WarningOrange = Color(0xFFFF9F0A)
    val SuccessGreen = Color(0xFF30D158)
}

private val DarkScheme = darkColorScheme(
    primary = BoxBoxNowColors.Accent,
    onPrimary = Color.Black,
    secondary = BoxBoxNowColors.Accent,
    onSecondary = Color.Black,
    background = Color.Black,
    onBackground = Color.White,
    surface = BoxBoxNowColors.SystemGray6,
    onSurface = Color.White,
    surfaceVariant = BoxBoxNowColors.SystemGray5,
    onSurfaceVariant = Color(0xFFE5E5E7),
    error = BoxBoxNowColors.ErrorRed,
    onError = Color.White,
    outline = BoxBoxNowColors.SystemGray4,
    outlineVariant = BoxBoxNowColors.SystemGray5,
)

@Composable
fun BoxBoxNowTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkScheme,
        typography = AppTypography,
        content = content,
    )
}
