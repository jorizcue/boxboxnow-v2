package com.boxboxnow.app.ble

import android.os.SystemClock
import com.boxboxnow.app.models.GPSSample
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Parser for the RaceBox Mini UBX-like BLE data stream.
 *
 * Protocol:
 *   0xB5 0x62 | class | id | lenL lenH | payload | CK_A CK_B
 * RaceBox Data Message: class=0xFF, id=0x01, payload=80 bytes.
 */
class UbxParser {
    var onParsed: ((GPSSample) -> Unit)? = null

    private val buffer = ArrayDeque<Byte>()

    private val syncA: Byte = 0xB5.toByte()
    private val syncB: Byte = 0x62.toByte()
    private val raceboxClass: Byte = 0xFF.toByte()
    private val raceboxDataId: Byte = 0x01.toByte()
    private val expectedPayloadLen = 80

    fun feed(data: ByteArray) {
        for (b in data) buffer.addLast(b)
        parse()
    }

    fun reset() { buffer.clear() }

    private fun parse() {
        while (buffer.size >= 8) {
            val syncIdx = findSync() ?: run { buffer.clear(); return }
            repeat(syncIdx) { buffer.removeFirst() }
            if (buffer.size < 6) return

            val lenL = buffer.elementAt(4).toInt() and 0xFF
            val lenH = buffer.elementAt(5).toInt() and 0xFF
            val payloadLen = lenL or (lenH shl 8)
            val total = 6 + payloadLen + 2
            if (buffer.size < total) return

            val packet = ByteArray(total)
            for (i in 0 until total) packet[i] = buffer.elementAt(i)

            val cls = packet[2]
            val id = packet[3]
            if (verifyChecksum(packet) &&
                cls == raceboxClass &&
                id == raceboxDataId &&
                payloadLen == expectedPayloadLen
            ) {
                val payload = ByteArray(payloadLen)
                System.arraycopy(packet, 6, payload, 0, payloadLen)
                parseRaceBoxData(payload)?.let { onParsed?.invoke(it) }
            }
            repeat(total) { buffer.removeFirst() }
        }
    }

    private fun findSync(): Int? {
        if (buffer.size < 2) return null
        for (i in 0 until buffer.size - 1) {
            if (buffer.elementAt(i) == syncA && buffer.elementAt(i + 1) == syncB) return i
        }
        return null
    }

    private fun verifyChecksum(p: ByteArray): Boolean {
        var a = 0
        var b = 0
        for (i in 2 until p.size - 2) {
            a = (a + (p[i].toInt() and 0xFF)) and 0xFF
            b = (b + a) and 0xFF
        }
        return a == (p[p.size - 2].toInt() and 0xFF) && b == (p[p.size - 1].toInt() and 0xFF)
    }

    private fun parseRaceBoxData(p: ByteArray): GPSSample? {
        if (p.size < 80) return null
        val bb = ByteBuffer.wrap(p).order(ByteOrder.LITTLE_ENDIAN)

        fun i4(o: Int) = bb.getInt(o)
        fun i2(o: Int) = bb.getShort(o)
        fun u1(o: Int) = p[o].toInt() and 0xFF

        val fixType = u1(20)
        val numSat = u1(23)
        val lon = i4(24).toDouble() * 1e-7
        val lat = i4(28).toDouble() * 1e-7
        val alt = i4(36).toDouble() / 1000.0         // mm → m
        val spdMms = i4(48).toDouble()                // mm/s (signed)
        val hdg = i4(52).toDouble() * 1e-5            // deg
        val battery = u1(67) and 0x7F                 // lower 7 bits
        val gfx = i2(68).toDouble() / 1000.0          // milli-G → G
        val gfy = i2(70).toDouble() / 1000.0
        val gfz = i2(72).toDouble() / 1000.0

        val spdKmh = kotlin.math.abs(spdMms) * 3.6 / 1000.0

        return GPSSample(
            timestamp = SystemClock.elapsedRealtime() / 1000.0,
            lat = lat,
            lon = lon,
            altitudeM = alt,
            speedKmh = spdKmh,
            headingDeg = hdg,
            gForceX = gfx,
            gForceY = gfy,
            gForceZ = gfz,
            fixType = fixType,
            numSatellites = numSat,
            batteryPercent = battery,
        )
    }
}
