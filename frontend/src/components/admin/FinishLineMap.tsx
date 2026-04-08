"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  p1: LatLng | null;
  p2: LatLng | null;
  onChange: (p1: LatLng | null, p2: LatLng | null) => void;
}

const MARKER_COLORS = { p1: "#22c55e", p2: "#ef4444" };

function createIcon(color: string, label: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};border:3px solid white;
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:700;color:white;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    ">${label}</div>`,
  });
}

export default function FinishLineMap({ p1, p2, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ p1: L.Marker | null; p2: L.Marker | null }>({ p1: null, p2: null });
  const lineRef = useRef<L.Polyline | null>(null);
  const [placing, setPlacing] = useState<"p1" | "p2" | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: L.LatLngExpression = p1
      ? [p1.lat, p1.lng]
      : [40.4168, -3.7038]; // Default: Madrid

    const map = L.map(containerRef.current, {
      center,
      zoom: p1 ? 17 : 6,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync markers with props
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Update P1
    if (p1) {
      if (markersRef.current.p1) {
        markersRef.current.p1.setLatLng([p1.lat, p1.lng]);
      } else {
        markersRef.current.p1 = L.marker([p1.lat, p1.lng], {
          icon: createIcon(MARKER_COLORS.p1, "1"),
          draggable: true,
        }).addTo(map);
        markersRef.current.p1.on("dragend", () => {
          const ll = markersRef.current.p1!.getLatLng();
          onChange({ lat: ll.lat, lng: ll.lng }, p2);
        });
      }
    } else if (markersRef.current.p1) {
      markersRef.current.p1.remove();
      markersRef.current.p1 = null;
    }

    // Update P2
    if (p2) {
      if (markersRef.current.p2) {
        markersRef.current.p2.setLatLng([p2.lat, p2.lng]);
      } else {
        markersRef.current.p2 = L.marker([p2.lat, p2.lng], {
          icon: createIcon(MARKER_COLORS.p2, "2"),
          draggable: true,
        }).addTo(map);
        markersRef.current.p2.on("dragend", () => {
          const ll = markersRef.current.p2!.getLatLng();
          onChange(p1, { lat: ll.lat, lng: ll.lng });
        });
      }
    } else if (markersRef.current.p2) {
      markersRef.current.p2.remove();
      markersRef.current.p2 = null;
    }

    // Update line
    if (p1 && p2) {
      if (lineRef.current) {
        lineRef.current.setLatLngs([[p1.lat, p1.lng], [p2.lat, p2.lng]]);
      } else {
        lineRef.current = L.polyline(
          [[p1.lat, p1.lng], [p2.lat, p2.lng]],
          { color: "#facc15", weight: 3, dashArray: "8,6" }
        ).addTo(map);
      }
    } else if (lineRef.current) {
      lineRef.current.remove();
      lineRef.current = null;
    }
  }, [p1?.lat, p1?.lng, p2?.lat, p2?.lng]);

  // Click handler for placing mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: L.LeafletMouseEvent) => {
      if (!placing) return;
      const pt = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (placing === "p1") {
        onChange(pt, p2);
        setPlacing(p2 ? null : "p2");
      } else {
        onChange(p1, pt);
        setPlacing(null);
      }
    };

    map.on("click", handler);
    if (placing) {
      map.getContainer().style.cursor = "crosshair";
    } else {
      map.getContainer().style.cursor = "";
    }

    return () => {
      map.off("click", handler);
    };
  }, [placing, p1?.lat, p1?.lng, p2?.lat, p2?.lng]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPlacing(placing === "p1" ? null : "p1")}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
            placing === "p1"
              ? "bg-green-500 text-white"
              : "bg-white/10 text-neutral-300 hover:bg-white/15"
          }`}
        >
          {placing === "p1" ? "Haz click en el mapa..." : "P1 (inicio)"}
        </button>
        <button
          type="button"
          onClick={() => setPlacing(placing === "p2" ? null : "p2")}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
            placing === "p2"
              ? "bg-red-500 text-white"
              : "bg-white/10 text-neutral-300 hover:bg-white/15"
          }`}
        >
          {placing === "p2" ? "Haz click en el mapa..." : "P2 (fin)"}
        </button>
        {(p1 || p2) && (
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setPlacing(null);
            }}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-white/10 text-red-400 hover:bg-white/15 transition-colors"
          >
            Borrar
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        className="h-[300px] rounded-lg border border-border overflow-hidden"
      />
    </div>
  );
}
