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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.models.DriverCard
import com.boxboxnow.app.models.DriverCardGroup
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.DriverViewModel
import com.boxboxnow.app.vm.OrientationLock

private const val TOTAL_STEPS = 4

/**
 * 4-step wizard for creating a new template preset.
 *   Step 1: Name
 *   Step 2: Card visibility (grouped toggles)
 *   Step 3: Card order (reorderable list)
 *   Step 4: Display options (contrast, orientation, audio) + save
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TemplateWizardScreen(onBack: () -> Unit) {
    val driverVM: DriverViewModel = hiltViewModel()

    var step by remember { mutableIntStateOf(1) }
    var templateName by remember { mutableStateOf("") }
    val visibleCards = remember { mutableStateMapOf<String, Boolean>().apply { putAll(DriverCard.defaultVisible) } }
    var cardOrder by remember { mutableStateOf(DriverCard.defaultOrder) }
    var contrast by remember { mutableDoubleStateOf(0.5) }
    var orientationLock by remember { mutableStateOf(OrientationLock.FREE) }
    var audioEnabled by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }

    val stepTitle = when (step) {
        1 -> "Nombre"
        2 -> "Tarjetas visibles"
        3 -> "Orden de tarjetas"
        4 -> "Opciones de pantalla"
        else -> ""
    }

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text("Nueva plantilla", color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = {
                        if (step > 1) step-- else onBack()
                    }) {
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
            // Step indicator
            StepIndicator(current = step, total = TOTAL_STEPS, label = stepTitle)

            // Step content
            when (step) {
                1 -> StepName(
                    name = templateName,
                    onNameChange = { templateName = it },
                    onNext = { if (templateName.trim().isNotEmpty()) step = 2 },
                )
                2 -> StepCardVisibility(
                    visibleCards = visibleCards,
                    onToggle = { key, checked -> visibleCards[key] = checked },
                    onBack = { step = 1 },
                    onNext = { step = 3 },
                )
                3 -> StepCardOrder(
                    visibleCards = visibleCards,
                    cardOrder = cardOrder,
                    onReorder = { cardOrder = it },
                    onBack = { step = 2 },
                    onNext = { step = 4 },
                )
                4 -> StepDisplayOptions(
                    contrast = contrast,
                    onContrastChange = { contrast = it },
                    orientationLock = orientationLock,
                    onOrientationChange = { orientationLock = it },
                    audioEnabled = audioEnabled,
                    onAudioChange = { audioEnabled = it },
                    saving = saving,
                    onBack = { step = 3 },
                    onSave = {
                        saving = true
                        driverVM.saveAsPresetWithOptions(
                            name = templateName.trim(),
                            visibleCards = visibleCards.toMap(),
                            cardOrder = cardOrder,
                            contrast = contrast,
                            orientation = orientationLock.raw,
                            audioEnabled = audioEnabled,
                            onSuccess = { onBack() },
                            onError = { saving = false },
                        )
                    },
                )
            }
        }
    }
}

// ── Step Indicator ──

@Composable
private fun StepIndicator(current: Int, total: Int, label: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (i in 1..total) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(
                            if (i <= current) BoxBoxNowColors.Accent
                            else BoxBoxNowColors.SystemGray4,
                        ),
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "Paso $current de $total — $label",
            color = BoxBoxNowColors.SystemGray,
            fontSize = 12.sp,
        )
    }
}

// ── Step 1: Name ──

@Composable
private fun StepName(
    name: String,
    onNameChange: (String) -> Unit,
    onNext: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            "Elige un nombre para tu plantilla",
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = name,
            onValueChange = onNameChange,
            label = { Text("Nombre de la plantilla") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = BoxBoxNowColors.Accent,
                unfocusedBorderColor = BoxBoxNowColors.SystemGray4,
                focusedLabelColor = BoxBoxNowColors.Accent,
                unfocusedLabelColor = BoxBoxNowColors.SystemGray,
                cursorColor = BoxBoxNowColors.Accent,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.weight(1f))
        WizardButton(
            text = "Siguiente",
            enabled = name.trim().isNotEmpty(),
            onClick = onNext,
        )
    }
}

// ── Step 2: Card Visibility ──

@Composable
private fun StepCardVisibility(
    visibleCards: Map<String, Boolean>,
    onToggle: (String, Boolean) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    val grouped: List<Pair<DriverCardGroup, List<DriverCard>>> =
        DriverCardGroup.entries.mapNotNull { group ->
            val cards = DriverCard.entries.filter { it.group == group }
            if (cards.isEmpty()) null else group to cards
        }

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            grouped.forEach { (group, cards) ->
                item(key = "section-${group.name}") {
                    Text(
                        group.label.uppercase(),
                        color = BoxBoxNowColors.SystemGray3,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.sp,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
                    )
                }
                items(cards, key = { "card-${it.key}" }) { card ->
                    WizardCardToggleRow(
                        card = card,
                        checked = visibleCards[card.key] ?: !card.requiresGPS,
                        onCheckedChange = { onToggle(card.key, it) },
                    )
                }
            }
            item { Spacer(Modifier.height(8.dp)) }
        }
        WizardNavButtons(
            onBack = onBack,
            onNext = onNext,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}

@Composable
private fun WizardCardToggleRow(
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
                card.display,
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

// ── Step 3: Card Order ──

@Composable
private fun StepCardOrder(
    visibleCards: Map<String, Boolean>,
    cardOrder: List<String>,
    onReorder: (List<String>) -> Unit,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    val orderedVisible: List<DriverCard> = cardOrder.mapNotNull { key ->
        if (visibleCards[key] == true) DriverCard.fromKey(key) else null
    }
    val hiddenKeys: List<String> = cardOrder.filter { key -> visibleCards[key] != true }

    fun moveVisible(from: Int, to: Int) {
        if (from == to || from !in orderedVisible.indices || to !in orderedVisible.indices) return
        val mutable = orderedVisible.map { it.key }.toMutableList()
        val item = mutable.removeAt(from)
        mutable.add(to, item)
        onReorder(mutable + hiddenKeys)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        if (orderedVisible.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "No hay tarjetas visibles. Vuelve al paso anterior para activar alguna.",
                    color = BoxBoxNowColors.SystemGray,
                    fontSize = 13.sp,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                itemsIndexed(orderedVisible, key = { _, card -> card.key }) { index, card ->
                    WizardOrderRow(
                        card = card,
                        canMoveUp = index > 0,
                        canMoveDown = index < orderedVisible.size - 1,
                        onMoveUp = { moveVisible(index, index - 1) },
                        onMoveDown = { moveVisible(index, index + 1) },
                    )
                }
                item { Spacer(Modifier.height(8.dp)) }
            }
        }
        WizardNavButtons(
            onBack = onBack,
            onNext = onNext,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}

@Composable
private fun WizardOrderRow(
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
            card.display,
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onMoveUp, enabled = canMoveUp) {
            Icon(
                Icons.Filled.ArrowUpward,
                contentDescription = "Subir",
                tint = if (canMoveUp) BoxBoxNowColors.Accent else BoxBoxNowColors.SystemGray4,
            )
        }
        IconButton(onClick = onMoveDown, enabled = canMoveDown) {
            Icon(
                Icons.Filled.ArrowDownward,
                contentDescription = "Bajar",
                tint = if (canMoveDown) BoxBoxNowColors.Accent else BoxBoxNowColors.SystemGray4,
            )
        }
    }
}

// ── Step 4: Display Options ──

@Composable
private fun StepDisplayOptions(
    contrast: Double,
    onContrastChange: (Double) -> Unit,
    orientationLock: OrientationLock,
    onOrientationChange: (OrientationLock) -> Unit,
    audioEnabled: Boolean,
    onAudioChange: (Boolean) -> Unit,
    saving: Boolean,
    onBack: () -> Unit,
    onSave: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        // Contrast slider
        Text(
            "CONTRASTE",
            color = BoxBoxNowColors.SystemGray3,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.sp,
        )
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(BoxBoxNowColors.SystemGray6)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Slider(
                value = contrast.toFloat(),
                onValueChange = { onContrastChange(it.toDouble()) },
                valueRange = 0f..1f,
                modifier = Modifier.weight(1f),
                colors = SliderDefaults.colors(
                    thumbColor = BoxBoxNowColors.Accent,
                    activeTrackColor = BoxBoxNowColors.Accent,
                    inactiveTrackColor = BoxBoxNowColors.SystemGray4,
                ),
            )
            Spacer(Modifier.width(12.dp))
            Text(
                "${(contrast * 100).toInt()}%",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }

        Spacer(Modifier.height(20.dp))

        // Orientation picker
        Text(
            "ORIENTACION",
            color = BoxBoxNowColors.SystemGray3,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.sp,
        )
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OrientationLock.entries.forEach { option ->
                val selected = orientationLock == option
                Button(
                    onClick = { onOrientationChange(option) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (selected) BoxBoxNowColors.Accent else BoxBoxNowColors.SystemGray6,
                        contentColor = if (selected) Color.Black else Color.White,
                    ),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    if (selected) {
                        Icon(
                            Icons.Filled.Check,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(
                        option.display,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // Audio toggle
        Text(
            "AUDIO",
            color = BoxBoxNowColors.SystemGray3,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.sp,
        )
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(BoxBoxNowColors.SystemGray6)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (audioEnabled) Icons.Filled.VolumeUp else Icons.Filled.VolumeOff,
                contentDescription = null,
                tint = if (audioEnabled) BoxBoxNowColors.Accent else BoxBoxNowColors.SystemGray,
                modifier = Modifier.size(24.dp),
            )
            Spacer(Modifier.width(12.dp))
            Text(
                if (audioEnabled) "Audio activado" else "Audio desactivado",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )
            Switch(
                checked = audioEnabled,
                onCheckedChange = onAudioChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = BoxBoxNowColors.Accent,
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = BoxBoxNowColors.SystemGray4,
                    uncheckedBorderColor = BoxBoxNowColors.SystemGray4,
                ),
            )
        }

        Spacer(Modifier.weight(1f))

        // Back button
        Button(
            onClick = onBack,
            colors = ButtonDefaults.buttonColors(
                containerColor = BoxBoxNowColors.SystemGray6,
                contentColor = Color.White,
            ),
            shape = RoundedCornerShape(12.dp),
            contentPadding = PaddingValues(vertical = 14.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Atras", fontWeight = FontWeight.SemiBold)
        }

        Spacer(Modifier.height(10.dp))

        // Save button (accent, matches iOS "ACTUALIZAR SESION" style)
        Button(
            onClick = onSave,
            enabled = !saving,
            colors = ButtonDefaults.buttonColors(
                containerColor = BoxBoxNowColors.Accent,
                contentColor = Color.Black,
                disabledContainerColor = BoxBoxNowColors.Accent.copy(alpha = 0.5f),
                disabledContentColor = Color.Black.copy(alpha = 0.5f),
            ),
            shape = RoundedCornerShape(12.dp),
            contentPadding = PaddingValues(vertical = 14.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                if (saving) "GUARDANDO..." else "GUARDAR PLANTILLA",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
            )
        }
    }
}

// ── Shared Wizard Components ──

@Composable
private fun WizardButton(
    text: String,
    enabled: Boolean = true,
    accent: Boolean = true,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (accent) BoxBoxNowColors.Accent else BoxBoxNowColors.SystemGray6,
            contentColor = if (accent) Color.Black else Color.White,
            disabledContainerColor = BoxBoxNowColors.SystemGray5,
            disabledContentColor = BoxBoxNowColors.SystemGray,
        ),
        shape = RoundedCornerShape(12.dp),
        contentPadding = PaddingValues(vertical = 14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun WizardNavButtons(
    onBack: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Button(
            onClick = onBack,
            colors = ButtonDefaults.buttonColors(
                containerColor = BoxBoxNowColors.SystemGray6,
                contentColor = Color.White,
            ),
            shape = RoundedCornerShape(12.dp),
            contentPadding = PaddingValues(vertical = 14.dp),
            modifier = Modifier.weight(1f),
        ) {
            Text("Atras", fontWeight = FontWeight.SemiBold)
        }
        Button(
            onClick = onNext,
            colors = ButtonDefaults.buttonColors(
                containerColor = BoxBoxNowColors.Accent,
                contentColor = Color.Black,
            ),
            shape = RoundedCornerShape(12.dp),
            contentPadding = PaddingValues(vertical = 14.dp),
            modifier = Modifier.weight(1f),
        ) {
            Text("Siguiente", fontWeight = FontWeight.SemiBold)
        }
    }
}
