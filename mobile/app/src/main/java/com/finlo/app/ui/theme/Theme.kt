package com.finlo.app.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val FinloDarkScheme = darkColorScheme(
    primary = Primary,
    onPrimary = Foreground,
    primaryContainer = PrimaryDark,
    onPrimaryContainer = PrimaryLight,
    secondary = Accent,
    onSecondary = Foreground,
    secondaryContainer = Accent,
    background = Background,
    onBackground = Foreground,
    surface = Surface,
    onSurface = Foreground,
    surfaceVariant = Elevated,
    onSurfaceVariant = Muted,
    outline = Border,
    outlineVariant = BorderHover,
    error = Danger,
    onError = Foreground,
    errorContainer = Danger.copy(alpha = 0.12f),
    tertiary = Success,
    onTertiary = Foreground,
)

@Composable
fun FinloTheme(content: @Composable () -> Unit) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Background.toArgb()
            window.navigationBarColor = Background.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = FinloDarkScheme,
        typography = FinloTypography,
        content = content,
    )
}
