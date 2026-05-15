package com.boxboxnow.app.ui.config

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.i18n.t
import com.boxboxnow.app.models.DriverCard
import com.boxboxnow.app.models.DriverCardGroup
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.AuthViewModel
import com.boxboxnow.app.vm.DriverViewModel

/**
 * Shows a toggle for every `DriverCard`, grouped by `Carrera / BOX / GPS`.
 * Cards in the BOX group are hidden entirely for users without the
 * `app-config-box` permission. Saves on exit. Mirrors iOS `CardVisibilityView`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardVisibilityScreen(onBack: () -> Unit) {
    val driverVM: DriverViewModel = hiltViewModel()
    val authVM: AuthViewModel = hiltViewModel()

    val visible by driverVM.visibleCards.collectAsState()
    val user by authVM.user.collectAsState()

    val canShowBox = user?.isAdmin == true ||
        user?.tabAccess?.contains("app-config-box") == true

    // Plan-aware allow-list: only show cards the user's active
    // subscription exposes via ProductTabConfig.allowed_cards
    // (resolved server-side). Empty / null => no opinion, fall back
    // to the full catalog so admins / trial users / older builds
    // don't end up with an empty editor.
    val allowed: Set<String>? = user?.allowedCards
        ?.takeIf { it.isNotEmpty() }
        ?.toSet()

    val grouped: List<Pair<DriverCardGroup, List<DriverCard>>> =
        DriverCardGroup.entries.mapNotNull { group ->
            if (!canShowBox && group == DriverCardGroup.BOX) return@mapNotNull null
            // Use sortedByGroupAndName so cards appear alphabetically within each group
            val cards = DriverCard.sortedByGroupAndName
                .filter { it.group == group }
                .filter { allowed == null || allowed.contains(it.key) }
            if (cards.isEmpty()) null else group to cards
        }

    // Save on screen exit — matches iOS `.onDisappear { driverVM.saveConfig() }`
    DisposableEffect(Unit) {
        onDispose {
            driverVM.saveConfig()
            driverVM.pushPreferencesToServer()
        }
    }

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text("Tarjetas visibles", color = Color.White) },
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
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            grouped.forEach { (group, cards) ->
                item(key = "section-${group.name}") {
                    Text(
                        group.label.uppercase(),
                        color = BoxBoxNowColors.SystemGray3,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.sp,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
                    )
                }
                items(cards, key = { "card-${it.key}" }) { card ->
                    CardToggleRow(
                        card = card,
                        checked = visible[card.key] ?: !card.requiresGPS,
                        onCheckedChange = { driverVM.toggleCard(card.key, it) },
                    )
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun CardToggleRow(
    card: DriverCard,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BoxBoxNowColors.SystemGray6)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(card.accent.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = card.iconMaterial,
                contentDescription = null,
                tint = card.accent,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                t(card.labelKey),
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            if (card.requiresGPS) {
                Text(
                    "Requiere GPS / RaceBox",
                    color = BoxBoxNowColors.SystemGray,
                    fontSize = 11.sp,
                )
            }
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = BoxBoxNowColors.Accent,
                uncheckedThumbColor = Color.White,
                uncheckedTrackColor = BoxBoxNowColors.SystemGray4,
                uncheckedBorderColor = BoxBoxNowColors.SystemGray4,
            ),
        )
    }
}
