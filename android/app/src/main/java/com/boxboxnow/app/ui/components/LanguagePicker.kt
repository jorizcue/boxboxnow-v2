package com.boxboxnow.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.boxboxnow.app.i18n.Language
import com.boxboxnow.app.i18n.LanguageStore
import com.boxboxnow.app.i18n.LocalLanguage

/**
 * Compact language switcher — a flag glyph that opens a DropdownMenu
 * with the five supported languages. Used in HomeScreen's TopAppBar
 * (and intended to also live in LoginScreen so the user can switch
 * idioma even before signing in).
 *
 * State source: `LanguageStore` (object singleton, backed by
 * SharedPreferences). Flipping the active language recomposes every
 * `t(key)` call site thanks to `LocalLanguage` CompositionLocal.
 */
@Composable
fun LanguagePicker(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val active = LocalLanguage.current
    var expanded by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        // Flag-only trigger — matches iOS's compact toolbar button.
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(Color.White.copy(alpha = 0.06f))
                .clickable { expanded = true }
                .padding(horizontal = 8.dp, vertical = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(active.flag, fontSize = 22.sp)
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            for (option in Language.entries) {
                DropdownMenuItem(
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("${option.flag}  ${option.label}", fontWeight = FontWeight.Medium)
                            Spacer(Modifier.weight(1f))
                            if (option == active) {
                                Spacer(Modifier.width(16.dp))
                                Icon(Icons.Default.Check, contentDescription = null)
                            }
                        }
                    },
                    onClick = {
                        LanguageStore.set(context, option)
                        expanded = false
                    },
                )
            }
        }
    }
}
