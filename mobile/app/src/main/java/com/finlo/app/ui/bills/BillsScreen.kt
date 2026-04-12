package com.finlo.app.ui.bills

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finlo.app.data.remote.api.FinloApi
import com.finlo.app.data.remote.dto.BillDto
import com.finlo.app.ui.components.*
import com.finlo.app.ui.theme.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class BillsViewModel @Inject constructor(private val api: FinloApi) : ViewModel() {
    private val _bills = MutableStateFlow<List<BillDto>>(emptyList())
    val bills = _bills.asStateFlow()
    private val _loading = MutableStateFlow(true)
    val loading = _loading.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _loading.value = true
            try { _bills.value = api.getBills() } catch (_: Exception) {}
            _loading.value = false
        }
    }

    fun markPaid(id: String) {
        viewModelScope.launch {
            try { api.markBillPaid(id); load() } catch (_: Exception) {}
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            try { api.deleteBill(id); load() } catch (_: Exception) {}
        }
    }
}

@Composable
fun BillsScreen(viewModel: BillsViewModel = hiltViewModel()) {
    val bills by viewModel.bills.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val today = java.time.LocalDate.now().toString()

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text("Bills & Reminders", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Foreground)
        Text("Track recurring bills and due dates", style = MaterialTheme.typography.bodySmall, color = Muted)

        Spacer(Modifier.height(16.dp))

        // Summary
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val unpaid = bills.filter { !it.isPaid }
            listOf(
                Triple("Unpaid", formatINR(unpaid.sumOf { it.amount }), DangerLight),
                Triple("Overdue", "${unpaid.count { it.dueDate < today }}", Danger),
                Triple("Total", "${bills.size}", PrimaryLight),
            ).forEach { (label, value, color) ->
                StatCard(label = label, value = value, icon = Icons.Default.Receipt, iconTint = color, modifier = Modifier.weight(1f))
            }
        }

        Spacer(Modifier.height(16.dp))

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary, modifier = Modifier.size(32.dp), strokeWidth = 2.dp)
            }
        } else if (bills.isEmpty()) {
            EmptyState(Icons.Default.Notifications, "No bills tracked yet")
        } else {
            LazyColumn(
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Surface.copy(0.9f)).border(1.dp, Border, RoundedCornerShape(16.dp)),
            ) {
                items(bills, key = { it.id }) { bill ->
                    val isPaid = bill.isPaid
                    val isOverdue = !isPaid && bill.dueDate < today
                    val statusColor = if (isPaid) SuccessLight else if (isOverdue) Danger else WarningLight
                    val statusLabel = if (isPaid) "Paid" else if (isOverdue) "Overdue" else "Upcoming"

                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(statusColor.copy(0.12f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                if (isPaid) Icons.Default.CheckCircle else if (isOverdue) Icons.Default.Warning else Icons.Default.Schedule,
                                null, tint = statusColor, modifier = Modifier.size(16.dp),
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(bill.name, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Foreground)
                                Text(statusLabel, fontSize = 10.sp, color = statusColor,
                                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(statusColor.copy(0.1f)).padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                            Text("Due ${bill.dueDate} · ${bill.frequency}", fontSize = 11.sp, color = Muted)
                        }
                        Text(formatINR(bill.amount), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (isPaid) SuccessLight else DangerLight)
                        if (!isPaid) {
                            IconButton(onClick = { viewModel.markPaid(bill.id) }, Modifier.size(32.dp)) {
                                Icon(Icons.Default.Check, "Mark paid", tint = SuccessLight, modifier = Modifier.size(14.dp))
                            }
                        }
                        IconButton(onClick = { viewModel.delete(bill.id) }, Modifier.size(32.dp)) {
                            Icon(Icons.Default.Delete, "Delete", tint = Muted, modifier = Modifier.size(14.dp))
                        }
                    }
                    HorizontalDivider(color = Border, thickness = 0.5.dp)
                }
            }
        }
    }
}
