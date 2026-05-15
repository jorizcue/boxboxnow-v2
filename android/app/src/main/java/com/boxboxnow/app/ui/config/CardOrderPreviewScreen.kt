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
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
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
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.DriverViewModel

/**
 * Lets the user reorder the visible driver cards using up/down buttons,
 * with a 2-column grid preview of the resulting layout below. Mirrors iOS
 * `CardOrderPreviewView` (which uses `.onMove` + `EditButton`). Persists on
 * exit via `saveConfig()` and `pushPreferencesToServer()`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardOrderPreviewScreen(onBack: () -> Unit) {
    val driverVM: DriverViewModel = hiltViewModel()
    val visibleCards by driverVM.visibleCards.collectAsState()
    val cardOrder by driverVM.cardOrder.collectAsState()

    // Visible cards in the current order
    val orderedVisible: List<DriverCard> = cardOrder.mapNotNull { key ->
        if (visibleCards[key] == true) DriverCard.fromKey(key) else null
    }
    val hiddenKeys: List<String> = cardOrder.filter { key -> visibleCards[key] != true }

    fun moveVisible(from: Int, to: Int) {
        if (from == to || from !in orderedVisible.indices || to !in orderedVisible.indices) return
        val mutable = orderedVisible.map { it.key }.toMutableList()
        val item = mutable.removeAt(from)
        mutable.add(to, item)
        driverVM.reorderCards(mutable + hiddenKeys)
    }

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
                title = { Text(t("cardOrder.title"), color = Color.White) },
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
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .background(Color.Black),
        ) {
            // Sortable list (top half)
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (orderedVisible.isEmpty()) {
                    item {
                        Text(
                            t("cardOrder.empty"),
                            color = BoxBoxNowColors.SystemGray,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                }
                items(
                    items = orderedVisible,
                    key = { it.key },
                ) { card ->
                    val index = orderedVisible.indexOf(card)
                    OrderRow(
                        card = card,
                        canMoveUp = index > 0,
                        canMoveDown = index < orderedVisible.size - 1,
                        onMoveUp = { moveVisible(index, index - 1) },
                        onMoveDown = { moveVisible(index, index + 1) },
                    )
                }
            }

            // Divider
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(BoxBoxNowColors.SystemGray5),
            )

            // Mini preview (bottom, fixed height)
            Text(
                t("cardOrder.preview"),
                color = BoxBoxNowColors.SystemGray3,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.sp,
                modifier = Modifier.padding(start = 16.dp, top = 10.dp),
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                orderedVisible.chunked(2).forEach { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        row.forEach { card ->
                            PreviewCell(card = card, modifier = Modifier.weight(1f))
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun OrderRow(
    card: DriverCard,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(BoxBoxNowColors.SystemGray6)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(card.accent.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = card.iconMaterial,
                contentDescription = null,
                tint = card.accent,
                modifier = Modifier.size(16.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Text(
            t(card.labelKey),
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onMoveUp, enabled = canMoveUp) {
            Icon(
                Icons.Filled.ArrowUpward,
                contentDescription = t("cardOrder.moveUp"),
                tint = if (canMoveUp) BoxBoxNowColors.Accent else BoxBoxNowColors.SystemGray4,
            )
        }
        IconButton(onClick = onMoveDown, enabled = canMoveDown) {
            Icon(
                Icons.Filled.ArrowDownward,
                contentDescription = t("cardOrder.moveDown"),
                tint = if (canMoveDown) BoxBoxNowColors.Accent else BoxBoxNowColors.SystemGray4,
            )
        }
    }
}

@Composable
private fun PreviewCell(card: DriverCard, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(card.accent.copy(alpha = 0.12f))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = card.iconMaterial,
                contentDescription = null,
                tint = card.accent,
                modifier = Modifier.size(12.dp),
            )
            Spacer(Modifier.width(4.dp))
            Text(
                t(card.labelKey),
                color = Color.White,
                fontSize = 9.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
            )
        }
        Text(
            card.sampleValue,
            color = card.accent,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
    }
}
