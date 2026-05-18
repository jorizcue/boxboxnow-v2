"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useRaceStore } from "@/hooks/useRaceState";

export function LiveTiming() {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const replayActive = useRaceStore((s) => s.replayActive);
  const replayFilename = useRaceStore((s) => s.replayFilename);
  const replayCircuitDir = useRaceStore((s) => s.replayCircuitDir);
  const replayStartBlock = useRaceStore((s) => s.replayStartBlock);
  const replaySpeed = useRaceStore((s) => s.replaySpeed);
  const replayPaused = useRaceStore((s) => s.replayPaused);

  useEffect(() => {
    api
      .getLiveTimingUrl()
      .then((data) => setUrl(data.url))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Send command to Apex iframe
  const sendToIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // The dashboard keeps this mounted but display:none on inactive
  // tabs. An iframe whose Apex layout was computed at 0×0 (hidden)
  // renders broken/half when later shown. When the wrapper resizes
  // 0→visible, force the iframe to recompute its layout (same-origin
  // replay: dispatch a real resize; cross-origin live: best-effort).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
      try {
        iframeRef.current?.contentWindow?.dispatchEvent(new Event("resize"));
      } catch {
        /* cross-origin (live URL) — fall back to postMessage */
      }
      sendToIframe({ type: "bbn_relayout" });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [url, loading, replayActive, replayFilename, sendToIframe]);

  // Sync speed changes to Apex iframe
  useEffect(() => {
    if (!replayActive) return;
    sendToIframe({ type: "bbn_replay_speed", speed: replaySpeed });
  }, [replaySpeed, replayActive, sendToIframe]);

  // Sync pause/resume to Apex iframe
  const prevPaused = useRef(replayPaused);
  useEffect(() => {
    if (!replayActive) return;
    if (prevPaused.current !== replayPaused) {
      sendToIframe({ type: "bbn_replay_pause" });
      prevPaused.current = replayPaused;
    }
  }, [replayPaused, replayActive, sendToIframe]);

  // Stop Apex iframe when replay stops
  const prevActive = useRef(replayActive);
  useEffect(() => {
    if (prevActive.current && !replayActive) {
      sendToIframe({ type: "bbn_replay_stop" });
    }
    prevActive.current = replayActive;
  }, [replayActive, sendToIframe]);

  // Build Apex replay URL when replay is active
  const apexReplayUrl = useMemo(() => {
    if (!replayActive || !replayFilename) return null;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const params = new URLSearchParams({
      filename: replayFilename,
      start_block: String(replayStartBlock),
      speed: String(replaySpeed),
    });
    if (replayCircuitDir) {
      params.set("circuit_dir", replayCircuitDir);
    }
    return `${apiBase}/api/apex-replay/viewer?${params}`;
    // Only rebuild URL on new replay start, not on speed changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayActive, replayFilename, replayCircuitDir, replayStartBlock]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-500 text-sm">{t("live.loading")}</p>
      </div>
    );
  }

  // Show Apex viewer when replay is active
  if (apexReplayUrl) {
    return (
      <div ref={wrapRef} className="w-full h-full rounded-xl overflow-hidden border border-border relative">
        <iframe
          ref={iframeRef}
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
      <div className="flex items-center justify-center h-full">
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
    <div ref={wrapRef} className="w-full h-full rounded-xl overflow-hidden border border-border">
      <iframe
        src={url}
        className="w-full h-full"
        allow="fullscreen"
        title="Live Timing"
      />
    </div>
  );
}
