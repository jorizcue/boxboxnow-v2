package com.boxboxnow.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.boxboxnow.app.ui.config.ConfigScreen
import com.boxboxnow.app.ui.config.GpsConfigScreen
import com.boxboxnow.app.ui.config.PresetsScreen
import com.boxboxnow.app.ui.config.SessionConfigScreen
import com.boxboxnow.app.ui.config.TemplateWizardScreen
import com.boxboxnow.app.ui.driver.DriverScreen
import com.boxboxnow.app.ui.home.HomeScreen
import com.boxboxnow.app.ui.login.LoginScreen
import com.boxboxnow.app.vm.AuthViewModel

object Routes {
    const val LOGIN = "login"
    const val HOME = "home"
    const val CONFIG = "config"
    const val SESSION_CONFIG = "config/session"
    const val PRESETS = "config/presets"
    const val TEMPLATE_WIZARD = "config/template-wizard"
    const val BOX_CONFIG = "config/box"
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
                onOpenSession = { nav.navigate(Routes.SESSION_CONFIG) },
            )
        }
        composable(Routes.CONFIG) {
            ConfigScreen(
                onBack = { nav.popBackStack() },
                onOpenSession = { nav.navigate(Routes.SESSION_CONFIG) },
                onOpenBox = { nav.navigate(Routes.BOX_CONFIG) },
                onOpenPresets = { nav.navigate(Routes.PRESETS) },
                onOpenGps = { nav.navigate(Routes.GPS_CONFIG) },
            )
        }
        composable(Routes.SESSION_CONFIG) { SessionConfigScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.BOX_CONFIG) { BoxConfigScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.PRESETS) {
            PresetsScreen(
                onBack = { nav.popBackStack() },
                onCreateNew = { nav.navigate(Routes.TEMPLATE_WIZARD) },
            )
        }
        composable(Routes.TEMPLATE_WIZARD) {
            TemplateWizardScreen(onBack = { nav.popBackStack() })
        }
        composable(Routes.GPS_CONFIG) { GpsConfigScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.DRIVER) { DriverScreen(onBack = { nav.popBackStack() }) }
    }
}
