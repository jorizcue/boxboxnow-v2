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
 * Convert seconds to MM:SS display format.
 */
export function secondsToStint(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
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
 * Get the CSS color class for a tier score.
 */
export function tierColor(score: number): string {
  if (score >= 100) return "text-tier-100";
  if (score >= 75) return "text-tier-75";
  if (score >= 50) return "text-tier-50";
  if (score >= 25) return "text-tier-25";
  return "text-tier-1";
}

/**
 * Get the background color for a tier score.
 */
export function tierBg(score: number): string {
  if (score >= 100) return "bg-tier-100";
  if (score >= 75) return "bg-tier-75";
  if (score >= 50) return "bg-tier-50";
  if (score >= 25) return "bg-tier-25";
  return "bg-tier-1";
}

/**
 * Get the hex color for a tier score.
 */
export function tierHex(score: number): string {
  if (score >= 100) return "#00ff00";
  if (score >= 75) return "#80ff00";
  if (score >= 50) return "#ffff00";
  if (score >= 25) return "#ff8000";
  return "#ff0000";
}
