package com.finlo.app.ui.settings

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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finlo.app.data.remote.api.FinloApi
import com.finlo.app.data.remote.dto.UserDto
import com.finlo.app.ui.theme.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(private val api: FinloApi) : ViewModel() {
    private val _user = MutableStateFlow<UserDto?>(null)
    val user = _user.asStateFlow()

    init {
        viewModelScope.launch {
            try { _user.value = api.getMe() } catch (_: Exception) {}
        }
    }
}

@Composable
fun SettingsScreen(
    onNavigateToDebts: () -> Unit,
    onNavigateToSavings: () -> Unit,
    onLogout: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val user by viewModel.user.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Settings", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Foreground)

        // Profile card
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Surface.copy(alpha = 0.9f))
                .border(1.dp, Border, RoundedCornerShape(16.dp))
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(Primary.copy(alpha = 0.15f))
                    .border(1.dp, Primary.copy(alpha = 0.3f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                val initials = user?.fullName?.split(" ")
                    ?.mapNotNull { it.firstOrNull()?.uppercase() }
                    ?.take(2)?.joinToString("") ?: "?"
                Text(initials, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = PrimaryLight)
            }
            Column {
                Text(user?.fullName ?: "Loading...", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Foreground)
                Text(user?.email ?: "", fontSize = 12.sp, color = Muted)
            }
        }

        // Navigation section
        SettingsSection("Features") {
            SettingsItem(icon = Icons.Default.AccountBalance, label = "Debts & Loans", subtitle = "Track loans and IOUs", color = DangerLight, onClick = onNavigateToDebts)
            SettingsItem(icon = Icons.Default.Savings, label = "Savings Goals", subtitle = "Track savings targets", color = SuccessLight, onClick = onNavigateToSavings)
        }

        SettingsSection("Preferences") {
            SettingsItem(icon = Icons.Default.Notifications, label = "Notifications", subtitle = "Bill reminders, budget alerts", color = WarningLight)
            SettingsItem(icon = Icons.Default.Palette, label = "Appearance", subtitle = "Theme, display settings", color = AccentLight)
            SettingsItem(icon = Icons.Default.Category, label = "Categories", subtitle = "Manage expense categories", color = PrimaryLight)
        }

        SettingsSection("Data") {
            SettingsItem(icon = Icons.Default.CloudDownload, label = "Export Data", subtitle = "Download CSV or PDF", color = Info)
            SettingsItem(icon = Icons.Default.Security, label = "Security", subtitle = "PIN, biometric lock", color = SuccessLight)
        }

        SettingsSection("About") {
            SettingsItem(icon = Icons.Default.Info, label = "About Finlo", subtitle = "Version 1.0.0", color = Muted)
            SettingsItem(icon = Icons.Default.Help, label = "Help & Support", subtitle = "FAQ, report issues", color = PrimaryLight)
        }

        // Logout
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, DangerLight.copy(alpha = 0.3f)),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerLight),
        ) {
            Icon(Icons.Default.Logout, null, Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
            Text("Sign Out", fontWeight = FontWeight.Medium, fontSize = 14.sp)
        }

        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column {
        Text(title, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Muted, letterSpacing = 0.5.sp,
            modifier = Modifier.padding(bottom = 8.dp, start = 4.dp))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Surface.copy(alpha = 0.9f))
                .border(1.dp, Border, RoundedCornerShape(16.dp)),
        ) {
            content()
        }
    }
}

@Composable
private fun SettingsItem(
    icon: ImageVector,
    label: String,
    subtitle: String,
    color: Color,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(color.copy(0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = color, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(label, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Foreground)
            Text(subtitle, fontSize = 11.sp, color = Muted)
        }
        if (onClick != null) {
            Icon(Icons.Default.ChevronRight, null, tint = Muted.copy(0.5f), modifier = Modifier.size(16.dp))
        }
    }
}
