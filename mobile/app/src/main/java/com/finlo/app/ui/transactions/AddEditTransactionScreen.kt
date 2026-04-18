package com.finlo.app.ui.transactions

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.finlo.app.data.remote.dto.TransactionCreateRequest
import com.finlo.app.ui.auth.finloTextFieldColors
import com.finlo.app.ui.components.PrimaryButton
import com.finlo.app.ui.theme.*
import com.finlo.app.util.CategoryUtils
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddEditTransactionScreen(
    editId: String? = null,
    onDone: () -> Unit,
    viewModel: TransactionsViewModel = hiltViewModel(),
) {
    val isEdit = editId != null
    var amount by remember { mutableStateOf("") }
    var merchant by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var paymentMode by remember { mutableStateOf("") }
    var isIncome by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }

    val categories = CategoryUtils.all.map { it.name }
    val paymentModes = listOf("" to "Select", "cash" to "Cash", "upi" to "UPI", "card" to "Card", "net_banking" to "Net Banking")

    Scaffold(
        containerColor = Background,
        topBar = {
            TopAppBar(
                title = { Text(if (isEdit) "Edit Transaction" else "New Transaction", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onDone) { Icon(Icons.Default.ArrowBack, null) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Background, titleContentColor = Foreground, navigationIconContentColor = Foreground),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Type toggle
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(false to "Expense", true to "Income").forEach { (value, label) ->
                    FilterChip(
                        selected = isIncome == value,
                        onClick = { isIncome = value },
                        label = { Text(label, fontSize = 13.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Primary.copy(alpha = 0.15f),
                            selectedLabelColor = PrimaryLight,
                            containerColor = Surface,
                            labelColor = Muted,
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            borderColor = Border,
                            selectedBorderColor = Primary.copy(alpha = 0.3f),
                            enabled = true, selected = isIncome == value,
                        ),
                    )
                }
            }

            OutlinedTextField(
                value = amount, onValueChange = { amount = it },
                label = { Text("Amount (₹)") }, singleLine = true,
                shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = merchant, onValueChange = { merchant = it },
                label = { Text("Merchant / Description") }, singleLine = true,
                shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

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
                value = date, onValueChange = { date = it },
                label = { Text("Date (YYYY-MM-DD)") }, singleLine = true,
                shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                modifier = Modifier.fillMaxWidth(),
            )

            // Payment mode
            var pmExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(expanded = pmExpanded, onExpandedChange = { pmExpanded = it }) {
                OutlinedTextField(
                    value = paymentModes.find { it.first == paymentMode }?.second ?: "Select",
                    onValueChange = {}, label = { Text("Payment Mode") }, readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(pmExpanded) },
                    shape = RoundedCornerShape(12.dp), colors = finloTextFieldColors(),
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = pmExpanded, onDismissRequest = { pmExpanded = false }) {
                    paymentModes.forEach { (value, label) ->
                        DropdownMenuItem(
                            text = { Text(label, fontSize = 13.sp) },
                            onClick = { paymentMode = value; pmExpanded = false },
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            PrimaryButton(
                text = if (saving) "Saving..." else if (isEdit) "Save Changes" else "Add Transaction",
                onClick = {
                    saving = true
                    val amountVal = amount.toDoubleOrNull() ?: 0.0
                    if (isEdit && editId != null) {
                        viewModel.updateTransaction(editId, mapOf(
                            "amount" to amountVal, "merchant" to merchant,
                            "category" to category.ifBlank { null }, "date" to date,
                            "payment_mode" to paymentMode.ifBlank { null },
                            "notes" to if (isIncome) "income" else null,
                        ), onDone)
                    } else {
                        viewModel.createTransaction(TransactionCreateRequest(
                            date = date, merchant = merchant, amount = amountVal,
                            category = category.ifBlank { null },
                            paymentMode = paymentMode.ifBlank { null },
                            notes = if (isIncome) "income" else null,
                        ), onDone)
                    }
                },
                enabled = !saving && merchant.isNotBlank() && amount.toDoubleOrNull() != null,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
