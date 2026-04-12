package com.finlo.app.ui.navigation

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.finlo.app.ui.auth.LoginScreen
import com.finlo.app.ui.auth.SignupScreen
import com.finlo.app.ui.bills.BillsScreen
import com.finlo.app.ui.budgets.BudgetsScreen
import com.finlo.app.ui.dashboard.DashboardScreen
import com.finlo.app.ui.debts.DebtsScreen
import com.finlo.app.ui.savings.SavingsScreen
import com.finlo.app.ui.settings.SettingsScreen
import com.finlo.app.ui.transactions.TransactionsScreen
import com.finlo.app.ui.transactions.AddEditTransactionScreen
import com.finlo.app.ui.theme.*
import com.finlo.app.util.TokenManager

@Composable
fun FinloNavHost(tokenManager: TokenManager) {
    val navController = rememberNavController()
    val startDestination = if (tokenManager.isLoggedIn) Screen.Dashboard.route else Routes.LOGIN

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val bottomBarScreens = Screen.entries.map { it.route }
    val showBottomBar = currentRoute in bottomBarScreens

    Scaffold(
        containerColor = Background,
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(
                    containerColor = Surface,
                    contentColor = Foreground,
                    tonalElevation = 0.dp,
                    modifier = Modifier.height(64.dp),
                ) {
                    Screen.entries.forEach { screen ->
                        val selected = navBackStackEntry?.destination?.hierarchy?.any { it.route == screen.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                Icon(
                                    if (selected) screen.selectedIcon else screen.icon,
                                    contentDescription = screen.label,
                                    modifier = Modifier.size(22.dp),
                                )
                            },
                            label = { Text(screen.label, fontSize = 11.sp) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = PrimaryLight,
                                selectedTextColor = PrimaryLight,
                                unselectedIconColor = Muted,
                                unselectedTextColor = Muted,
                                indicatorColor = Primary.copy(alpha = 0.12f),
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier.padding(padding),
            enterTransition = { fadeIn(tween(200)) },
            exitTransition = { fadeOut(tween(200)) },
        ) {
            // Auth
            composable(Routes.LOGIN) {
                LoginScreen(
                    onLoginSuccess = {
                        navController.navigate(Screen.Dashboard.route) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                    onNavigateToSignup = { navController.navigate(Routes.SIGNUP) },
                )
            }
            composable(Routes.SIGNUP) {
                SignupScreen(
                    onSignupSuccess = {
                        navController.navigate(Screen.Dashboard.route) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                    onNavigateBack = { navController.popBackStack() },
                )
            }

            // Main tabs
            composable(Screen.Dashboard.route) {
                DashboardScreen(
                    onNavigateToTransactions = { navController.navigate(Screen.Transactions.route) },
                    onAddTransaction = { navController.navigate(Routes.ADD_TRANSACTION) },
                )
            }
            composable(Screen.Transactions.route) {
                TransactionsScreen(
                    onAddTransaction = { navController.navigate(Routes.ADD_TRANSACTION) },
                    onEditTransaction = { id -> navController.navigate("edit_transaction/$id") },
                )
            }
            composable(Screen.Bills.route) { BillsScreen() }
            composable(Screen.Budgets.route) { BudgetsScreen() }
            composable(Screen.Settings.route) {
                SettingsScreen(
                    onNavigateToDebts = { navController.navigate(Routes.DEBTS) },
                    onNavigateToSavings = { navController.navigate(Routes.SAVINGS) },
                    onLogout = {
                        tokenManager.clear()
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                )
            }

            // Secondary
            composable(Routes.DEBTS) { DebtsScreen(onBack = { navController.popBackStack() }) }
            composable(Routes.SAVINGS) { SavingsScreen(onBack = { navController.popBackStack() }) }
            composable(Routes.ADD_TRANSACTION) {
                AddEditTransactionScreen(onDone = { navController.popBackStack() })
            }
            composable(Routes.EDIT_TRANSACTION) { backStack ->
                val id = backStack.arguments?.getString("id") ?: ""
                AddEditTransactionScreen(editId = id, onDone = { navController.popBackStack() })
            }
        }
    }
}
