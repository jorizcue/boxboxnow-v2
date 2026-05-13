package com.boxboxnow.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * BoxBoxNow palette.
 *
 * iOS UIColor.systemGray values are tuned for Apple's OLED rendering
 * and look noticeably brighter at the same hex on iPhone than on
 * Android (different gamma, no auto-vibrancy boost). To match the
 * perceived brightness of iOS on Android, the GRAY values used for
 * TEXT (systemGray, systemGray2, systemGray3) are bumped one step
 * up the brightness scale. The SURFACE values (systemGray4/5/6) stay
 * at the canonical iOS hex because they're used as backgrounds /
 * borders — bumping those would wash out the cards.
 *
 * Concrete mapping (canonical iOS → Android-adjusted):
 *   - systemGray  : #8E8E93 → #B0B0B5  (subtitles, helper text, chevrons)
 *   - systemGray2 : #636366 → #8A8A8F  (deep auxiliaries)
 *   - systemGray3 : #48484A → #6D6D72  (placeholders, footer hints)
 *   - systemGray4 : #3A3A3C            (borders — kept)
 *   - systemGray5 : #2C2C2E            (card outlines — kept)
 *   - systemGray6 : #1C1C1E            (card backgrounds — kept)
 *
 * Accent / Error / Warning / Success match iOS exactly.
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
    // Text-tier grays — brighter than canonical iOS hex so the
    // perceived contrast on Android matches what the iPhone shows.
    val SystemGray3 = Color(0xFF6D6D72)
    val SystemGray2 = Color(0xFF8A8A8F)
    val SystemGray = Color(0xFFB0B0B5)
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
    // onSurfaceVariant drives the colour of Material 3 helper text,
    // dropdown labels, and outlined-input placeholders. Bumped to a
    // near-pure off-white so form labels read crisply on the dark
    // card surfaces.
    onSurfaceVariant = Color(0xFFF2F2F4),
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
