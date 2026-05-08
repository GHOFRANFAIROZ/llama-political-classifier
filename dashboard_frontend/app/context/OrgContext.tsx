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

function formatOrgDisplayName(raw?: string | null) {
  if (!raw) return "";

  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

function makeFallbackOrg(orgId: string): Org {
  const cleanId = String(orgId || "").trim();
  return {
    id: cleanId,
    slug: cleanId.replaceAll("_", "-"),
    name: formatOrgDisplayName(cleanId),
  };
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { userProfile, profileLoading } = useAuth();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Org | null>(null);

  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsSource, setOrgsSource] = useState<"api" | "empty">("empty");
  const [orgsError, setOrgsError] = useState<string | null>(null);

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;

    if (userProfile?.role === "org_user" && userProfile.org_id) {
      const fallback = makeFallbackOrg(userProfile.org_id);

      setCurrentOrgState((prev) => {
        if (prev?.id === fallback.id) return prev;
        return fallback;
      });

      safeSetLS(LOCAL_STORAGE_KEY, fallback.id);
    }
  }, [profileLoading, userProfile?.role, userProfile?.org_id]);

  const loadOrgs = useCallback(async () => {
    if (profileLoading) return;

    setOrgsLoading(true);
    setOrgsError(null);

    try {
      const res = await fetch("/api/orgs", { cache: "no-store" });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `GET /api/orgs failed: ${res.status}`);
      }

      const data = await res.json();

      const rawOrgs = Array.isArray(data?.orgs)
        ? data.orgs
        : Array.isArray(data?.results)
          ? data.results
          : [];

      const apiOrgs: Org[] = rawOrgs
        .map((o: any) => {
          const id = String(o?.id ?? o?.org_id ?? "").trim();

          const rawName = String(
            o?.display_name ??
            o?.displayName ??
            o?.name ??
            o?.slug ??
            id
          ).trim();

          const name = formatOrgDisplayName(rawName);

          return {
            id,
            slug: (o?.slug as string | undefined) ?? undefined,
            name,
            plan: (o?.plan ?? undefined) as Org["plan"] | undefined,
            country: (o?.country ?? undefined) as string | undefined,
          };
        })
        .filter((o: Org) => o.id && o.name);

      let visibleOrgs = apiOrgs;

      if (userProfile?.role === "org_user") {
        if (!userProfile.org_id) {
          visibleOrgs = [];
        } else {
          const matched = apiOrgs.find((o) => o.id === userProfile.org_id);

          if (matched) {
            visibleOrgs = [{ ...matched, slug: ensureSlug(matched) }];
          } else {
            visibleOrgs = [makeFallbackOrg(userProfile.org_id)];
            setOrgsError(
              `Assigned organization was not found in org list: ${userProfile.org_id}`
            );
          }
        }
      }

      setOrgs(visibleOrgs);
      setOrgsSource(apiOrgs.length > 0 ? "api" : "empty");
      setLastSyncedAt(new Date().toISOString());
    } catch (e: any) {
      const fallbackOrg =
        userProfile?.role === "org_user" && userProfile.org_id
          ? makeFallbackOrg(userProfile.org_id)
          : null;

      if (fallbackOrg) {
        setOrgs([fallbackOrg]);
        setCurrentOrgState(fallbackOrg);
        setOrgsSource("empty");
        setOrgErrorSafe(e?.message ?? "Failed to load orgs");
        setLastSyncedAt(null);
        safeSetLS(LOCAL_STORAGE_KEY, fallbackOrg.id);
      } else {
        setOrgs([]);
        setCurrentOrgState(null);
        setOrgsSource("empty");
        setOrgsError(e?.message ?? "Failed to load orgs");
        setLastSyncedAt(null);
        safeRemoveLS(LOCAL_STORAGE_KEY);
      }
    } finally {
      setOrgsLoading(false);
    }
  }, [profileLoading, userProfile?.role, userProfile?.org_id]);

  function setOrgErrorSafe(message: string) {
    setOrgsError(message);
  }

  useEffect(() => {
    if (profileLoading) return;
    void loadOrgs();
  }, [profileLoading, loadOrgs]);

  useEffect(() => {
    if (profileLoading || orgsLoading) return;

    if (!orgs.length) {
      setCurrentOrgState(null);
      safeRemoveLS(LOCAL_STORAGE_KEY);
      return;
    }

    let desiredId: string | null = null;

    if (userProfile?.role === "org_user" && userProfile.org_id) {
      desiredId = userProfile.org_id;
    } else {
      desiredId =
        safeGetLS(LOCAL_STORAGE_KEY) ||
        process.env.NEXT_PUBLIC_DEFAULT_ORG_ID ||
        orgs[0].id;
    }

    const found = orgs.find((o) => o.id === desiredId) || orgs[0];
    const normalized: Org = { ...found, slug: ensureSlug(found) };

    setCurrentOrgState((prev) => {
      if (
        prev &&
        prev.id === normalized.id &&
        prev.name === normalized.name &&
        prev.slug === normalized.slug &&
        prev.plan === normalized.plan &&
        prev.country === normalized.country
      ) {
        return prev;
      }
      return normalized;
    });

    safeSetLS(LOCAL_STORAGE_KEY, normalized.id);
  }, [
    profileLoading,
    orgsLoading,
    orgs,
    userProfile?.role,
    userProfile?.org_id,
  ]);

  const setCurrentOrg = useCallback(
    (org: Org | null) => {
      if (!org) {
        setCurrentOrgState(null);
        safeRemoveLS(LOCAL_STORAGE_KEY);
        return;
      }

      const normalized: Org = { ...org, slug: ensureSlug(org) };

      if (
        userProfile?.role === "org_user" &&
        userProfile.org_id &&
        normalized.id !== userProfile.org_id
      ) {
        return;
      }

      setCurrentOrgState(normalized);
      safeSetLS(LOCAL_STORAGE_KEY, normalized.id);
    },
    [userProfile?.role, userProfile?.org_id]
  );

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