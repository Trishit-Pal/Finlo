package com.finlo.app.ui.savings

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finlo.app.data.remote.api.FinloApi
import com.finlo.app.data.remote.dto.SavingsGoalCreateRequest
import com.finlo.app.data.remote.dto.SavingsGoalDto
import com.finlo.app.ui.auth.finloTextFieldColors
import com.finlo.app.ui.components.*
import com.finlo.app.ui.theme.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SavingsViewModel @Inject constructor(private val api: FinloApi) : ViewModel() {
    private val _goals = MutableStateFlow<List<SavingsGoalDto>>(emptyList())
    val goals = _goals.asStateFlow()
    private val _loading = MutableStateFlow(true)
    val loading = _loading.asStateFlow()
    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage = _errorMessage.asStateFlow()

    fun clearError() {
        _errorMessage.value = null
    }

    init { load() }

    fun load() {
        viewModelScope.launch {
            _loading.value = true
            try {
                _goals.value = api.getSavingsGoals()
            } catch (_: Exception) {
                _errorMessage.value = "Failed to load savings goals. Check your connection and try again."
            }
            _loading.value = false
        }
    }

    fun create(req: SavingsGoalCreateRequest, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                api.createSavingsGoal(req)
                load()
                onResult(true)
            } catch (_: Exception) {
                _errorMessage.value = "Failed to create savings goal."
                onResult(false)
            }
        }
    }

    fun contribute(id: String, amount: Double, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                api.contributeSavings(id, mapOf("amount" to amount))
                load()
                onResult(true)
            } catch (_: Exception) {
                _errorMessage.value = "Failed to add contribution."
                onResult(false)
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                api.deleteSavingsGoal(id)
                load()
            } catch (_: Exception) {
                _errorMessage.value = "Failed to delete savings goal."
            }
        }
    }
}

@Composable
fun SavingsScreen(onBack: () -> Unit, viewModel: SavingsViewModel = hiltViewModel()) {
    val goals by viewModel.goals.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    var showForm by remember { mutableStateOf(false) }
    var contributeGoalId by remember { mutableStateOf<String?>(null) }

    val totalTarget = goals.sumOf { it.targetAmount }
    val totalSaved = goals.sumOf { it.currentAmount }

    Scaffold(
        containerColor = Background,
        topBar = {
            @OptIn(ExperimentalMaterial3Api::class)
            TopAppBar(
                title = { Text("Savings Goals", fontWeight = FontWeight.SemiBold) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
                actions = {
                    IconButton(onClick = { showForm = true }) { Icon(Icons.Default.Add, "Add", tint = PrimaryLight) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Background, titleContentColor = Foreground, navigationIconContentColor = Foreground),
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
            errorMessage?.let { msg ->
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(msg, color = Danger, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    TextButton(onClick = { viewModel.clearError() }) { Text("Dismiss", fontSize = 12.sp) }
                }
                Spacer(Modifier.height(12.dp))
            }

            // Summary
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(
                    Triple("Target", formatINR(totalTarget), PrimaryLight),
                    Triple("Saved", formatINR(totalSaved), SuccessLight),
                    Triple("Goals", "${goals.size}", WarningLight),
                ).forEach { (label, value, color) ->
                    StatCard(label = label, value = value, icon = Icons.Default.Savings, iconTint = color, modifier = Modifier.weight(1f))
                }
            }

            Spacer(Modifier.height(16.dp))

            if (loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Primary, modifier = Modifier.size(32.dp), strokeWidth = 2.dp)
                }
            } else if (goals.isEmpty()) {
                EmptyState(Icons.Default.Savings, "No savings goals yet", "Create Goal") { showForm = true }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(goals, key = { it.id }) { g ->
                        val pct = if (g.targetAmount > 0) (g.currentAmount / g.targetAmount).toFloat().coerceIn(0f, 1f) else 0f
                        val isComplete = g.currentAmount >= g.targetAmount
                        val daysLeft = g.deadline?.let {
                            try {
                                java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.now(), java.time.LocalDate.parse(it)).toInt()
                            } catch (_: Exception) { null }
                        }
                        val dailyNeeded = if (daysLeft != null && daysLeft > 0 && !isComplete) {
                            (g.targetAmount - g.currentAmount) / daysLeft
                        } else null

                        GlassPanel {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                                Column {
                                    Text(g.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Foreground)
                                    Text(
                                        buildString {
                                            append(g.deadline?.let { "Due $it" } ?: "No deadline")
                                            if (daysLeft != null && daysLeft > 0) append(" · $daysLeft days left")
                                        },
                                        fontSize = 11.sp, color = Muted,
                                    )
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                                    if (isComplete) {
                                        Text("Complete!", fontSize = 10.sp, color = SuccessLight,
                                            modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(SuccessLight.copy(0.1f)).padding(horizontal = 6.dp, vertical = 2.dp))
                                    } else {
                                        TextButton(onClick = { contributeGoalId = g.id }, modifier = Modifier.height(28.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)) {
                                            Text("+ Add", fontSize = 11.sp, color = SuccessLight)
                                        }
                                    }
                                    IconButton(onClick = { viewModel.delete(g.id) }, Modifier.size(28.dp)) {
                                        Icon(Icons.Default.Delete, "Delete", tint = Muted, modifier = Modifier.size(14.dp))
                                    }
                                }
                            }

                            Spacer(Modifier.height(12.dp))

                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${formatINR(g.currentAmount)} saved", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = Foreground)
                                Text("of ${formatINR(g.targetAmount)}", fontSize = 11.sp, color = Muted)
                            }
                            Spacer(Modifier.height(6.dp))
                            FinloProgressBar(
                                progress = pct,
                                color = if (isComplete) SuccessLight else PrimaryLight,
                            )
                            Spacer(Modifier.height(6.dp))

                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${(pct * 100).toInt()}% complete", fontSize = 11.sp, color = Muted)
                                if (dailyNeeded != null && dailyNeeded > 0) {
                                    Text("Save ${formatINR(dailyNeeded)}/day", fontSize = 11.sp, color = PrimaryLight)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Create Dialog
    if (showForm) {
        CreateGoalDialog(onDismiss = { showForm = false; viewModel.clearError() }) { req, onResult ->
            viewModel.create(req, onResult)
        }
    }

    // Contribute Dialog
    contributeGoalId?.let { id ->
        ContributeDialog(onDismiss = { contributeGoalId = null; viewModel.clearError() }) { amount, onResult ->
            viewModel.contribute(id, amount, onResult)
        }
    }
}

@Composable
private fun CreateGoalDialog(onDismiss: () -> Unit, onCreate: (SavingsGoalCreateRequest, (Boolean) -> Unit) -> Unit) {
    var name by remember { mutableStateOf("") }
    var targetAmount by remember { mutableStateOf("") }
    var deadline by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(Surface)
                .border(1.dp, Border, RoundedCornerShape(20.dp))
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("New Savings Goal", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Foreground)
                IconButton(onClick = onDismiss, Modifier.size(32.dp)) {
                    Icon(Icons.Default.Close, "Close", tint = Muted, modifier = Modifier.size(16.dp))
                }
            }

            OutlinedTextField(
                value = name, onValueChange = { name = it },
                label = { Text("Goal Name") }, singleLine = true, placeholder = { Text("Emergency Fund, Vacation...") },
                shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = targetAmount, onValueChange = { targetAmount = it },
                    label = { Text("Target (₹)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = deadline, onValueChange = { deadline = it },
                    label = { Text("Deadline") }, singleLine = true, placeholder = { Text("YYYY-MM-DD") },
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.weight(1f),
                )
            }

            PrimaryButton(
                text = if (saving) "Creating..." else "Create Goal",
                onClick = {
                    saving = true
                    onCreate(
                        SavingsGoalCreateRequest(
                            name = name,
                            targetAmount = targetAmount.toDoubleOrNull() ?: 0.0,
                            deadline = deadline.ifBlank { null },
                        ),
                    ) { success ->
                        saving = false
                        if (success) onDismiss()
                    }
                },
                enabled = !saving && name.isNotBlank() && targetAmount.toDoubleOrNull() != null,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ContributeDialog(onDismiss: () -> Unit, onContribute: (Double, (Boolean) -> Unit) -> Unit) {
    var amount by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(Surface)
                .border(1.dp, Border, RoundedCornerShape(20.dp))
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Add Contribution", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Foreground)

            OutlinedTextField(
                value = amount, onValueChange = { amount = it },
                label = { Text("Amount (₹)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f).height(44.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, Border),
                ) {
                    Text("Cancel", color = Muted)
                }
                Box(Modifier.weight(1f)) {
                    PrimaryButton(
                        text = if (saving) "Adding..." else "Contribute",
                        onClick = {
                            saving = true
                            val parsed = amount.toDoubleOrNull()
                            if (parsed != null) {
                                onContribute(parsed) { success ->
                                    saving = false
                                    if (success) onDismiss()
                                }
                            } else {
                                saving = false
                            }
                        },
                        enabled = !saving && amount.toDoubleOrNull() != null,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}
