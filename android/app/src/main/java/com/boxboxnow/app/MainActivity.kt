package com.boxboxnow.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.boxboxnow.app.i18n.LanguageStore
import com.boxboxnow.app.i18n.LocalLanguage
import com.boxboxnow.app.ui.AppNav
import com.boxboxnow.app.ui.theme.BoxBoxNowColors
import com.boxboxnow.app.ui.theme.BoxBoxNowTheme
import com.boxboxnow.app.util.Constants
import com.boxboxnow.app.vm.AuthViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    // Same instance as `hiltViewModel<AuthViewModel>()` used inside AppNav,
    // because AppNav is composed at Activity scope (LocalViewModelStoreOwner
    // == this Activity).
    private val authVM: AuthViewModel by viewModels()

    private val permLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { /* results logged by individual screens when they need them */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        requestRuntimePermissions()

        // Hydrate the i18n store from SharedPreferences BEFORE composition
        // starts, so the first frame already renders in the user's
        // persisted language and we avoid a one-frame flash of Spanish
        // when they had switched to e.g. English on a previous launch.
        LanguageStore.init(applicationContext)

        // Handle a boxboxnow:// launch URI if the activity was created by it
        handleAuthDeepLink(intent)

        setContent {
            // Provide the active Language to the whole tree via a
            // CompositionLocal. Every `t(key)` call site reads
            // `LocalLanguage.current`, so flipping the language from the
            // toolbar picker recomposes everything that uses it.
            val activeLang by LanguageStore.state
            CompositionLocalProvider(LocalLanguage provides activeLang) {
                BoxBoxNowTheme {
                    Surface(
                        modifier = Modifier.fillMaxSize().background(Color.Black),
                        color = Color.Black,
                    ) {
                        AppNav(onStartGoogleSso = { launchGoogleSso() })
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthDeepLink(intent)
    }

    // ─────────────────────── Google SSO ───────────────────────

    /** Opens the backend Google OAuth start URL in a Chrome Custom Tab. */
    private fun launchGoogleSso() {
        val url = "${Constants.API_BASE_URL}/auth/google/ios"
        val intent = CustomTabsIntent.Builder()
            .setShowTitle(false)
            .setUrlBarHidingEnabled(true)
            .setDefaultColorSchemeParams(
                CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(Color.Black.toArgb())
                    .setNavigationBarColor(Color.Black.toArgb())
                    .setSecondaryToolbarColor(BoxBoxNowColors.SystemGray6.toArgb())
                    .build(),
            )
            .build()
        try {
            intent.launchUrl(this, Uri.parse(url))
        } catch (e: Throwable) {
            authVM.googleLoginFailed(e.message)
        }
    }

    /**
     * Parses a `boxboxnow://auth?token=…` or `boxboxnow://auth?error=…` callback
     * delivered by the Custom Tab redirect after Google OAuth completes.
     */
    private fun handleAuthDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "boxboxnow") return

        val error = data.getQueryParameter("error")
        if (error != null) {
            val msg = if (error == "no_account")
                "No existe una cuenta con ese email de Google"
            else "Error: $error"
            authVM.googleLoginFailed(msg)
            return
        }

        val token = data.getQueryParameter("token")
        if (token.isNullOrBlank()) {
            authVM.googleLoginFailed("No se recibio token de autenticacion")
            return
        }
        authVM.completeGoogleLogin(token)
    }

    // ─────────────────────── Permissions ───────────────────────

    private fun requestRuntimePermissions() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN)
                != PackageManager.PERMISSION_GRANTED
            ) needed += Manifest.permission.BLUETOOTH_SCAN
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED
            ) needed += Manifest.permission.BLUETOOTH_CONNECT
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) needed += Manifest.permission.ACCESS_FINE_LOCATION

        if (needed.isNotEmpty()) permLauncher.launch(needed.toTypedArray())
    }
}
