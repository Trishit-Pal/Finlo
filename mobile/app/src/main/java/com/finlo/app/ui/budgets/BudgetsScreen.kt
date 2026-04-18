package com.finlo.app.ui.budgets

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
import com.finlo.app.data.remote.dto.BudgetCreateRequest
import com.finlo.app.data.remote.dto.BudgetDto
import com.finlo.app.ui.auth.finloTextFieldColors
import com.finlo.app.ui.components.*
import com.finlo.app.ui.theme.*
import com.finlo.app.util.CategoryUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class BudgetsViewModel @Inject constructor(private val api: FinloApi) : ViewModel() {
    private val _budgets = MutableStateFlow<List<BudgetDto>>(emptyList())
    val budgets = _budgets.asStateFlow()
    private val _loading = MutableStateFlow(true)
    val loading = _loading.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _loading.value = true
            try { _budgets.value = api.getBudgets().items } catch (_: Exception) {}
            _loading.value = false
        }
    }

    fun create(req: BudgetCreateRequest, onDone: () -> Unit) {
        viewModelScope.launch {
            try { api.createBudget(req); load(); onDone() } catch (_: Exception) {}
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try { api.deleteBudget(id); load() } catch (_: Exception) {}
        }
    }
}

private val MONTHS = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudgetsScreen(viewModel: BudgetsViewModel = hiltViewModel()) {
    val budgets by viewModel.budgets.collectAsState()
    val loading by viewModel.loading.collectAsState()
    var showForm by remember { mutableStateOf(false) }

    val totalBudgeted = budgets.sumOf { it.limitAmount }
    val totalSpent = budgets.sumOf { it.spent }
    val overBudget = budgets.count { it.alertLevel == "hard" }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        // Header
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Budgets", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Foreground)
                Text("Set spending limits and track progress", style = MaterialTheme.typography.bodySmall, color = Muted)
            }
            PrimaryButton("+ New", onClick = { showForm = true }, icon = Icons.Default.Add)
        }

        Spacer(Modifier.height(16.dp))

        // Summary
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(
                Triple("Budgeted", formatINR(totalBudgeted), PrimaryLight),
                Triple("Spent", formatINR(totalSpent), WarningLight),
                Triple("Over Budget", "$overBudget", if (overBudget > 0) DangerLight else SuccessLight),
            ).forEach { (label, value, color) ->
                StatCard(label = label, value = value, icon = Icons.Default.PieChart, iconTint = color, modifier = Modifier.weight(1f))
            }
        }

        Spacer(Modifier.height(16.dp))

        // List
        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary, modifier = Modifier.size(32.dp), strokeWidth = 2.dp)
            }
        } else if (budgets.isEmpty()) {
            EmptyState(Icons.Default.PieChart, "No budgets yet", "Create Budget") { showForm = true }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(budgets, key = { it.id }) { b ->
                    val pct = if (b.limitAmount > 0) (b.spent / b.limitAmount).toFloat().coerceIn(0f, 1f) else 0f
                    val barColor = when (b.alertLevel) {
                        "hard" -> DangerLight
                        "soft" -> WarningLight
                        else -> SuccessLight
                    }
                    val catInfo = CategoryUtils.get(b.category)

                    GlassPanel {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(catInfo.icon, fontSize = 18.sp)
                                Column {
                                    Text(b.category, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Foreground)
                                    Text("${MONTHS.getOrElse(b.month - 1) { "" }} ${b.year}", fontSize = 11.sp, color = Muted)
                                }
                            }
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                if (b.alertLevel == "hard") {
                                    Text("Over!", fontSize = 10.sp, color = DangerLight,
                                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(DangerLight.copy(0.1f)).padding(horizontal = 6.dp, vertical = 2.dp))
                                } else if (b.alertLevel == "soft") {
                                    Text("80%+", fontSize = 10.sp, color = WarningLight,
                                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(WarningLight.copy(0.1f)).padding(horizontal = 6.dp, vertical = 2.dp))
                                }
                                IconButton(onClick = { viewModel.delete(b.id) }, Modifier.size(32.dp)) {
                                    Icon(Icons.Default.Delete, "Delete", tint = Muted, modifier = Modifier.size(14.dp))
                                }
                            }
                        }

                        Spacer(Modifier.height(12.dp))

                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${formatINR(b.spent)} spent", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = Foreground)
                            Text("of ${formatINR(b.limitAmount)}", fontSize = 11.sp, color = Muted)
                        }

                        Spacer(Modifier.height(6.dp))
                        FinloProgressBar(progress = pct, color = barColor)
                        Spacer(Modifier.height(6.dp))

                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${(pct * 100).toInt()}% used", fontSize = 11.sp, color = Muted)
                            Text(
                                if (b.remaining < 0) "${formatINR(-b.remaining)} over" else "${formatINR(b.remaining)} left",
                                fontSize = 11.sp,
                                color = if (b.remaining < 0) DangerLight else SuccessLight,
                            )
                        }
                    }
                }
            }
        }
    }

    // Create Dialog
    if (showForm) {
        CreateBudgetDialog(onDismiss = { showForm = false }) { req ->
            viewModel.create(req) { showForm = false }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateBudgetDialog(onDismiss: () -> Unit, onCreate: (BudgetCreateRequest) -> Unit) {
    val categories = CategoryUtils.all.map { it.name }
    var category by remember { mutableStateOf(categories.first()) }
    var limitAmount by remember { mutableStateOf("5000") }
    val now = java.time.LocalDate.now()
    var month by remember { mutableIntStateOf(now.monthValue) }
    var year by remember { mutableStateOf(now.year.toString()) }
    var rollover by remember { mutableStateOf(false) }
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
                Text("Create Budget", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Foreground)
                IconButton(onClick = onDismiss, Modifier.size(32.dp)) {
                    Icon(Icons.Default.Close, "Close", tint = Muted, modifier = Modifier.size(16.dp))
                }
            }

            // Category dropdown
            var catExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(expanded = catExpanded, onExpandedChange = { catExpanded = it }) {
                OutlinedTextField(
                    value = category, onValueChange = {},
                    label = { Text("Category") }, readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(catExpanded) },
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = catExpanded, onDismissRequest = { catExpanded = false }) {
                    categories.forEach { cat ->
                        val info = CategoryUtils.get(cat)
                        DropdownMenuItem(
                            text = { Text("${info.icon} $cat", fontSize = 13.sp) },
                            onClick = { category = cat; catExpanded = false },
                        )
                    }
                }
            }

            OutlinedTextField(
                value = limitAmount, onValueChange = { limitAmount = it },
                label = { Text("Monthly Limit (₹)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                // Month dropdown
                var monthExpanded by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(expanded = monthExpanded, onExpandedChange = { monthExpanded = it }, modifier = Modifier.weight(1f)) {
                    OutlinedTextField(
                        value = MONTHS.getOrElse(month - 1) { "" }, onValueChange = {},
                        label = { Text("Month") }, readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(monthExpanded) },
                        shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                        modifier = Modifier.fillMaxWidth().menuAnchor(),
                    )
                    ExposedDropdownMenu(expanded = monthExpanded, onDismissRequest = { monthExpanded = false }) {
                        MONTHS.forEachIndexed { idx, name ->
                            DropdownMenuItem(
                                text = { Text(name, fontSize = 13.sp) },
                                onClick = { month = idx + 1; monthExpanded = false },
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = year, onValueChange = { year = it },
                    label = { Text("Year") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.weight(1f),
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = rollover, onCheckedChange = { rollover = it },
                    colors = CheckboxDefaults.colors(checkedColor = Primary, uncheckedColor = Muted),
                )
                Text("Rollover unused budget", fontSize = 13.sp, color = Muted)
            }

            PrimaryButton(
                text = if (saving) "Creating..." else "Create Budget",
                onClick = {
                    saving = true
                    onCreate(BudgetCreateRequest(
                        category = category,
                        limitAmount = limitAmount.toDoubleOrNull() ?: 5000.0,
                        month = month,
                        year = year.toIntOrNull() ?: now.year,
                        rolloverEnabled = rollover,
                    ))
                },
                enabled = !saving && limitAmount.toDoubleOrNull() != null,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
