package com.finlo.app.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finlo.app.data.remote.api.FinloApi
import com.finlo.app.data.remote.dto.TransactionCreateRequest
import com.finlo.app.data.remote.dto.TransactionDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TransactionsUiState(
    val loading: Boolean = true,
    val transactions: List<TransactionDto> = emptyList(),
    val searchQuery: String = "",
    val filterCategory: String = "",
    val error: String? = null,
)

@HiltViewModel
class TransactionsViewModel @Inject constructor(private val api: FinloApi) : ViewModel() {

    private val _state = MutableStateFlow(TransactionsUiState())
    val state = _state.asStateFlow()

    init { load() }

    fun clearError() { _state.value = _state.value.copy(error = null) }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val res = api.getTransactions(limit = 100)
                _state.value = _state.value.copy(loading = false, transactions = res.items)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = "Failed to load transactions")
            }
        }
    }

    fun setSearch(q: String) { _state.value = _state.value.copy(searchQuery = q) }
    fun setFilter(cat: String) { _state.value = _state.value.copy(filterCategory = cat) }

    val filtered get() = _state.value.let { s ->
        s.transactions.filter { t ->
            (s.searchQuery.isBlank() || t.merchant.contains(s.searchQuery, true) || (t.category ?: "").contains(s.searchQuery, true)) &&
            (s.filterCategory.isBlank() || t.category == s.filterCategory)
        }
    }

    fun delete(id: String) {
        val backup = _state.value.transactions
        _state.value = _state.value.copy(transactions = backup.filter { it.id != id }, error = null)
        viewModelScope.launch {
            try { api.deleteTransaction(id) } catch (_: Exception) {
                _state.value = _state.value.copy(transactions = backup, error = "Failed to delete transaction")
            }
        }
    }

    fun createTransaction(req: TransactionCreateRequest, onDone: () -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(error = null)
            try {
                api.createTransaction(req)
                load()
                onDone()
            } catch (_: Exception) {
                _state.value = _state.value.copy(error = "Failed to create transaction")
            }
        }
    }

    fun updateTransaction(id: String, fields: Map<String, Any?>, onDone: () -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(error = null)
            try {
                api.updateTransaction(id, fields)
                load()
                onDone()
            } catch (_: Exception) {
                _state.value = _state.value.copy(error = "Failed to update transaction")
            }
        }
    }

    fun loadTransaction(id: String, onLoaded: (TransactionDto) -> Unit) {
        viewModelScope.launch {
            try {
                val all = api.getTransactions(limit = 200)
                val txn = all.items.find { it.id == id }
                if (txn != null) onLoaded(txn)
                else _state.value = _state.value.copy(error = "Transaction not found")
            } catch (_: Exception) {
                _state.value = _state.value.copy(error = "Failed to load transaction details")
            }
        }
    }
}
