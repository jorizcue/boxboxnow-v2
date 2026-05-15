package com.boxboxnow.app.ui.config

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.SwapVert
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.boxboxnow.app.i18n.t
import com.boxboxnow.app.models.DriverCard
import com.boxboxnow.app.models.DriverCardGroup
import com.boxboxnow.app.models.DriverConfigPreset
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.DriverViewModel
import com.boxboxnow.app.vm.OrientationLock
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyGridState

private const val TOTAL_STEPS = 4

/**
 * 4-step wizard for creating or editing a template preset.
 *   Step 1: Name
 *   Step 2: Card visibility (grouped toggles)
 *   Step 3: Card order (reorderable list)
 *   Step 4: Display options (contrast, orientation, audio) + save
 *
 * When [editPresetId] is provided the wizard opens in **edit** mode:
 * fields are pre-populated from the existing preset and save calls
 * `updatePresetWithOptions` instead of `createPreset`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TemplateWizardScreen(onBack: () -> Unit, editPresetId: Int? = null) {
    val driverVM: DriverViewModel = hiltViewModel()
    val authVM: com.boxboxnow.app.vm.AuthViewModel = hiltViewModel()
    val presets by driverVM.presets.collectAsState()
    val user by authVM.user.collectAsState()
    val editingPreset: DriverConfigPreset? = editPresetId?.let { id -> presets.firstOrNull { it.id == id } }
    val isEditMode = editPresetId != null
    // Plan-aware whitelist surfaced by /auth/me. Null / empty list =>
    // fall back to the full catalog so admins / trial users see every
    // card while the backend resolution hasn't matched their plan.
    val allowedCards: Set<String>? = user?.allowedCards
        ?.takeIf { it.isNotEmpty() }
        ?.toSet()

    var step by remember { mutableIntStateOf(1) }
    var templateName by remember { mutableStateOf("") }
    val visibleCards = remember { mutableStateMapOf<String, Boolean>().apply { putAll(DriverCard.defaultVisible) } }
    var cardOrder by remember { mutableStateOf(DriverCard.defaultOrder) }
    var contrast by remember { mutableDoubleStateOf(0.5) }
    var orientationLock by remember { mutableStateOf(OrientationLock.FREE) }
    var audioEnabled by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var initialized by remember { mutableStateOf(editPresetId == null) }

    // In edit mode, load presets and populate local state once available
    LaunchedEffect(editPresetId) {
        if (editPresetId != null) driverVM.loadPresets()
    }
    LaunchedEffect(presets, editPresetId) {
        if (!initialized && editPresetId != null) {
            val preset = presets.firstOrNull { it.id == editPresetId } ?: return@LaunchedEffect
            templateName = preset.name
            visibleCards.clear()
            visibleCards.putAll(preset.visibleCards)
            cardOrder = preset.cardOrder
            contrast = preset.contrast ?: 0.5
            orientationLock = OrientationLock.from(preset.orientation)
            audioEnabled = preset.audioEnabled ?: true

            // Stale presets (saved before newer DriverCard entries
            // existed) don't carry the new keys in cardOrder. The
            // step-3 reorder grid iterates cardOrder, so without this
            // migration any card added after the preset's snapshot
            // would silently never show in the wizard preview even
            // when the user toggles it on in step 2.
            val allKeys = DriverCard.entries.map { it.key }
            val missing = allKeys.filterNot { it in cardOrder }
            if (missing.isNotEmpty()) {
                cardOrder = cardOrder + missing
                for (key in missing) {
                    if (visibleCards[key] == null) {
                        DriverCard.fromKey(key)?.let { visibleCards[key] = !it.requiresGPS }
                    }
                }
            }
            initialized = true
        }
    }

    val stepTitle = when (step) {
        1 -> t("wizard.stepName")
        2 -> t("wizard.stepVisibility")
        3 -> t("wizard.stepOrder")
        4 -> t("wizard.stepOptions")
        else -> ""
    }

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text(if (isEditMode) t("wizard.titleEdit") else t("wizard.titleNew"), color = Color.White) },
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
                    allowedCards = allowedCards,
                )
                3 -> StepCardOrder(
                    visibleCards = visibleCards,
                    cardOrder = cardOrder,
                    onReorder = { cardOrder = it },
                    orientationLock = orientationLock,
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
                    saveLabel = if (isEditMode) t("wizard.updateTemplate") else t("wizard.saveTemplate"),
                    onBack = { step = 3 },
                    onSave = {
                        saving = true
                        if (editingPreset != null) {
                            driverVM.updatePresetWithOptions(
                                id = editingPreset.id,
                                name = templateName.trim(),
                                visibleCards = visibleCards.toMap(),
                                cardOrder = cardOrder,
                                contrast = contrast,
                                orientation = orientationLock.raw,
                                audioEnabled = audioEnabled,
                                onSuccess = { onBack() },
                                onError = { saving = false },
                            )
                        } else {
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
                        }
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
            t("wizard.progress", "current" to "$current", "total" to "$total", "label" to label),
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
            t("wizard.namePrompt"),
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = name,
            onValueChange = onNameChange,
            label = { Text(t("wizard.nameLabel")) },
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
            text = t("common.next"),
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
    allowedCards: Set<String>? = null,
) {
    val grouped: List<Pair<DriverCardGroup, List<DriverCard>>> =
        DriverCardGroup.entries.mapNotNull { group ->
            val cards = DriverCard.entries
                .filter { it.group == group }
                .filter { allowedCards == null || allowedCards.contains(it.key) }
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
                    t("wizard.requiresGps"),
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

// ── Step 3: Card Order (iOS-matching 2-column grid preview) ──

@Composable
private fun StepCardOrder(
    visibleCards: Map<String, Boolean>,
    cardOrder: List<String>,
    onReorder: (List<String>) -> Unit,
    orientationLock: OrientationLock,
    onBack: () -> Unit,
    onNext: () -> Unit,
) {
    // Preview-grid column count must match what the pilot will see in
    // the actual DriverScreen (see DriverScreen.kt::CardsGrid):
    //   PORTRAIT → 2 columns
    //   LANDSCAPE → 3 columns
    //   FREE → default to 3 (race usage is overwhelmingly landscape).
    // Before this fix the preview was hard-coded to 2 cols, so a
    // landscape preset showed 3 rows × 2 in the wizard but rendered
    // 2 rows × 3 once saved — confusing for the operator.
    val previewCols = when (orientationLock) {
        OrientationLock.PORTRAIT -> 2
        OrientationLock.LANDSCAPE -> 3
        OrientationLock.FREE -> 3
    }
    val orderedVisible: List<DriverCard> = cardOrder.mapNotNull { key ->
        if (visibleCards[key] == true) DriverCard.fromKey(key) else null
    }
    val hiddenKeys: List<String> = cardOrder.filter { key -> visibleCards[key] != true }
    var selectedIndex by remember { mutableStateOf<Int?>(null) }

    /** Swap two cells (used by the legacy "tap one then tap another"
     *  fallback path for users that don't discover the drag handle). */
    fun swapCards(from: Int, to: Int) {
        val mutable = orderedVisible.map { it.key }.toMutableList()
        val temp = mutable[from]
        mutable[from] = mutable[to]
        mutable[to] = temp
        onReorder(mutable + hiddenKeys)
        selectedIndex = null
    }

    /** Drag-and-drop reorder — moves the card at `from` to `to`,
     *  shifting everything in between (NOT a swap). This is the path
     *  the new reorderable handle takes. */
    fun moveCard(from: Int, to: Int) {
        if (from == to) return
        val mutable = orderedVisible.map { it.key }.toMutableList()
        if (from !in mutable.indices || to !in mutable.indices) return
        mutable.add(to, mutable.removeAt(from))
        onReorder(mutable + hiddenKeys)
    }

    val gridState = rememberLazyGridState()
    val reorderableGridState = rememberReorderableLazyGridState(gridState) { from, to ->
        // ReorderableLazyGridState fires `onMove` continuously while
        // the user is dragging, with from/to expressed in absolute
        // LazyGrid indices. Since every grid item maps 1:1 to a visible
        // card, the index IS the position in `orderedVisible`.
        moveCard(from.index, to.index)
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
                    t("wizard.emptyVisible"),
                    color = BoxBoxNowColors.SystemGray,
                    fontSize = 13.sp,
                )
            }
        } else {
            // Hint text — adapts based on whether the user has tapped a
            // card (then they're in swap mode) or not (idle: show the
            // long-press drag hint).
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(
                    Icons.Filled.SwapVert,
                    contentDescription = null,
                    tint = if (selectedIndex != null) BoxBoxNowColors.Accent
                           else BoxBoxNowColors.SystemGray,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = if (selectedIndex != null)
                        t("wizard.swapHint")
                    else
                        t("wizard.dragHint"),
                    color = if (selectedIndex != null) BoxBoxNowColors.Accent
                            else BoxBoxNowColors.SystemGray,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                )
            }

            // Grid columns adapt to the orientation the operator
            // picked in step 4 (or the default). See `previewCols`
            // above for the mapping.
            LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Fixed(previewCols),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(
                    count = orderedVisible.size,
                    key = { orderedVisible[it].key },
                ) { index ->
                    val card = orderedVisible[index]
                    ReorderableItem(reorderableGridState, key = card.key) { isDragging ->
                        CardPreviewCell(
                            card = card,
                            isSelected = selectedIndex == index,
                            isDragging = isDragging,
                            // Long-press anywhere on the cell starts a
                            // drag — Compose's `longPressDraggableHandle`
                            // is what enables the long-press gesture
                            // recogniser provided by the reorderable
                            // scope, so the user doesn't need a tiny
                            // drag-handle icon to find.
                            dragModifier = Modifier.longPressDraggableHandle(),
                            onClick = {
                                val sel = selectedIndex
                                if (sel != null && sel != index) {
                                    swapCards(sel, index)
                                } else {
                                    selectedIndex = if (sel == index) null else index
                                }
                            },
                        )
                    }
                }
            }
        }
        WizardNavButtons(
            onBack = onBack,
            onNext = onNext,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}

/**
 * Card preview cell matching iOS `CardPreviewCell`:
 *   - Colored border (card accent at 50% opacity)
 *   - Background tinted with card accent at 10% opacity
 *   - Card title (small gray) + sample value (large monospaced white)
 */
@Composable
private fun CardPreviewCell(
    card: DriverCard,
    isSelected: Boolean,
    onClick: () -> Unit,
    isDragging: Boolean = false,
    /** Modifier supplied by the surrounding ReorderableItem (carries
     *  the long-press drag gesture detector). Falls back to a no-op
     *  for non-reorderable contexts. */
    dragModifier: Modifier = Modifier,
) {
    val borderColor = when {
        isDragging -> card.accent
        isSelected -> card.accent
        else -> card.accent.copy(alpha = 0.5f)
    }
    val borderWidth = if (isSelected || isDragging) 2.5.dp else 1.5.dp
    // Slightly stronger tint while dragging so the floating card is
    // visually clear above the grid.
    val bgAlpha = if (isDragging) 0.22f else 0.10f

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier
            .fillMaxWidth()
            .height(120.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(card.accent.copy(alpha = bgAlpha))
            .border(borderWidth, borderColor, RoundedCornerShape(10.dp))
            .then(dragModifier)
            .clickable(onClick = onClick)
            .padding(6.dp),
    ) {
        Text(
            card.display,
            color = BoxBoxNowColors.SystemGray,
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            lineHeight = 13.sp,
            maxLines = 2,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            card.sampleValue,
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
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
    saveLabel: String = "GUARDAR PLANTILLA",
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
            t("wizard.contrast"),
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
            t("wizard.orientation"),
            color = BoxBoxNowColors.SystemGray3,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.sp,
        )
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
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
                    // Tighter horizontal padding gives ~14 dp more
                    // room per button — enough for "Horizontal" at
                    // 13.sp to fit without truncating on phones in
                    // portrait. The selected-state visual cue is the
                    // accent fill colour, so the trailing check icon
                    // is redundant and was stealing the chars.
                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 10.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        option.display,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // Audio toggle
        Text(
            t("wizard.audio"),
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
                if (audioEnabled) t("wizard.audioOn") else t("wizard.audioOff"),
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
            Text(t("common.back"), fontWeight = FontWeight.SemiBold)
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
                if (saving) t("common.saving") else saveLabel,
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
            Text(t("common.back"), fontWeight = FontWeight.SemiBold)
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
            Text(t("common.next"), fontWeight = FontWeight.SemiBold)
        }
    }
}
