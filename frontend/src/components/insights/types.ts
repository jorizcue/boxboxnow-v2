// Types for the GPS Insights module. Field names mirror exactly what the
// backend (`/api/gps/laps`) returns — do not rename here without also
// updating gps_routes.py / pydantic_models.py.

export interface CircuitOption {
  id: number;
  name: string;
  finish_lat1?: number | null;
  finish_lon1?: number | null;
  finish_lat2?: number | null;
  finish_lon2?: number | null;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** Summary row returned by GET /api/gps/laps (no traces). */
export interface GpsLapSummary {
  id: number;
  user_id: number;
  circuit_id: number | null;
  race_session_id: number | null;
  lap_number: number;
  duration_ms: number;
  total_distance_m: number;
  max_speed_kmh: number | null;
  gps_source: string | null;
  recorded_at: string | null;
}

/** Detail returned by GET /api/gps/laps/:id (with traces). */
export interface GpsLapDetail extends GpsLapSummary {
  distances: number[] | null;       // cumulative meters per sample
  timestamps: number[] | null;      // seconds since start of lap
  positions: LatLon[] | null;
  speeds: number[] | null;          // km/h per sample
  gforce_lat: number[] | null;      // lateral G per sample
  gforce_lon: number[] | null;      // longitudinal G per sample
}

export interface GpsStats {
  total_laps: number;
  best_lap_ms: number | null;
  avg_lap_ms: number | null;
  top_speed_kmh: number | null;
  total_distance_km: number;
}
