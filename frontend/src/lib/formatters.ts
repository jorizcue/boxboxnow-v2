/**
 * Convert milliseconds to M:SS.mmm display format.
 */
export function msToLapTime(ms: number): string {
  if (ms <= 0) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  }
  return `${seconds}.${millis.toString().padStart(3, "0")}`;
}

/**
 * Convert seconds to MM:SS.dd display format (2 decimal places on seconds).
 */
export function secondsToStint(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const secWhole = Math.floor(sec);
  const secFrac = Math.floor((sec - secWhole) * 100);
  return `${min}:${secWhole.toString().padStart(2, "0")}.${secFrac.toString().padStart(2, "0")}`;
}

/**
 * Convert countdown milliseconds to HH:MM:SS.
 */
export function msToCountdown(ms: number): string {
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  const prefix = ms < 0 ? "+" : "";
  return `${prefix}${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get the CSS color class for a tier score (KartingNow palette).
 */
export function tierColor(score: number): string {
  if (score >= 100) return "text-tier-100";
  if (score >= 75) return "text-tier-75";
  if (score >= 50) return "text-tier-50";
  if (score >= 25) return "text-tier-25";
  return "text-tier-1";
}

/**
 * Get the hex color for a tier score (KartingNow palette).
 */
export function tierHex(score: number): string {
  if (score >= 100) return "#9fe556";  // brand green
  if (score >= 75) return "#c8e946";
  if (score >= 50) return "#e5d43a";
  if (score >= 25) return "#e59a2e";
  return "#e54444";
}

/**
 * Convert seconds to HH:MM:SS display format.
 */
export function secondsToHMS(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format a driver differential in seconds.
 */
export function formatDifferential(ms: number): string {
  if (ms === 0) return "REF";
  const sign = ms > 0 ? "+" : "";
  return `${sign}${(ms / 1000).toFixed(1)}s`;
}
