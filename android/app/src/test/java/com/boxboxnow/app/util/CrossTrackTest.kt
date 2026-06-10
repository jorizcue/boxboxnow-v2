package com.boxboxnow.app.util

import org.junit.Assert.assertEquals
import org.junit.Test

class HarnessTest {
    @Test fun harnessRuns() { assertEquals(4, 2 + 2) }
}

class CrossTrackProjectionTest {
    @Test fun footAtMidpoint() {
        val (t, perp) = GeoUtils.crossTrackProjection(0.0, 0.0005, 0.0, 0.0, 0.0, 0.001)
        assertEquals(0.5, t, 0.02)
        assert(perp < 0.5)
    }
    @Test fun perpendicularOffset() {
        val (t, perp) = GeoUtils.crossTrackProjection(0.00005, 0.0005, 0.0, 0.0, 0.0, 0.001)
        assertEquals(0.5, t, 0.02)
        assertEquals(5.566, perp, 0.3)
    }
    @Test fun clampBeyondEnd() {
        val (t, _) = GeoUtils.crossTrackProjection(0.0, 0.002, 0.0, 0.0, 0.0, 0.001)
        assertEquals(1.0, t, 1e-9)
    }
    @Test fun degenerateSegment() {
        val (t, perp) = GeoUtils.crossTrackProjection(0.0, 0.0005, 0.0, 0.0, 0.0, 0.0)
        assertEquals(0.0, t, 1e-9)
        assert(perp > 1.0)
    }
}
