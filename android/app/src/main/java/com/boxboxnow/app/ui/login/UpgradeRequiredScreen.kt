package com.boxboxnow.app.ui.login

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.boxboxnow.app.BuildConfig
import com.boxboxnow.app.i18n.t
import com.boxboxnow.app.net.AppUpgradeRequiredException
import com.boxboxnow.app.ui.theme.BoxBoxNowColors

/**
 * Blocking surface shown after the backend rejects this build with HTTP
 * 426. There's no retry button — the only way out is to install a newer
 * version from the Play Store. Admins move the floor from the web
 * Admin → Plataforma → "Apps móviles" section.
 */
@Composable
fun UpgradeRequiredScreen(info: AppUpgradeRequiredException) {
    val ctx = LocalContext.current

    Box(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.widthIn(max = 420.dp),
        ) {
            Icon(
                Icons.Filled.CloudDownload,
                contentDescription = null,
                tint = BoxBoxNowColors.Accent,
                modifier = Modifier.size(72.dp),
            )

            Text(
                t("update.title"),
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )

            Text(
                info.message ?: t("update.body"),
                color = Color.White.copy(alpha = 0.72f),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(8.dp))

            // Version breakdown — helpful for support when the user sends
            // a screenshot. Monospaced so versions align.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        color = Color.White.copy(alpha = 0.05f),
                        shape = RoundedCornerShape(10.dp),
                    )
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                metadataRow(t("update.installed"), BuildConfig.VERSION_NAME)
                info.minVersion?.let { metadataRow(t("update.minRequired"), it) }
                info.latestVersion?.takeIf { it != info.minVersion }?.let {
                    metadataRow(t("update.latest"), it)
                }
            }

            Spacer(Modifier.height(8.dp))

            Button(
                onClick = {
                    // Try the Play Store app first, fall back to the web.
                    val playUri = Uri.parse("market://details?id=${ctx.packageName}")
                    val webUri = Uri.parse("https://play.google.com/store/apps/details?id=${ctx.packageName}")
                    runCatching {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, playUri))
                    }.onFailure {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, webUri))
                    }
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = BoxBoxNowColors.Accent,
                    contentColor = Color.Black,
                ),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Text(t("update.openStore"), fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun metadataRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
        Text(value, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}
