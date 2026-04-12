package com.finlo.app.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.ui.graphics.vector.ImageVector

enum class Screen(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector) {
    Dashboard("dashboard", "Home", Icons.Outlined.Dashboard, Icons.Filled.Dashboard),
    Transactions("transactions", "Expenses", Icons.Outlined.SwapHoriz, Icons.Filled.SwapHoriz),
    Bills("bills", "Bills", Icons.Outlined.Notifications, Icons.Filled.Notifications),
    Budgets("budgets", "Budgets", Icons.Outlined.PieChart, Icons.Filled.PieChart),
    Settings("settings", "More", Icons.Outlined.MoreHoriz, Icons.Filled.MoreHoriz),
}

// Secondary screens navigated to from Settings/More
object Routes {
    const val LOGIN = "login"
    const val SIGNUP = "signup"
    const val DEBTS = "debts"
    const val SAVINGS = "savings"
    const val ANALYTICS = "analytics"
    const val ADD_TRANSACTION = "add_transaction"
    const val EDIT_TRANSACTION = "edit_transaction/{id}"
}
