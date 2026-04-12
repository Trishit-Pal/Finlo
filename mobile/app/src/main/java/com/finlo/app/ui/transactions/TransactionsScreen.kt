package com.finlo.app.ui.transactions

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.finlo.app.ui.components.*
import com.finlo.app.ui.theme.*
import com.finlo.app.util.CategoryUtils

@Composable
fun TransactionsScreen(
    onAddTransaction: () -> Unit,
    onEditTransaction: (String) -> Unit,
    viewModel: TransactionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val filtered = viewModel.filtered

    val income = filtered.filter { it.notes == "income" }.sumOf { it.amount }
    val expenses = filtered.filter { it.notes != "income" }.sumOf { it.amount }

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        // Header
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Transactions", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Foreground)
                Text("Track income and expenses", style = MaterialTheme.typography.bodySmall, color = Muted)
            }
            PrimaryButton("+ Add", onClick = onAddTransaction, icon = Icons.Default.Add)
        }

        Spacer(Modifier.height(16.dp))

        // Summary strip
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(
                Triple("Income", income, SuccessLight),
                Triple("Expenses", expenses, DangerLight),
                Triple("Balance", income - expenses, if (income >= expenses) SuccessLight else DangerLight),
            ).forEach { (label, value, color) ->
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Surface.copy(alpha = 0.9f))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                        .padding(12.dp),
                ) {
                    Text(formatINR(value), fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Foreground)
                    Text(label, fontSize = 11.sp, color = Muted)
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Search
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = viewModel::setSearch,
            placeholder = { Text("Search merchants, categories...", fontSize = 13.sp) },
            leadingIcon = { Icon(Icons.Default.Search, null, tint = Muted, modifier = Modifier.size(16.dp)) },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Primary,
                unfocusedBorderColor = Border,
                focusedContainerColor = Color.Black.copy(alpha = 0.3f),
                unfocusedContainerColor = Color.Black.copy(alpha = 0.2f),
                focusedTextColor = Foreground,
                unfocusedTextColor = Foreground,
            ),
            modifier = Modifier.fillMaxWidth().height(48.dp),
        )

        Spacer(Modifier.height(12.dp))

        // List
        if (state.loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary, modifier = Modifier.size(32.dp), strokeWidth = 2.dp)
            }
        } else if (filtered.isEmpty()) {
            EmptyState(Icons.Default.SwapHoriz, "No transactions found")
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Surface.copy(alpha = 0.9f))
                    .border(1.dp, Border, RoundedCornerShape(16.dp)),
            ) {
                items(filtered, key = { it.id }) { t ->
                    val isIncome = t.notes == "income"
                    val catInfo = CategoryUtils.get(t.category)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onEditTransaction(t.id) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(catInfo.icon, fontSize = 20.sp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(t.merchant.ifBlank { "Untitled" }, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Foreground)
                            Text(
                                "${t.category ?: "Uncategorized"} · ${t.date}",
                                fontSize = 11.sp, color = Muted,
                            )
                        }
                        Text(
                            "${if (isIncome) "+" else "-"}${formatINR(t.amount)}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (isIncome) SuccessLight else DangerLight,
                        )
                        Spacer(Modifier.width(4.dp))
                        IconButton(onClick = { viewModel.delete(t.id) }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Delete, null, tint = Muted, modifier = Modifier.size(14.dp))
                        }
                    }
                    HorizontalDivider(color = Border, thickness = 0.5.dp)
                }
            }
        }
    }
}
