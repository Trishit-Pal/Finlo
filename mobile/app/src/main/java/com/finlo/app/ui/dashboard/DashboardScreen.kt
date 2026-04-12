package com.finlo.app.ui.dashboard

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.finlo.app.ui.components.*
import com.finlo.app.ui.theme.*

@Composable
fun DashboardScreen(
    onNavigateToTransactions: () -> Unit,
    onAddTransaction: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val timeframes = listOf("today" to "Today", "week" to "Week", "month" to "Month", "year" to "Year")

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            // Header
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("Dashboard", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Foreground)
                    Text("Your financial overview", style = MaterialTheme.typography.bodySmall, color = Muted)
                }
            }

            Spacer(Modifier.height(16.dp))

            // Timeframe selector
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White.copy(alpha = 0.04f))
                    .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(12.dp))
                    .padding(4.dp),
            ) {
                timeframes.forEach { (key, label) ->
                    val selected = state.timeframe == key
                    Text(
                        label,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (selected) Primary.copy(alpha = 0.15f) else Color.Transparent)
                            .clickable { viewModel.load(key) }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (selected) Foreground else Muted,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // Stat cards row
            if (state.loading) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    repeat(2) {
                        Box(
                            Modifier.weight(1f).height(100.dp).clip(RoundedCornerShape(16.dp))
                                .background(Surface.copy(alpha = 0.6f))
                        )
                    }
                }
            } else {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard(
                        label = "TOTAL SPEND",
                        value = formatINR(state.totalSpent),
                        icon = Icons.Default.CurrencyRupee,
                        iconTint = PrimaryLight,
                        modifier = Modifier.weight(1f),
                    )
                    StatCard(
                        label = "UPCOMING BILLS",
                        value = "${state.upcomingBills.size}",
                        icon = Icons.Default.CalendarMonth,
                        iconTint = WarningLight,
                        subtitle = "next 7 days",
                        modifier = Modifier.weight(1f),
                    )
                }

                Spacer(Modifier.height(12.dp))

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard(
                        label = "ACTIVE BUDGETS",
                        value = "${state.budgetStatus.size}",
                        icon = Icons.Default.TrackChanges,
                        iconTint = SuccessLight,
                        modifier = Modifier.weight(1f),
                    )
                    StatCard(
                        label = "POTENTIAL SAVINGS",
                        value = formatINR(state.suggestions.sumOf { it.estimatedSavings ?: 0.0 }),
                        icon = Icons.Default.AutoAwesome,
                        iconTint = PrimaryLight,
                        subtitle = "${state.suggestions.size} suggestions",
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // Top Categories
            GlassPanel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CreditCard, null, tint = PrimaryLight, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Top Categories", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Foreground)
                }
                Spacer(Modifier.height(16.dp))
                if (state.topCategories.isEmpty()) {
                    Text("No spending data yet", style = MaterialTheme.typography.bodySmall, color = Muted)
                } else {
                    val colors = listOf(Primary, Warning, Color(0xFF14B8A6))
                    state.topCategories.forEachIndexed { i, cat ->
                        val pct = if (state.totalSpent > 0) (cat.total / state.totalSpent).toFloat() else 0f
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(cat.category ?: "Uncategorized", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Foreground)
                            Text("${formatINR(cat.total)} (${(pct * 100).toInt()}%)", fontSize = 12.sp, color = Muted)
                        }
                        Spacer(Modifier.height(6.dp))
                        FinloProgressBar(pct, colors.getOrElse(i) { Muted })
                        if (i < state.topCategories.lastIndex) Spacer(Modifier.height(12.dp))
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Budget Status
            if (state.budgetStatus.isNotEmpty()) {
                GlassPanel {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.TrackChanges, null, tint = PrimaryLight, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Budget Status", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Foreground)
                    }
                    Spacer(Modifier.height(16.dp))
                    state.budgetStatus.forEachIndexed { i, b ->
                        val pct = (b.percent / 100f).coerceIn(0f, 1f)
                        val color = when (b.alert) {
                            "hard" -> Danger
                            "soft" -> Warning
                            else -> Success
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(b.category, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Foreground)
                            Text("${formatINR(b.spent)} / ${formatINR(b.limit)}", fontSize = 12.sp, color = Muted)
                        }
                        Spacer(Modifier.height(6.dp))
                        FinloProgressBar(pct, color)
                        if (b.alert != "none") {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                if (b.alert == "hard") "Budget exceeded!" else "Approaching limit",
                                fontSize = 11.sp, color = color,
                            )
                        }
                        if (i < state.budgetStatus.lastIndex) Spacer(Modifier.height(12.dp))
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            // Upcoming Bills
            if (state.upcomingBills.isNotEmpty()) {
                GlassPanel {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Receipt, null, tint = WarningLight, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Upcoming Bills", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Foreground)
                    }
                    Spacer(Modifier.height(12.dp))
                    state.upcomingBills.forEach { bill ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color.White.copy(alpha = 0.02f))
                                .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(12.dp))
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column {
                                Text(bill.name, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Foreground)
                                Text("Due ${bill.dueDate}", fontSize = 11.sp, color = Muted)
                            }
                            Text(formatINR(bill.amount), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = DangerLight)
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            // AI Insights
            if (state.suggestions.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.AutoAwesome, null, tint = PrimaryLight, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("AI Insights", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Foreground)
                }
                Spacer(Modifier.height(12.dp))
                state.suggestions.forEach { s ->
                    GlassPanel {
                        Row(Modifier.fillMaxWidth()) {
                            Box(
                                Modifier.width(3.dp).height(40.dp).clip(RoundedCornerShape(2.dp))
                                    .background(Brush.verticalGradient(listOf(PrimaryLight, Primary)))
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(s.summary, fontSize = 13.sp, color = Muted, lineHeight = 18.sp)
                                if (s.estimatedSavings != null && s.estimatedSavings > 0) {
                                    Spacer(Modifier.height(8.dp))
                                    Text("Save ~${formatINR(s.estimatedSavings)}", fontSize = 12.sp, color = SuccessLight, fontWeight = FontWeight.Medium)
                                }
                            }
                            IconButton(onClick = { viewModel.dismissSuggestion(s.id) }, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.Default.Close, null, tint = Muted, modifier = Modifier.size(14.dp))
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }

            Spacer(Modifier.height(80.dp)) // FAB clearance
        }

        // FAB
        FloatingActionButton(
            onClick = onAddTransaction,
            containerColor = Primary,
            contentColor = Color.White,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = 16.dp)
                .size(56.dp),
            elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 8.dp),
        ) {
            Icon(Icons.Default.Add, "Add transaction", modifier = Modifier.size(24.dp))
        }
    }
}
