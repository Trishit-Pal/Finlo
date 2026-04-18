package com.finlo.app.ui.debts

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
import com.finlo.app.data.remote.dto.DebtCreateRequest
import com.finlo.app.data.remote.dto.DebtDto
import com.finlo.app.data.remote.dto.DebtSummaryDto
import com.finlo.app.ui.auth.finloTextFieldColors
import com.finlo.app.ui.components.*
import com.finlo.app.ui.theme.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DebtsViewModel @Inject constructor(private val api: FinloApi) : ViewModel() {
    private val _debts = MutableStateFlow<List<DebtDto>>(emptyList())
    val debts = _debts.asStateFlow()
    private val _summary = MutableStateFlow(DebtSummaryDto(0.0, 0.0, 0))
    val summary = _summary.asStateFlow()
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
                _debts.value = api.getDebts()
                _summary.value = api.getDebtSummary()
            } catch (_: Exception) {
                _errorMessage.value = "Failed to load debts. Check your connection and try again."
            }
            _loading.value = false
        }
    }

    fun create(req: DebtCreateRequest, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                api.createDebt(req)
                load()
                onResult(true)
            } catch (_: Exception) {
                _errorMessage.value = "Failed to add debt."
                onResult(false)
            }
        }
    }

    fun pay(id: String, amount: Double, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                api.payDebt(id, mapOf("amount" to amount))
                load()
                onResult(true)
            } catch (_: Exception) {
                _errorMessage.value = "Failed to log payment."
                onResult(false)
            }
        }
    }

    fun settle(id: String) {
        viewModelScope.launch {
            try {
                api.settleDebt(id)
                load()
            } catch (_: Exception) {
                _errorMessage.value = "Failed to mark debt as settled."
            }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try {
                api.deleteDebt(id)
                load()
            } catch (_: Exception) {
                _errorMessage.value = "Failed to delete debt."
            }
        }
    }
}

private val DEBT_TYPES = listOf(
    "personal_loan" to "Personal Loan",
    "credit_card" to "Credit Card",
    "owed_to" to "Owed To",
    "owed_by" to "Owed By",
)

private val TYPE_COLORS = mapOf(
    "personal_loan" to PrimaryLight,
    "credit_card" to CategoryFood, // orange
    "owed_to" to DangerLight,
    "owed_by" to SuccessLight,
)

private val TYPE_ICONS = mapOf(
    "personal_loan" to Icons.Default.AccountBalance,
    "credit_card" to Icons.Default.CreditCard,
    "owed_to" to Icons.Default.CallMade,
    "owed_by" to Icons.Default.People,
)

@Composable
fun DebtsScreen(onBack: () -> Unit, viewModel: DebtsViewModel = hiltViewModel()) {
    val debts by viewModel.debts.collectAsState()
    val summary by viewModel.summary.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    var showForm by remember { mutableStateOf(false) }
    var payDebtId by remember { mutableStateOf<String?>(null) }

    Scaffold(
        containerColor = Background,
        topBar = {
            @OptIn(ExperimentalMaterial3Api::class)
            TopAppBar(
                title = { Text("Debts & Loans", fontWeight = FontWeight.SemiBold) },
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
                    Triple("Outstanding", formatINR(summary.totalOutstanding), DangerLight),
                    Triple("Monthly EMI", formatINR(summary.monthlyEmiTotal), WarningLight),
                    Triple("Active", "${summary.activeCount}", PrimaryLight),
                ).forEach { (label, value, color) ->
                    StatCard(label = label, value = value, icon = Icons.Default.AccountBalance, iconTint = color, modifier = Modifier.weight(1f))
                }
            }

            Spacer(Modifier.height(16.dp))

            if (loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Primary, modifier = Modifier.size(32.dp), strokeWidth = 2.dp)
                }
            } else if (debts.isEmpty()) {
                EmptyState(Icons.Default.AccountBalance, "No debts or loans tracked yet", "Add Debt") { showForm = true }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(debts, key = { it.id }) { d ->
                        val paidPct = if (d.totalAmount > 0) ((d.totalAmount - d.remainingBalance) / d.totalAmount).toFloat().coerceIn(0f, 1f) else 0f
                        val color = TYPE_COLORS[d.type] ?: Muted
                        val typeLabel = DEBT_TYPES.find { it.first == d.type }?.second ?: d.type
                        val typeIcon = TYPE_ICONS[d.type] ?: Icons.Default.AccountBalance

                        GlassPanel {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(color.copy(0.12f)).border(1.dp, color.copy(0.2f), RoundedCornerShape(10.dp)),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(typeIcon, null, tint = color, modifier = Modifier.size(16.dp))
                                    }
                                    Column {
                                        Text(d.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Foreground)
                                        Text(
                                            buildString {
                                                append(typeLabel)
                                                d.lenderName?.let { append(" · $it") }
                                                d.nextDueDate?.let { append(" · Due $it") }
                                            },
                                            fontSize = 11.sp, color = Muted,
                                        )
                                    }
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                                    if (d.isSettled) {
                                        Text("Settled", fontSize = 10.sp, color = SuccessLight,
                                            modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(SuccessLight.copy(0.1f)).padding(horizontal = 6.dp, vertical = 2.dp))
                                    } else {
                                        TextButton(onClick = { payDebtId = d.id }, modifier = Modifier.height(28.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)) {
                                            Text("Pay", fontSize = 11.sp, color = PrimaryLight)
                                        }
                                        IconButton(onClick = { viewModel.settle(d.id) }, Modifier.size(28.dp)) {
                                            Icon(Icons.Default.Check, "Settle", tint = SuccessLight, modifier = Modifier.size(14.dp))
                                        }
                                    }
                                    IconButton(onClick = { viewModel.delete(d.id) }, Modifier.size(28.dp)) {
                                        Icon(Icons.Default.Delete, "Delete", tint = Muted, modifier = Modifier.size(14.dp))
                                    }
                                }
                            }

                            Spacer(Modifier.height(12.dp))

                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${formatINR(d.totalAmount - d.remainingBalance)} paid", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = Foreground)
                                Text("of ${formatINR(d.totalAmount)}", fontSize = 11.sp, color = Muted)
                            }
                            Spacer(Modifier.height(6.dp))
                            FinloProgressBar(progress = paidPct, color = color)
                            Spacer(Modifier.height(6.dp))

                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Remaining: ${formatINR(d.remainingBalance)}", fontSize = 11.sp, color = Muted)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    d.emiAmount?.let { Text("EMI: ${formatINR(it)}/mo", fontSize = 11.sp, color = Muted) }
                                    d.interestRate?.let { Text("${it}% p.a.", fontSize = 11.sp, color = Muted) }
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
        CreateDebtDialog(onDismiss = { showForm = false; viewModel.clearError() }) { req, onResult ->
            viewModel.create(req, onResult)
        }
    }

    // Pay Dialog
    payDebtId?.let { id ->
        PayDebtDialog(onDismiss = { payDebtId = null; viewModel.clearError() }) { amount, onResult ->
            viewModel.pay(id, amount, onResult)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateDebtDialog(onDismiss: () -> Unit, onCreate: (DebtCreateRequest, (Boolean) -> Unit) -> Unit) {
    var name by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("personal_loan") }
    var totalAmount by remember { mutableStateOf("") }
    var remainingBalance by remember { mutableStateOf("") }
    var interestRate by remember { mutableStateOf("") }
    var emiAmount by remember { mutableStateOf("") }
    var nextDueDate by remember { mutableStateOf("") }
    var lenderName by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(Surface)
                .border(1.dp, Border, RoundedCornerShape(20.dp))
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("New Debt / Loan", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Foreground)
                IconButton(onClick = onDismiss, Modifier.size(32.dp)) {
                    Icon(Icons.Default.Close, "Close", tint = Muted, modifier = Modifier.size(16.dp))
                }
            }

            OutlinedTextField(
                value = name, onValueChange = { name = it },
                label = { Text("Name") }, singleLine = true, placeholder = { Text("Home Loan, Friend IOU...") },
                shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            // Type dropdown
            var typeExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(expanded = typeExpanded, onExpandedChange = { typeExpanded = it }) {
                OutlinedTextField(
                    value = DEBT_TYPES.find { it.first == type }?.second ?: "", onValueChange = {},
                    label = { Text("Type") }, readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(typeExpanded) },
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = typeExpanded, onDismissRequest = { typeExpanded = false }) {
                    DEBT_TYPES.forEach { (value, label) ->
                        DropdownMenuItem(
                            text = { Text(label, fontSize = 13.sp) },
                            onClick = { type = value; typeExpanded = false },
                        )
                    }
                }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = totalAmount, onValueChange = { totalAmount = it },
                    label = { Text("Total (₹)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = remainingBalance, onValueChange = { remainingBalance = it },
                    label = { Text("Remaining (₹)") }, singleLine = true, placeholder = { Text("Same") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.weight(1f),
                )
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = interestRate, onValueChange = { interestRate = it },
                    label = { Text("Rate (%)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = emiAmount, onValueChange = { emiAmount = it },
                    label = { Text("EMI (₹)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.weight(1f),
                )
            }

            OutlinedTextField(
                value = nextDueDate, onValueChange = { nextDueDate = it },
                label = { Text("Next Due Date (YYYY-MM-DD)") }, singleLine = true,
                shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = lenderName, onValueChange = { lenderName = it },
                label = { Text("Lender / Borrower") }, singleLine = true, placeholder = { Text("Bank, Friend...") },
                shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            PrimaryButton(
                text = if (saving) "Adding..." else "Add Debt",
                onClick = {
                    saving = true
                    val total = totalAmount.toDoubleOrNull() ?: 0.0
                    onCreate(
                        DebtCreateRequest(
                            name = name,
                            type = type,
                            totalAmount = total,
                            remainingBalance = remainingBalance.toDoubleOrNull() ?: total,
                            interestRate = interestRate.toDoubleOrNull(),
                            emiAmount = emiAmount.toDoubleOrNull(),
                            nextDueDate = nextDueDate.ifBlank { null },
                            lenderName = lenderName.ifBlank { null },
                        ),
                    ) { success ->
                        saving = false
                        if (success) onDismiss()
                    }
                },
                enabled = !saving && name.isNotBlank() && totalAmount.toDoubleOrNull() != null,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun PayDebtDialog(onDismiss: () -> Unit, onPay: (Double, (Boolean) -> Unit) -> Unit) {
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
            Text("Log Payment", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Foreground)

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
                        text = if (saving) "Logging..." else "Log Payment",
                        onClick = {
                            saving = true
                            val parsed = amount.toDoubleOrNull()
                            if (parsed != null) {
                                onPay(parsed) { success ->
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
