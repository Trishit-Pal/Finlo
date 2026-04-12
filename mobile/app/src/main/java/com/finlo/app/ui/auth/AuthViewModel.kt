package com.finlo.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finlo.app.data.remote.api.FinloApi
import com.finlo.app.data.remote.dto.SigninRequest
import com.finlo.app.data.remote.dto.SignupRequest
import com.finlo.app.util.TokenManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val api: FinloApi,
    private val tokenManager: TokenManager,
) : ViewModel() {

    private val _state = MutableStateFlow(AuthUiState())
    val state = _state.asStateFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _state.value = AuthUiState(loading = true)
            try {
                val res = api.signin(SigninRequest(email, password))
                tokenManager.accessToken = res.accessToken
                tokenManager.refreshToken = res.refreshToken
                _state.value = AuthUiState(success = true)
            } catch (e: Exception) {
                _state.value = AuthUiState(error = e.message ?: "Login failed")
            }
        }
    }

    fun signup(email: String, password: String, name: String) {
        viewModelScope.launch {
            _state.value = AuthUiState(loading = true)
            try {
                val res = api.signup(SignupRequest(email, password, name))
                tokenManager.accessToken = res.accessToken
                tokenManager.refreshToken = res.refreshToken
                _state.value = AuthUiState(success = true)
            } catch (e: Exception) {
                _state.value = AuthUiState(error = e.message ?: "Signup failed")
            }
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
