"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export function LiveTiming() {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getLiveTimingUrl()
      .then((data) => setUrl(data.url))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <p className="text-neutral-500 text-sm">Cargando...</p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <p className="text-neutral-500 text-sm">
          No hay URL de live timing configurada para este circuito.
          <br />
          <span className="text-neutral-600 text-xs">
            Configura el campo &quot;Live Timing URL&quot; en Admin &gt; Circuitos.
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
