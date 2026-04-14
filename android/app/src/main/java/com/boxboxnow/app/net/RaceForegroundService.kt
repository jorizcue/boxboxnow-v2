package com.boxboxnow.app.net

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.boxboxnow.app.R

/**
 * Minimal foreground service so BLE + WebSocket keep running when the screen is
 * off during a race. Start it when the pilot enters DriverView, stop on exit.
 *
 * NOTE: on Android 14+ you must declare `foregroundServiceType` in the manifest
 * (we declare connectedDevice|location) and the service must actually be using
 * one of those subsystems, which it is (BLE + optional phone GPS).
 */
class RaceForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannel()
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("BoxBoxNow")
            .setContentText("Sesion de carrera activa")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .build()
        startForeground(NOTIF_ID, notification)
        return START_STICKY
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        mgr.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Race session",
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
    }

    companion object {
        private const val CHANNEL_ID = "race_session"
        private const val NOTIF_ID = 1

        fun start(context: Context) {
            val intent = Intent(context, RaceForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, RaceForegroundService::class.java))
        }
    }
}
