"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

export function LiveTiming() {
  const t = useT();
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
        <p className="text-neutral-500 text-sm">{t("live.loading")}</p>
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
