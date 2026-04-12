package com.finlo.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── Auth ────────────────────────────────────────────────────────────────────

@Serializable
data class SignupRequest(val email: String, val password: String, @SerialName("full_name") val fullName: String)

@Serializable
data class SigninRequest(val email: String, val password: String)

@Serializable
data class OAuthCallbackRequest(@SerialName("access_token") val accessToken: String)

@Serializable
data class RefreshRequest(@SerialName("refresh_token") val refreshToken: String)

@Serializable
data class AuthResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    val user: UserDto,
)

@Serializable
data class UserDto(
    val id: String,
    val email: String,
    @SerialName("full_name") val fullName: String? = null,
    val currency: String = "INR",
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val settings: Map<String, kotlinx.serialization.json.JsonElement>? = null,
)

// ── Transaction ─────────────────────────────────────────────────────────────

@Serializable
data class TransactionDto(
    val id: String,
    val date: String,
    val merchant: String,
    val amount: Double,
    val category: String? = null,
    @SerialName("category_confidence") val categoryConfidence: Double? = null,
    @SerialName("payment_mode") val paymentMode: String? = null,
    val tags: List<String>? = null,
    @SerialName("is_recurring") val isRecurring: Boolean = false,
    @SerialName("recurrence_frequency") val recurrenceFrequency: String? = null,
    val source: String = "manual",
    @SerialName("receipt_id") val receiptId: String? = null,
    val notes: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class TransactionListResponse(
    val items: List<TransactionDto>,
    val total: Int,
    val offset: Int,
    val limit: Int,
)

@Serializable
data class TransactionCreateRequest(
    val date: String,
    val merchant: String,
    val amount: Double,
    val category: String? = null,
    val notes: String? = null,
    @SerialName("payment_mode") val paymentMode: String? = null,
    val tags: List<String>? = null,
    @SerialName("is_recurring") val isRecurring: Boolean = false,
    @SerialName("recurrence_frequency") val recurrenceFrequency: String? = null,
)

// ── Dashboard ───────────────────────────────────────────────────────────────

@Serializable
data class DashboardResponse(
    @SerialName("totals_by_category") val totalsByCategory: List<CategoryTotal>? = null,
    @SerialName("weekly_trend") val weeklyTrend: List<WeeklyTrend>? = null,
    @SerialName("budget_status") val budgetStatus: List<BudgetStatusDto>? = null,
    @SerialName("coach_suggestions") val coachSuggestions: List<SuggestionDto>? = null,
)

@Serializable
data class CategoryTotal(val category: String? = null, val total: Double = 0.0)

@Serializable
data class WeeklyTrend(val week: String, val total: Double)

@Serializable
data class BudgetStatusDto(
    @SerialName("budget_id") val budgetId: String,
    val category: String,
    val spent: Double,
    val limit: Double,
    val percent: Double,
    val alert: String = "none",
)

@Serializable
data class SuggestionDto(
    val id: String,
    val summary: String,
    @SerialName("estimated_savings") val estimatedSavings: Double? = null,
    val actions: List<SuggestionAction>? = null,
)

@Serializable
data class SuggestionAction(val text: String, @SerialName("weekly_savings") val weeklySavings: Double? = null)

// ── Bill ────────────────────────────────────────────────────────────────────

@Serializable
data class BillDto(
    val id: String,
    val name: String,
    val amount: Double,
    @SerialName("is_variable") val isVariable: Boolean = false,
    @SerialName("due_date") val dueDate: String,
    val frequency: String = "monthly",
    val category: String? = null,
    @SerialName("reminder_lead_days") val reminderLeadDays: Int = 3,
    @SerialName("is_paid") val isPaid: Boolean = false,
    @SerialName("auto_create_expense") val autoCreateExpense: Boolean = false,
)

@Serializable
data class BillCreateRequest(
    val name: String,
    val amount: Double,
    @SerialName("is_variable") val isVariable: Boolean = false,
    @SerialName("due_date") val dueDate: String,
    val frequency: String = "monthly",
    val category: String? = null,
    @SerialName("reminder_lead_days") val reminderLeadDays: Int = 3,
    @SerialName("auto_create_expense") val autoCreateExpense: Boolean = false,
)

// ── Budget ──────────────────────────────────────────────────────────────────

@Serializable
data class BudgetDto(
    val id: String,
    val category: String,
    @SerialName("limit_amount") val limitAmount: Double,
    val month: Int,
    val year: Int,
    val spent: Double = 0.0,
    val remaining: Double = 0.0,
    @SerialName("alert_level") val alertLevel: String = "none",
    @SerialName("rollover_enabled") val rolloverEnabled: Boolean = false,
)

@Serializable
data class BudgetListResponse(val items: List<BudgetDto>)

@Serializable
data class BudgetCreateRequest(
    val category: String,
    @SerialName("limit_amount") val limitAmount: Double,
    val month: Int,
    val year: Int,
    @SerialName("rollover_enabled") val rolloverEnabled: Boolean = false,
)

// ── Debt ────────────────────────────────────────────────────────────────────

@Serializable
data class DebtDto(
    val id: String,
    val name: String,
    val type: String,
    @SerialName("total_amount") val totalAmount: Double,
    @SerialName("remaining_balance") val remainingBalance: Double,
    @SerialName("interest_rate") val interestRate: Double? = null,
    @SerialName("emi_amount") val emiAmount: Double? = null,
    @SerialName("next_due_date") val nextDueDate: String? = null,
    @SerialName("lender_name") val lenderName: String? = null,
    @SerialName("is_settled") val isSettled: Boolean = false,
)

@Serializable
data class DebtSummaryDto(
    @SerialName("total_outstanding") val totalOutstanding: Double,
    @SerialName("monthly_emi_total") val monthlyEmiTotal: Double,
    @SerialName("active_count") val activeCount: Int,
)

@Serializable
data class DebtCreateRequest(
    val name: String,
    val type: String,
    @SerialName("total_amount") val totalAmount: Double,
    @SerialName("remaining_balance") val remainingBalance: Double,
    @SerialName("interest_rate") val interestRate: Double? = null,
    @SerialName("emi_amount") val emiAmount: Double? = null,
    @SerialName("next_due_date") val nextDueDate: String? = null,
    @SerialName("lender_name") val lenderName: String? = null,
)

// ── Savings ─────────────────────────────────────────────────────────────────

@Serializable
data class SavingsGoalDto(
    val id: String,
    val name: String,
    @SerialName("target_amount") val targetAmount: Double,
    @SerialName("current_amount") val currentAmount: Double = 0.0,
    val deadline: String? = null,
)

@Serializable
data class SavingsGoalCreateRequest(
    val name: String,
    @SerialName("target_amount") val targetAmount: Double,
    val deadline: String? = null,
)

// ── Category ────────────────────────────────────────────────────────────────

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    @SerialName("is_archived") val isArchived: Boolean = false,
)
