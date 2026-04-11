"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
  useCallback,
} from "react";

export type Org = {
  id: string;
  slug?: string;
  name: string;
  plan?: "Free" | "Pro" | "Enterprise";
  country?: string;
};

type OrgContextValue = {
  currentOrg: Org | null;
  setCurrentOrg: (org: Org | null) => void;
  orgs: Org[];

  orgsLoading: boolean;
  orgsSource: "api" | "empty";
  orgsError: string | null;

  lastSyncedAt: string | null;
  refreshOrgs: () => Promise<void>;
};

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = "anti_hate_current_org_id";

function safeGetLS(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLS(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemoveLS(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function ensureSlug(o: Org) {
  return o.slug || o.id.replaceAll("_", "-");
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Org | null>(null);

  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsSource, setOrgsSource] = useState<"api" | "empty">("empty");
  const [orgsError, setOrgsError] = useState<string | null>(null);

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    setOrgsLoading(true);
    setOrgsError(null);

    try {
      const res = await fetch("/api/orgs", { cache: "no-store" });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `GET /api/orgs failed: ${res.status}`);
      }

      const data = await res.json();

      const apiOrgs: Org[] = Array.isArray(data?.orgs)
        ? data.orgs
            .map((o: any) => ({
              id: String(o.id ?? "").trim(),
              slug: (o.slug as string | undefined) ?? undefined,
              name: String(o.name ?? "").trim(),
              plan: (o.plan ?? undefined) as Org["plan"] | undefined,
              country: (o.country ?? undefined) as string | undefined,
            }))
            .filter((o: Org) => o.id && o.name)
        : [];

      setOrgs(apiOrgs);
      setOrgsSource(apiOrgs.length > 0 ? "api" : "empty");
      setLastSyncedAt(new Date().toISOString());
    } catch (e: any) {
      setOrgs([]);
      setCurrentOrgState(null);
      setOrgsSource("empty");
      setOrgsError(e?.message ?? "Failed to load orgs");
      setLastSyncedAt(null);
      safeRemoveLS(LOCAL_STORAGE_KEY);
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (orgsLoading) return;

    if (!orgs.length) {
      setCurrentOrgState(null);
      safeRemoveLS(LOCAL_STORAGE_KEY);
      return;
    }

    const savedId = safeGetLS(LOCAL_STORAGE_KEY);
    const envDefaultId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;

    const desiredId = savedId || envDefaultId || orgs[0].id;
    const found = orgs.find((o) => o.id === desiredId) || orgs[0];

    const normalized: Org = { ...found, slug: ensureSlug(found) };
    setCurrentOrgState(normalized);
    safeSetLS(LOCAL_STORAGE_KEY, normalized.id);
  }, [orgsLoading, orgs]);

  const setCurrentOrg = useCallback((org: Org | null) => {
    if (!org) {
      setCurrentOrgState(null);
      safeRemoveLS(LOCAL_STORAGE_KEY);
      return;
    }

    const normalized: Org = { ...org, slug: ensureSlug(org) };
    setCurrentOrgState(normalized);
    safeSetLS(LOCAL_STORAGE_KEY, normalized.id);
  }, []);

  const refreshOrgs = useCallback(async () => {
    await loadOrgs();
  }, [loadOrgs]);

  const value = useMemo<OrgContextValue>(
    () => ({
      currentOrg,
      setCurrentOrg,
      orgs: orgs.map((o) => ({ ...o, slug: ensureSlug(o) })),
      orgsLoading,
      orgsSource,
      orgsError,
      lastSyncedAt,
      refreshOrgs,
    }),
    [
      currentOrg,
      setCurrentOrg,
      orgs,
      orgsLoading,
      orgsSource,
      orgsError,
      lastSyncedAt,
      refreshOrgs,
    ]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within an OrgProvider");
  return ctx;
}