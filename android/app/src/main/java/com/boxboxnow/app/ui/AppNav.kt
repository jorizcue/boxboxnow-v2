package com.boxboxnow.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.boxboxnow.app.ui.config.CardOrderPreviewScreen
import com.boxboxnow.app.ui.config.CardVisibilityScreen
import com.boxboxnow.app.ui.config.ConfigScreen
import com.boxboxnow.app.ui.config.GpsConfigScreen
import com.boxboxnow.app.ui.config.PresetsScreen
import com.boxboxnow.app.ui.config.SessionConfigScreen
import com.boxboxnow.app.ui.driver.DriverScreen
import com.boxboxnow.app.ui.home.HomeScreen
import com.boxboxnow.app.ui.login.LoginScreen
import com.boxboxnow.app.vm.AuthViewModel

object Routes {
    const val LOGIN = "login"
    const val HOME = "home"
    const val CONFIG = "config"
    const val SESSION_CONFIG = "config/session"
    const val CARD_VISIBILITY = "config/card-visibility"
    const val CARD_ORDER = "config/card-order"
    const val PRESETS = "config/presets"
    const val GPS_CONFIG = "config/gps"
    const val DRIVER = "driver"
}

@Composable
fun AppNav(onStartGoogleSso: () -> Unit = {}) {
    val authVM: AuthViewModel = hiltViewModel()
    val isAuth by authVM.isAuthenticated.collectAsState()
    val nav = rememberNavController()

    val start = if (isAuth) Routes.HOME else Routes.LOGIN
    NavHost(navController = nav, startDestination = start) {
        composable(Routes.LOGIN) {
            LoginScreen(
                authVM = authVM,
                onLoggedIn = { nav.navigate(Routes.HOME) { popUpTo(Routes.LOGIN) { inclusive = true } } },
                onStartGoogleSso = onStartGoogleSso,
            )
        }
        composable(Routes.HOME) {
            HomeScreen(
                authVM = authVM,
                onOpenConfig = { nav.navigate(Routes.CONFIG) },
                onOpenDriver = { nav.navigate(Routes.DRIVER) },
            )
        }
        composable(Routes.CONFIG) {
            ConfigScreen(
                onBack = { nav.popBackStack() },
                onOpenSession = { nav.navigate(Routes.SESSION_CONFIG) },
                onOpenCardVisibility = { nav.navigate(Routes.CARD_VISIBILITY) },
                onOpenCardOrder = { nav.navigate(Routes.CARD_ORDER) },
                onOpenPresets = { nav.navigate(Routes.PRESETS) },
                onOpenGps = { nav.navigate(Routes.GPS_CONFIG) },
            )
        }
        composable(Routes.SESSION_CONFIG) { SessionConfigScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.CARD_VISIBILITY) { CardVisibilityScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.CARD_ORDER) { CardOrderPreviewScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.PRESETS) { PresetsScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.GPS_CONFIG) { GpsConfigScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.DRIVER) { DriverScreen(onBack = { nav.popBackStack() }) }
    }
}
