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
import { useAuth } from "./AuthContext";

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
  const { userProfile, loading: authLoading, profileLoading } = useAuth();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Org | null>(null);

  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsSource, setOrgsSource] = useState<"api" | "empty">("empty");
  const [orgsError, setOrgsError] = useState<string | null>(null);

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const role = userProfile?.role ?? null;
  const isAdmin = role === "admin";
  const isOrgUser = role === "org_user";
  const assignedOrgId =
    typeof userProfile?.org_id === "string" && userProfile.org_id.trim()
      ? userProfile.org_id.trim()
      : null;

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
    if (authLoading || profileLoading) return;
    if (!userProfile) return;

    void loadOrgs();
  }, [authLoading, profileLoading, userProfile, loadOrgs]);

  useEffect(() => {
    if (authLoading || profileLoading || orgsLoading) return;
    if (!userProfile) return;

    if (!orgs.length) {
      setCurrentOrgState(null);
      safeRemoveLS(LOCAL_STORAGE_KEY);
      return;
    }

    if (isOrgUser) {
      if (!assignedOrgId) {
        setCurrentOrgState(null);
        setOrgsError("No org is assigned to this account.");
        safeRemoveLS(LOCAL_STORAGE_KEY);
        return;
      }

      const found =
        orgs.find((o) => o.id === assignedOrgId) ||
        orgs.find((o) => (o.slug || ensureSlug(o)) === assignedOrgId);

      if (!found) {
        setCurrentOrgState(null);
        setOrgsError("Assigned org was not found in the organizations list.");
        safeRemoveLS(LOCAL_STORAGE_KEY);
        return;
      }

      const normalized: Org = { ...found, slug: ensureSlug(found) };
      setCurrentOrgState(normalized);
      safeRemoveLS(LOCAL_STORAGE_KEY);
      return;
    }

    if (isAdmin) {
      const savedId = safeGetLS(LOCAL_STORAGE_KEY);
      const envDefaultId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;

      const desiredId = savedId || envDefaultId || orgs[0].id;
      const found = orgs.find((o) => o.id === desiredId) || orgs[0];

      const normalized: Org = { ...found, slug: ensureSlug(found) };
      setCurrentOrgState(normalized);
      safeSetLS(LOCAL_STORAGE_KEY, normalized.id);
      return;
    }

    setCurrentOrgState(null);
    safeRemoveLS(LOCAL_STORAGE_KEY);
  }, [
    authLoading,
    profileLoading,
    orgsLoading,
    orgs,
    userProfile,
    isAdmin,
    isOrgUser,
    assignedOrgId,
  ]);

  const setCurrentOrg = useCallback(
    (org: Org | null) => {
      if (!isAdmin) {
        return;
      }

      if (!org) {
        setCurrentOrgState(null);
        safeRemoveLS(LOCAL_STORAGE_KEY);
        return;
      }

      const normalized: Org = { ...org, slug: ensureSlug(org) };
      setCurrentOrgState(normalized);
      safeSetLS(LOCAL_STORAGE_KEY, normalized.id);
    },
    [isAdmin]
  );

  const refreshOrgs = useCallback(async () => {
    await loadOrgs();
  }, [loadOrgs]);

  const visibleOrgs = useMemo(() => {
    const normalized = orgs.map((o) => ({ ...o, slug: ensureSlug(o) }));

    if (isOrgUser) {
      return currentOrg ? [currentOrg] : [];
    }

    return normalized;
  }, [orgs, currentOrg, isOrgUser]);

  const value = useMemo<OrgContextValue>(
    () => ({
      currentOrg,
      setCurrentOrg,
      orgs: visibleOrgs,
      orgsLoading,
      orgsSource,
      orgsError,
      lastSyncedAt,
      refreshOrgs,
    }),
    [
      currentOrg,
      setCurrentOrg,
      visibleOrgs,
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