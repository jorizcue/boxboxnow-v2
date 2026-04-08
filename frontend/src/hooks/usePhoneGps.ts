"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useRaceBoxStore, type RaceBoxStatus } from "@/hooks/useRaceBox";
import type { RaceBoxSample } from "@/lib/racebox/ubxParser";

/* ------------------------------------------------------------------ */
/*  Phone GPS hook — feeds the same RaceBox store via Geolocation API  */
/* ------------------------------------------------------------------ */

export function usePhoneGps() {
  const store = useRaceBoxStore();
  const watchIdRef = useRef<number | null>(null);
  const motionRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const connectedRef = useRef(false);
  const [status, setStatus] = useState<RaceBoxStatus>("disconnected");
  const [supported] = useState(() =>
    typeof window !== "undefined" && "geolocation" in navigator
  );

  // DeviceMotion for G-force
  useEffect(() => {
    if (status !== "connected") return;

    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a) {
        motionRef.current = {
          x: (a.x ?? 0) / 9.81,
          y: (a.y ?? 0) / 9.81,
          z: (a.z ?? 0) / 9.81,
        };
      }
    };

    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, [status]);

  const connect = useCallback(async () => {
    if (!supported || watchIdRef.current !== null) return;

    // iOS 13+ requires permission for DeviceMotion
    if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
      try {
        await (DeviceMotionEvent as any).requestPermission();
      } catch {
        // Continue without G-force
      }
    }

    setStatus("connecting");
    store.setStatus("connecting");
    connectedRef.current = false;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!connectedRef.current) {
          connectedRef.current = true;
          setStatus("connected");
          store.setStatus("connected");
        }

        const sample: RaceBoxSample = {
          timestamp: performance.now(),
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          altitudeM: pos.coords.altitude ?? 0,
          speedMms: (pos.coords.speed ?? 0) * 1000,
          speedKmh: (pos.coords.speed ?? 0) * 3.6,
          headingDeg: pos.coords.heading ?? 0,
          gForceX: motionRef.current.x,
          gForceY: motionRef.current.y,
          gForceZ: motionRef.current.z,
          fixType: pos.coords.accuracy < 10 ? 3 : pos.coords.accuracy < 25 ? 2 : 1,
          numSatellites: 0,
          batteryPercent: 0,
        };

        store.addSample(sample);
      },
      (err) => {
        setStatus("error");
        store.setStatus("error", err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  }, [supported]);

  const disconnect = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    connectedRef.current = false;
    setStatus("disconnected");
    store.setStatus("disconnected");
  }, []);

  return {
    supported,
    status,
    connect,
    disconnect,
  };
}
