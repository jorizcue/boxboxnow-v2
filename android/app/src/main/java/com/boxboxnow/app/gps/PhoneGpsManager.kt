package com.boxboxnow.app.gps

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.boxboxnow.app.models.GPSSample
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Phone-based GPS source: FusedLocationProvider @ 10 Hz + accelerometer for g-force.
 * Mirrors iOS PhoneGPSManager behaviour (emits a GPSSample on every location).
 */
@Singleton
class PhoneGpsManager @Inject constructor(
    private val context: Context,
) : SensorEventListener {
    private val _isUpdating = MutableStateFlow(false)
    val isUpdating = _isUpdating.asStateFlow()

    private val _hasPermission = MutableStateFlow(false)
    val hasPermission = _hasPermission.asStateFlow()

    var onSample: ((GPSSample) -> Unit)? = null

    private val fused = LocationServices.getFusedLocationProviderClient(context)
    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accel: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    private var lastAx: Float = 0f
    private var lastAy: Float = 0f
    private var lastAz: Float = 0f

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val loc = result.lastLocation ?: return
            // Accelerometer values are in m/s²; convert to G (≈9.81 m/s²)
            val sample = GPSSample(
                timestamp = SystemClock.elapsedRealtime() / 1000.0,
                lat = loc.latitude,
                lon = loc.longitude,
                altitudeM = loc.altitude,
                speedKmh = (loc.speed * 3.6).coerceAtLeast(0.0),
                headingDeg = loc.bearing.toDouble().let { if (it < 0) 0.0 else it },
                gForceX = (lastAx / 9.81).toDouble(),
                gForceY = (lastAy / 9.81).toDouble(),
                gForceZ = (lastAz / 9.81).toDouble(),
                fixType = if (loc.accuracy > 0) 3 else 0,
                numSatellites = 0,
                batteryPercent = null,
            )
            onSample?.invoke(sample)
        }
    }

    fun hasFineLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun start() {
        _hasPermission.value = hasFineLocationPermission()
        if (!_hasPermission.value) return
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 100L)
            .setMinUpdateIntervalMillis(100L)
            .build()
        fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
        accel?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
        _isUpdating.value = true
    }

    fun stop() {
        fused.removeLocationUpdates(callback)
        sensorManager.unregisterListener(this)
        _isUpdating.value = false
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
        lastAx = event.values[0]
        lastAy = event.values[1]
        lastAz = event.values[2]
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
