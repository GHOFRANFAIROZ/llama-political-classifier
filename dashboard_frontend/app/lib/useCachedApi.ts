// app/lib/useCachedApi.ts
"use client";

import { useEffect, useRef, useState } from "react";

type CacheEntry<T> = { ts: number; data: T };

const memoryCache = new Map<string, CacheEntry<any>>();

function safeGetLocal<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.ts !== "number") return null;
    return obj as CacheEntry<T>;
  } catch {
    return null;
  }
}

function safeSetLocal<T>(key: string, entry: CacheEntry<T>) {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {}
}

/**
 * useCachedApi
 * - cache in-memory + localStorage (optional)
 * - TTL
 * - abort old request
 * - returns cached data instantly if available
 */
export function useCachedApi<T>(opts: {
  key: string;          // unique cache key (include orgId/dateRange)
  url: string;          // fetch url
  ttlMs?: number;       // default 60s
  persist?: boolean;    // localStorage on/off (default true)
  enabled?: boolean;    // allow disabling (default true)
}) {
  const { key, url, ttlMs = 60_000, persist = true, enabled = true } = opts;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!enabled);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    const localKey = `ahm_cache_v1::${key}`;

    // 1) Memory cache hit
    const mem = memoryCache.get(localKey) as CacheEntry<T> | undefined;
    if (mem && now - mem.ts < ttlMs) {
      setData(mem.data);
      setLoading(false);
      setError(null);
      return;
    }

    // 2) LocalStorage cache hit
    if (persist) {
      const loc = safeGetLocal<T>(localKey);
      if (loc && now - loc.ts < ttlMs) {
        setData(loc.data);
        setLoading(false);
        setError(null);

        // hydrate memory cache
        memoryCache.set(localKey, loc);
        return;
      }
    }

    // 3) Fetch fresh
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "Request failed");
        }
        const json = (await res.json()) as T;

        const entry: CacheEntry<T> = { ts: Date.now(), data: json };
        memoryCache.set(localKey, entry);
        if (persist) safeSetLocal(localKey, entry);

        setData(json);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Unexpected error");
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [key, url, ttlMs, persist, enabled]);

  return { data, loading, error };
}