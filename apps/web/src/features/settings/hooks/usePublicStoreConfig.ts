"use client";

import { useEffect, useState } from "react";
import { getPublicStoreConfig, type PublicStoreConfig } from "../api/settings.client";

// One request per page load, shared by every component that asks (order
// detail, checkout, …). A failed load is retried on the next page load.
let inFlight: Promise<PublicStoreConfig | null> | null = null;

function loadConfig(): Promise<PublicStoreConfig | null> {
  inFlight ??= getPublicStoreConfig()
    .then((res) => res.config)
    .catch(() => {
      inFlight = null;
      return null;
    });
  return inFlight;
}

/**
 * Public store settings for UI decisions only (hide "Request a return", explain
 * the COD delivery-fee split). The server enforces every one of these rules on
 * its own; `config` is null while loading or if it couldn't load, and callers
 * treat null as the conservative default (feature off).
 */
export function usePublicStoreConfig(): { config: PublicStoreConfig | null; loading: boolean } {
  const [config, setConfig] = useState<PublicStoreConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadConfig().then((result) => {
      if (cancelled) return;
      setConfig(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading };
}
