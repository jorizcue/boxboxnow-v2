package com.boxboxnow.app.ble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.boxboxnow.app.util.Constants
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Android BLE manager for RaceBox devices. Mirrors the iOS BLEManager behaviour:
 *   • Deferred scan until the Bluetooth adapter is enabled.
 *   • Unfiltered scan + name-prefix match (RaceBox puts the UART service UUID in
 *     the scan-response payload, so a filtered scan misses it for several seconds).
 *   • ALL_MATCHES scan mode for frequent RSSI updates.
 *   • No throttle on notifications — every BLE packet goes to the parser so we
 *     don't lose samples when the RaceBox runs at 50Hz.
 */
@Singleton
class BleManager @Inject constructor(
    private val context: Context,
) {
    data class DiscoveredDevice(val device: BluetoothDevice, val name: String, val rssi: Int)

    private val _isScanning = MutableStateFlow(false)
    val isScanning = _isScanning.asStateFlow()

    private val _discovered = MutableStateFlow<List<DiscoveredDevice>>(emptyList())
    val discovered = _discovered.asStateFlow()

    private val _connectedDevice = MutableStateFlow<BluetoothDevice?>(null)
    val connectedDevice = _connectedDevice.asStateFlow()

    private val _rssi = MutableStateFlow(0)
    val rssi = _rssi.asStateFlow()

    private val _batteryPercent = MutableStateFlow<Int?>(null)
    val batteryPercent = _batteryPercent.asStateFlow()

    /** Raw notification bytes from the UART TX characteristic. */
    var onData: ((ByteArray) -> Unit)? = null

    private val adapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private val uartServiceUuid = UUID.fromString(Constants.Ble.UART_SERVICE_UUID)
    private val uartTxCharUuid = UUID.fromString(Constants.Ble.UART_TX_CHAR_UUID)
    private val cccdUuid = UUID.fromString(Constants.Ble.CCCD_UUID)
    private val raceboxNamePrefixes = listOf("racebox")

    private var gatt: BluetoothGatt? = null

    // ── Scanning ──

    @SuppressLint("MissingPermission")
    fun startScan() {
        val adapter = this.adapter ?: return
        if (!adapter.isEnabled) return
        if (!hasScanPermission()) return

        _discovered.value = emptyList()
        val scanner = adapter.bluetoothLeScanner ?: return
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .build()
        // No ScanFilter: RaceBox advertises the UART service UUID in the scan
        // response rather than the primary advertisement, so a service filter
        // misses it for several seconds. Filter by name in the callback.
        scanner.startScan(null, settings, scanCallback)
        _isScanning.value = true
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        if (!hasScanPermission()) {
            _isScanning.value = false
            return
        }
        adapter?.bluetoothLeScanner?.stopScan(scanCallback)
        _isScanning.value = false
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            val name = result.scanRecord?.deviceName ?: runCatching {
                if (hasConnectPermission()) device.name else null
            }.getOrNull()
            if (!isRaceBoxName(name)) return
            val rssi = result.rssi
            val current = _discovered.value
            if (current.any { it.device.address == device.address }) return
            _discovered.value = current + DiscoveredDevice(device, name ?: "RaceBox", rssi)
        }
    }

    private fun isRaceBoxName(name: String?): Boolean {
        val n = name?.lowercase() ?: return false
        return raceboxNamePrefixes.any { n.startsWith(it) }
    }

    // ── Connection ──

    @SuppressLint("MissingPermission")
    fun connect(device: BluetoothDevice) {
        stopScan()
        if (!hasConnectPermission()) return
        gatt?.close()
        gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        if (!hasConnectPermission()) {
            gatt = null
            _connectedDevice.value = null
            return
        }
        gatt?.disconnect()
        gatt?.close()
        gatt = null
        _connectedDevice.value = null
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    _connectedDevice.value = gatt.device
                    if (hasConnectPermission()) gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    _connectedDevice.value = null
                    if (hasConnectPermission()) gatt.close()
                    this@BleManager.gatt = null
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (!hasConnectPermission()) return
            val svc = gatt.getService(uartServiceUuid) ?: return
            val ch = svc.getCharacteristic(uartTxCharUuid) ?: return
            gatt.setCharacteristicNotification(ch, true)
            val descriptor = ch.getDescriptor(cccdUuid) ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
                @Suppress("DEPRECATION")
                descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION")
                gatt.writeDescriptor(descriptor)
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            // No throttle: pass every BLE notification straight to the UBX
            // parser. A previous 100ms throttle was capping effective rate at
            // ~10Hz and dropping ~80% of RaceBox packets at 50Hz. RaceBox
            // payloads are ~90 bytes; even at 50Hz that's <5KB/s.
            onData?.invoke(value)
        }

        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
        ) {
            // Pre-33 path — fall back to characteristic.value
            val value = characteristic.value ?: return
            onCharacteristicChanged(gatt, characteristic, value)
        }

        override fun onReadRemoteRssi(gatt: BluetoothGatt, rssi: Int, status: Int) {
            _rssi.value = rssi
        }
    }

    // ── Permissions ──

    private fun hasScanPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        }
    }

    private fun hasConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }
}
