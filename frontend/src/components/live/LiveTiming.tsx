"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useRaceStore } from "@/hooks/useRaceState";

export function LiveTiming() {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const replayActive = useRaceStore((s) => s.replayActive);
  const replayFilename = useRaceStore((s) => s.replayFilename);
  const replayCircuitDir = useRaceStore((s) => s.replayCircuitDir);
  const replayStartBlock = useRaceStore((s) => s.replayStartBlock);

  useEffect(() => {
    api
      .getLiveTimingUrl()
      .then((data) => setUrl(data.url))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Build Apex replay URL when replay is active
  const apexReplayUrl = useMemo(() => {
    if (!replayActive || !replayFilename) return null;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const params = new URLSearchParams({
      filename: replayFilename,
      start_block: String(replayStartBlock),
      speed: "1",
    });
    if (replayCircuitDir) {
      params.set("circuit_dir", replayCircuitDir);
    }
    return `${apiBase}/api/apex-replay/viewer?${params}`;
  }, [replayActive, replayFilename, replayCircuitDir, replayStartBlock]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <p className="text-neutral-500 text-sm">{t("live.loading")}</p>
      </div>
    );
  }

  // Show Apex viewer when replay is active
  if (apexReplayUrl) {
    return (
      <div className="w-full h-[calc(100vh-120px)] rounded-xl overflow-hidden border border-border relative">
        <iframe
          key={apexReplayUrl}
          src={apexReplayUrl}
          className="w-full h-full"
          allow="fullscreen"
          title="Apex Replay"
        />
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <p className="text-neutral-500 text-sm">
          {t("live.noUrl")}
          <br />
          <span className="text-neutral-600 text-xs">
            {t("live.configHint")}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-120px)] rounded-xl overflow-hidden border border-border">
      <iframe
        src={url}
        className="w-full h-full"
        allow="fullscreen"
        title="Live Timing"
      />
    </div>
  );
}
