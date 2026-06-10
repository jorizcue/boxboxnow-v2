package com.boxboxnow.app.lap

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Test

class LapTrackerDeltaTest {
    private fun straightRef(): LapTracker.LapRecord {
        val n = 200
        val d = ArrayList<Double>(); val t = ArrayList<Double>(); val p = ArrayList<Pair<Double, Double>>()
        for (i in 0 until n) {
            val f = i.toDouble() / (n - 1)
            d.add(f * 111.0); t.add(f * 4.0); p.add(0.0 to f * 0.001)
        }
        return LapTracker.LapRecord(1, 4000.0, 111.0, 100.0, d, t, p, emptyList(), emptyList(), emptyList())
    }

    // Points at f≈0.25 (lon 0.00025) fall inside the fwd window of anchor 0.
    @Test fun zeroDeltaWhenOnReference() {
        val r = LapTracker.crossTrackDeltaForTest(straightRef(), 0.0, 0.00025, 1000.0)
        assertNotNull(r); assertEquals(0.0, r!!.first, 80.0)
    }
    @Test fun positiveDeltaWhenSlower() {
        val r = LapTracker.crossTrackDeltaForTest(straightRef(), 0.0, 0.00025, 1300.0)
        assertEquals(300.0, r!!.first, 80.0)
    }
    @Test fun lateralOffsetSameTimeNearZero() {
        val r = LapTracker.crossTrackDeltaForTest(straightRef(), 0.00005, 0.00025, 1000.0)
        assertEquals(0.0, r!!.first, 100.0)
    }
    @Test fun nilWhenOffTrack() {
        val r = LapTracker.crossTrackDeltaForTest(straightRef(), 0.00054, 0.00025, 1000.0)
        assertNull(r)
    }
}
