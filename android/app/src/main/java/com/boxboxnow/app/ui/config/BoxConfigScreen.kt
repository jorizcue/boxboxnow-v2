package com.boxboxnow.app.ui.config

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.boxboxnow.app.i18n.t
import com.boxboxnow.app.models.Team
import com.boxboxnow.app.models.TeamDriver
import com.boxboxnow.app.net.ApiClient
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.vm.ConfigViewModel
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState
import javax.inject.Inject

/** Thin ViewModel to access Hilt-injected ApiClient from BoxConfigScreen. */
@HiltViewModel
class BoxConfigVM @Inject constructor(val api: ApiClient) : ViewModel()

/**
 * Box configuration screen for managing teams and drivers.
 * Teams are read-only by default; tap "Edit" to enable modifications.
 * "Add team" opens a popup. "Load from Live Timing" replaces all teams.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BoxConfigScreen(onBack: () -> Unit) {
    val vm: BoxConfigVM = hiltViewModel()
    val api = vm.api
    val scope = rememberCoroutineScope()
    val teams = remember { mutableStateListOf<Team>() }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var importing by remember { mutableStateOf(false) }
    var isEditing by remember { mutableStateOf(false) }
    var autoLoad by remember { mutableStateOf(false) }
    var expandedIndices by remember { mutableStateOf(setOf<Int>()) }
    var showAddDialog by remember { mutableStateOf(false) }
    var newTeamName by remember { mutableStateOf("") }
    var newTeamKart by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            val session = api.getActiveSession()
            autoLoad = session?.autoLoadTeams ?: false
        } catch (_: Throwable) {}
        try {
            val fetched = api.getTeams().sortedBy { it.position }
            teams.clear()
            teams.addAll(fetched)
        } catch (_: Throwable) {}
        loading = false
    }

    /** Persist the current teams list. Used by:
     *   - The explicit "GUARDAR CAMBIOS" button further down.
     *   - The "Listo" button in the top bar (exiting edit mode).
     *   - The back-arrow handler so changes survive a navigation away
     *     from the screen without an explicit save tap.
     *
     * Pre-2026-05-15 the screen only saved via the bottom button, so
     * dragging a team into a new order and then pressing "Listo" or
     * the back arrow silently discarded the change. Same for adding
     * pilots inside a team. Now any exit path commits. */
    suspend fun saveCurrentTeams() {
        if (loading) return
        try {
            val ordered = teams.mapIndexed { idx, t -> t.copy(position = idx + 1) }
            api.replaceTeams(ordered)
        } catch (_: Throwable) {}
    }

    Scaffold(
        containerColor = Color.Black,
        topBar = {
            TopAppBar(
                title = { Text(t("box.title"), color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = {
                        // Commit any pending edits before leaving the
                        // screen — protects the user from losing a
                        // reorder or a freshly-added pilot just because
                        // they didn't scroll down to the save button.
                        scope.launch {
                            saveCurrentTeams()
                            onBack()
                        }
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Color.White)
                    }
                },
                actions = {
                    TextButton(onClick = {
                        val wasEditing = isEditing
                        isEditing = !isEditing
                        // Treat "Listo" (exiting edit mode) as an
                        // implicit save — matches iOS, where leaving
                        // edit mode commits the team list.
                        if (wasEditing) {
                            scope.launch { saveCurrentTeams() }
                        }
                    }) {
                        Text(
                            if (isEditing) t("common.done") else t("common.edit"),
                            color = BoxBoxNowColors.Accent,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Black),
            )
        },
    ) { padding ->
        if (loading) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) { CircularProgressIndicator(color = BoxBoxNowColors.Accent) }
        } else {
            // Reorderable wiring: `lazyListState` is shared between the
            // LazyColumn and `rememberReorderableLazyListState`, and the
            // `onMove` callback mutates the same `teams` SnapshotStateList
            // the rest of the screen reads from. Keys MUST stay stable
            // across moves — we use `team.kart` because it's the only
            // field guaranteed unique by the backend.
            val listState = rememberLazyListState()
            val reorderableState = rememberReorderableLazyListState(listState) { from, to ->
                // Indices include the non-team items above the team list
                // (auto-load row, actions row, header). We work directly
                // on the data list using its OWN indices, which we
                // recover by subtracting the lead offset.
                val lead = 3 // auto-load + actions + header
                val fromIdx = from.index - lead
                val toIdx = to.index - lead
                if (fromIdx in teams.indices && toIdx in teams.indices) {
                    teams.add(toIdx, teams.removeAt(fromIdx))
                }
            }
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .padding(padding)
                    .fillMaxSize()
                    .background(Color.Black),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Auto-load toggle
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(BoxBoxNowColors.SystemGray6)
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                t("box.autoLoadTitle"),
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                t("box.autoLoadSubtitle"),
                                color = BoxBoxNowColors.SystemGray,
                                fontSize = 11.sp,
                            )
                        }
                        Spacer(Modifier.width(8.dp))
                        Switch(
                            checked = autoLoad,
                            onCheckedChange = { newValue ->
                                autoLoad = newValue
                                scope.launch {
                                    try {
                                        api.patchSessionField("auto_load_teams", newValue)
                                    } catch (_: Throwable) {}
                                }
                            },
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

                // Actions
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = {
                                importing = true
                                scope.launch {
                                    try {
                                        val live = api.getLiveTeams()
                                        teams.clear()
                                        teams.addAll(live.teams.mapIndexed { idx, t ->
                                            t.copy(position = idx + 1)
                                        })
                                    } catch (_: Throwable) {}
                                    importing = false
                                }
                            },
                            enabled = !importing,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = BoxBoxNowColors.SystemGray6,
                                contentColor = Color.White,
                            ),
                            shape = RoundedCornerShape(10.dp),
                        ) {
                            if (importing) {
                                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                            } else {
                                Icon(Icons.Default.CloudDownload, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                            Spacer(Modifier.width(6.dp))
                            Text(t("box.liveTiming"), fontSize = 13.sp)
                        }

                        Button(
                            onClick = { showAddDialog = true },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = BoxBoxNowColors.SystemGray6,
                                contentColor = Color.White,
                            ),
                            shape = RoundedCornerShape(10.dp),
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(t("box.team"), fontSize = 13.sp)
                        }
                    }
                }

                // Header
                item {
                    Text(
                        t("box.teamsHeader", "count" to "${teams.size}"),
                        color = BoxBoxNowColors.SystemGray3,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.sp,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
                    )
                }

                if (teams.isEmpty()) {
                    item {
                        Text(
                            t("box.empty"),
                            color = BoxBoxNowColors.SystemGray,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                } else {
                    // Key MUST be stable across reorders for the
                    // ReorderableItem snapshot to track the row — we
                    // key by kart number, which is unique per team in
                    // the backend payload.
                    itemsIndexed(teams, key = { _, t -> "team_${t.kart}" }) { idx, team ->
                        ReorderableItem(reorderableState, key = "team_${team.kart}") { isDragging ->
                            TeamRow(
                                team = team,
                                index = idx,
                                isExpanded = expandedIndices.contains(idx),
                                isEditing = isEditing,
                                isDragging = isDragging,
                                // Handle is only attached in edit mode —
                                // mirrors iOS where reordering requires
                                // the "Editar" toolbar button to be on.
                                dragHandle = if (isEditing) ({
                                    Icon(
                                        Icons.Default.DragHandle,
                                        contentDescription = t("box.reorderDescription"),
                                        tint = BoxBoxNowColors.SystemGray,
                                        modifier = Modifier
                                            .draggableHandle()
                                            .size(20.dp),
                                    )
                                }) else ({}),
                                onToggleExpand = {
                                    expandedIndices = if (expandedIndices.contains(idx))
                                        expandedIndices - idx else expandedIndices + idx
                                },
                                onUpdate = { updated -> teams[idx] = updated },
                                onRemove = {
                                    teams.removeAt(idx)
                                    expandedIndices = expandedIndices.filter { it != idx }.map {
                                        if (it > idx) it - 1 else it
                                    }.toSet()
                                },
                            )
                        }
                    }
                }

                // Save button
                item { Spacer(Modifier.height(8.dp)) }
                item {
                    Button(
                        onClick = {
                            saving = true
                            scope.launch {
                                try {
                                    val ordered = teams.mapIndexed { idx, t -> t.copy(position = idx + 1) }
                                    api.replaceTeams(ordered)
                                    teams.clear()
                                    teams.addAll(ordered)
                                } catch (_: Throwable) {}
                                saving = false
                            }
                        },
                        enabled = !saving,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = BoxBoxNowColors.Accent,
                            contentColor = Color.Black,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(vertical = 14.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (saving) {
                            CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(t("box.saveChanges"), fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }
            }
        }
    }

    // Add team dialog
    if (showAddDialog) {
        AlertDialog(
            onDismissRequest = { showAddDialog = false; newTeamName = ""; newTeamKart = "" },
            containerColor = BoxBoxNowColors.SystemGray6,
            titleContentColor = Color.White,
            textContentColor = Color.White,
            title = { Text(t("box.addTeamTitle")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(t("box.addTeamPrompt"), color = BoxBoxNowColors.SystemGray, fontSize = 13.sp)
                    OutlinedTextField(
                        value = newTeamName,
                        onValueChange = { newTeamName = it },
                        label = { Text(t("box.fieldName")) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                        colors = fieldColors(),
                    )
                    OutlinedTextField(
                        value = newTeamKart,
                        onValueChange = { newTeamKart = it.filter { c -> c.isDigit() } },
                        label = { Text(t("box.fieldKart")) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        colors = fieldColors(),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val name = newTeamName.trim()
                    val kart = newTeamKart.toIntOrNull() ?: ((teams.maxOfOrNull { it.kart } ?: 0) + 1)
                    if (name.isNotEmpty()) {
                        teams.add(Team(position = teams.size + 1, kart = kart, teamName = name))
                        isEditing = true
                    }
                    newTeamName = ""; newTeamKart = ""; showAddDialog = false
                }) { Text(t("box.addConfirm"), color = BoxBoxNowColors.Accent) }
            },
            dismissButton = {
                TextButton(onClick = { newTeamName = ""; newTeamKart = ""; showAddDialog = false }) {
                    Text(t("common.cancel"), color = BoxBoxNowColors.SystemGray)
                }
            },
        )
    }
}

@Composable
private fun TeamRow(
    team: Team,
    index: Int,
    isExpanded: Boolean,
    isEditing: Boolean,
    onToggleExpand: () -> Unit,
    onUpdate: (Team) -> Unit,
    onRemove: () -> Unit,
    isDragging: Boolean = false,
    /** Drag handle composable supplied by `ReorderableItem` so it can
     *  attach the `.draggableHandle()` modifier from the reorderable
     *  scope. Rendered to the left of the row. Pass `{}` (or omit)
     *  when the row isn't inside a ReorderableItem. */
    dragHandle: @Composable () -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(
                if (isDragging) BoxBoxNowColors.SystemGray5
                else BoxBoxNowColors.SystemGray6
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Drag handle — pressing + dragging this icon reorders the
            // row via the surrounding ReorderableItem scope.
            dragHandle()
            Spacer(Modifier.width(6.dp))
            // Position
            Text(
                "#${index + 1}",
                color = BoxBoxNowColors.SystemGray3,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.width(26.dp),
            )

            if (isEditing) {
                OutlinedTextField(
                    value = team.kart.toString(),
                    onValueChange = { onUpdate(team.copy(kart = it.toIntOrNull() ?: team.kart)) },
                    label = { Text(t("box.fieldKart"), fontSize = 10.sp) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.width(64.dp),
                    colors = fieldColors(),
                )
                Spacer(Modifier.width(8.dp))
                OutlinedTextField(
                    value = team.teamName,
                    onValueChange = { onUpdate(team.copy(teamName = it)) },
                    label = { Text(t("box.team"), fontSize = 10.sp) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    colors = fieldColors(),
                )
            } else {
                Text(
                    "K${team.kart}",
                    color = BoxBoxNowColors.Accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.width(48.dp),
                )
                Text(
                    team.teamName,
                    color = Color.White,
                    fontSize = 14.sp,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                )
            }

            IconButton(onClick = onToggleExpand, modifier = Modifier.size(32.dp)) {
                Icon(
                    if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = BoxBoxNowColors.Accent,
                    modifier = Modifier.size(20.dp),
                )
            }

            if (isEditing) {
                IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Delete, contentDescription = null, tint = BoxBoxNowColors.ErrorRed, modifier = Modifier.size(18.dp))
                }
            }
        }

        // Collapsed summary
        if (!isExpanded && team.drivers.isNotEmpty()) {
            Text(
                if (team.drivers.size == 1)
                    t("box.pilotCount", "count" to "${team.drivers.size}")
                else
                    t("box.pilotCountPlural", "count" to "${team.drivers.size}"),
                color = BoxBoxNowColors.SystemGray,
                fontSize = 11.sp,
                modifier = Modifier.padding(start = 26.dp, top = 4.dp),
            )
        }

        // Expanded drivers
        AnimatedVisibility(visible = isExpanded) {
            Column(modifier = Modifier.padding(start = 26.dp, top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                team.drivers.forEachIndexed { dIdx, driver ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Person, contentDescription = null, tint = BoxBoxNowColors.SystemGray3, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        if (isEditing) {
                            OutlinedTextField(
                                value = driver.driverName,
                                onValueChange = { name ->
                                    val updated = team.drivers.toMutableList()
                                    updated[dIdx] = driver.copy(driverName = name)
                                    onUpdate(team.copy(drivers = updated))
                                },
                                placeholder = { Text(t("box.driverPlaceholder"), fontSize = 12.sp) },
                                singleLine = true,
                                modifier = Modifier.weight(1f).height(48.dp),
                                colors = fieldColors(),
                            )
                            Spacer(Modifier.width(6.dp))
                            // Differential editor — milliseconds field that
                            // takes a SECONDS string (with sign) for
                            // ergonomics, matching iOS's "+1.2" / "-0.5"
                            // input pattern. The TeamDriver field is ms,
                            // so we round-trip via Double seconds.
                            DiffMsField(
                                valueMs = driver.differentialMs,
                                onValueChange = { newMs ->
                                    val updated = team.drivers.toMutableList()
                                    updated[dIdx] = driver.copy(differentialMs = newMs)
                                    onUpdate(team.copy(drivers = updated))
                                },
                                modifier = Modifier.width(82.dp).height(48.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            IconButton(
                                onClick = {
                                    val updated = team.drivers.toMutableList()
                                    updated.removeAt(dIdx)
                                    onUpdate(team.copy(drivers = updated))
                                },
                                modifier = Modifier.size(28.dp),
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null, tint = BoxBoxNowColors.ErrorRed.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                            }
                        } else {
                            val noNameLabel = t("box.driverNoName")
                            Text(
                                driver.driverName.ifEmpty { noNameLabel },
                                color = Color.White,
                                fontSize = 13.sp,
                                modifier = Modifier.weight(1f),
                            )
                            if (driver.differentialMs != 0) {
                                Text(
                                    "%+.1fs".format(driver.differentialMs / 1000.0),
                                    color = BoxBoxNowColors.SystemGray,
                                    fontSize = 11.sp,
                                    fontFamily = FontFamily.Monospace,
                                )
                            }
                        }
                    }
                }
                if (isEditing) {
                    TextButton(
                        onClick = {
                            val updated = team.drivers + TeamDriver()
                            onUpdate(team.copy(drivers = updated))
                        },
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(14.dp), tint = BoxBoxNowColors.Accent)
                        Spacer(Modifier.width(4.dp))
                        Text(t("box.addPilot"), color = BoxBoxNowColors.Accent, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    focusedBorderColor = BoxBoxNowColors.Accent,
    unfocusedBorderColor = BoxBoxNowColors.SystemGray4,
    focusedLabelColor = BoxBoxNowColors.Accent,
    unfocusedLabelColor = BoxBoxNowColors.SystemGray,
    cursorColor = BoxBoxNowColors.Accent,
)

/**
 * Differential-ms editor. Stores ms in the model but the user types
 * seconds with one decimal and an optional sign. Empty → 0 ms.
 *
 * Local string state is kept so the user can type "-", "1.", "-2.5",
 * etc. without the parent state stomping mid-keystroke. We push to
 * `onValueChange` only when the buffer parses to a clean number (or
 * the user clears the field).
 */
@Composable
private fun DiffMsField(
    valueMs: Int,
    onValueChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Display format: "+1.2" / "-0.5" / "0" — mirrors the read-only
    // formatter further up so the field doesn't visually jump when
    // entering / leaving edit mode.
    fun format(ms: Int) = if (ms == 0) "0" else "%+.1f".format(ms / 1000.0)

    // Local text buffer survives recompositions and does NOT reset when
    // `valueMs` changes because of OUR own onValueChange — otherwise
    // every keystroke would clobber the user's typing with the 1-decimal-
    // rounded format (typing "5" over "+0.6" → "+0.65" → 0.65 s →
    // valueMs=650 → reformat as "+0.7" → text snaps back to "+0.7" →
    // every subsequent digit visually adds another 0.1).
    //
    // External resets (selecting a different team, loading config) DO
    // need to push into the buffer. We track the last value we
    // committed from inside the field; the LaunchedEffect only resyncs
    // when the parent's `valueMs` diverges from that, which means it
    // came from somewhere else.
    var text by remember { mutableStateOf(format(valueMs)) }
    val lastCommittedFromField = remember { mutableStateOf(valueMs) }

    LaunchedEffect(valueMs) {
        if (valueMs != lastCommittedFromField.value) {
            text = format(valueMs)
            lastCommittedFromField.value = valueMs
        }
    }

    OutlinedTextField(
        value = text,
        onValueChange = { raw ->
            // Allow only digits, dot, comma (es-ES), and a leading sign.
            val cleaned = raw.filterIndexed { idx, c ->
                c.isDigit() || c == '.' || c == ',' ||
                ((c == '-' || c == '+') && idx == 0)
            }
            text = cleaned
            // Try to commit. Empty or just "-" / "+" → 0 ms.
            val normalised = cleaned.replace(',', '.')
            val parsed = normalised.toDoubleOrNull()
            if (parsed != null) {
                val ms = (parsed * 1000.0).toInt()
                lastCommittedFromField.value = ms
                onValueChange(ms)
            } else if (cleaned.isEmpty()) {
                lastCommittedFromField.value = 0
                onValueChange(0)
            }
        },
        placeholder = { Text("± s", fontSize = 11.sp) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        textStyle = androidx.compose.ui.text.TextStyle(
            fontSize = 13.sp,
            fontFamily = FontFamily.Monospace,
            color = Color.White,
        ),
        modifier = modifier,
        colors = fieldColors(),
    )
}
