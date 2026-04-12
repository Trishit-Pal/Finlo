package com.finlo.app.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finlo.app.data.remote.api.FinloApi
import com.finlo.app.data.remote.dto.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val loading: Boolean = true,
    val totalSpent: Double = 0.0,
    val topCategories: List<CategoryTotal> = emptyList(),
    val weeklyTrend: List<WeeklyTrend> = emptyList(),
    val budgetStatus: List<BudgetStatusDto> = emptyList(),
    val suggestions: List<SuggestionDto> = emptyList(),
    val upcomingBills: List<BillDto> = emptyList(),
    val timeframe: String = "month",
)

@HiltViewModel
class DashboardViewModel @Inject constructor(private val api: FinloApi) : ViewModel() {

    private val _state = MutableStateFlow(DashboardUiState())
    val state = _state.asStateFlow()

    init { load("month") }

    fun load(timeframe: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, timeframe = timeframe)
            try {
                val dash = api.getDashboard(timeframe)
                val bills = runCatching { api.getUpcomingBills() }.getOrDefault(emptyList())
                val categories = dash.totalsByCategory.orEmpty().sortedByDescending { it.total }
                _state.value = _state.value.copy(
                    loading = false,
                    totalSpent = categories.sumOf { it.total },
                    topCategories = categories.take(3),
                    weeklyTrend = dash.weeklyTrend.orEmpty(),
                    budgetStatus = dash.budgetStatus.orEmpty(),
                    suggestions = dash.coachSuggestions.orEmpty(),
                    upcomingBills = bills.take(5),
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun dismissSuggestion(id: String) {
        viewModelScope.launch {
            runCatching { api.respondSuggestion(id, mapOf("action" to "rejected")) }
            _state.value = _state.value.copy(suggestions = _state.value.suggestions.filter { it.id != id })
        }
    }
}
