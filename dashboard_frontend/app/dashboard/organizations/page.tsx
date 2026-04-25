"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useOrg, Org } from "@/app/context/OrgContext";
import { useAuth } from "@/app/context/AuthContext";
import { motion } from "framer-motion";

type OrgPlan = "Free" | "Pro" | "Enterprise";

type OrgStats = {
  totalReports: number;
  last7dReports: number;
  activeUsers: number | null;
  hateSpeechRatio: number;
  mostToxicPlatform: string | null;
  timeToFirstReviewHours: number | null;
};

type OrgRow = Org & {
  reportsLast7d?: number | null;
  totalReports?: number | null;
  activeUsers?: number | null;
  lastActive?: string | null;
  primaryLanguage?: string | null;
  _slugForRoute: string;
  _isActive: boolean;
};

function PlanBadge({ plan }: { plan?: OrgPlan }) {
  const base =
    "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border";

  if (!plan || plan === "Free") {
    return (
      <span className={`${base} border-slate-500/50 text-slate-300 bg-slate-900/40`}>
        Free
      </span>
    );
  }

  if (plan === "Pro") {
    return (
      <span className={`${base} border-purple-400/60 text-purple-100 bg-purple-900/30`}>
        Pro
      </span>
    );
  }

  return (
    <span className={`${base} border-amber-300/70 text-amber-100 bg-amber-900/30`}>
      Enterprise
    </span>
  );
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SkeletonLine({ w = "w-10" }: { w?: string }) {
  return <div className={`h-5 ${w} bg-purple-900/40 rounded animate-pulse`} />;
}

function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-4 shadow-[0_0_18px_rgba(176,92,255,0.18)]">
      <div className="text-xs text-purple-400 uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-2xl font-bold text-purple-100">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-purple-500">{subtext}</div> : null}
    </div>
  );
}

function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="max-w-xl w-full rounded-2xl border border-red-500/20 bg-red-500/5 p-8">
        <h1 className="text-3xl font-bold text-white mb-3">Access denied</h1>
        <p className="text-sm text-gray-300 mb-6">
          This page is available to admin users only. Org users should not access
          the Organizations management view.
        </p>

        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 transition text-white"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

export default function OrganizationsPage() {
  const router = useRouter();
  const { userProfile, profileLoading } = useAuth();
  const { orgs, currentOrg, setCurrentOrg, orgsLoading, orgsSource, orgsError } =
    useOrg();

  const isAdmin = userProfile?.role === "admin";

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "total" | "last7d">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [statsByOrgId, setStatsByOrgId] = useState<Record<string, OrgStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLastSyncedAt, setStatsLastSyncedAt] = useState<string | null>(null);

  const fetchStats = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAdmin) return;
      if (!orgs?.length) return;
      if (orgsSource !== "api") return;

      setStatsLoading(true);
      setStatsError(null);

      try {
        const settled = await Promise.allSettled(
          orgs.map(async (o) => {
            const url = `/api/org/${encodeURIComponent(o.id)}/stats?date_range=7d`;
            const res = await fetch(url, { cache: "no-store", signal });

            if (!res.ok) {
              const text = await res.text().catch(() => "");
              throw new Error(`stats failed for ${o.id}: ${res.status} ${text}`);
            }

            const json = (await res.json()) as Partial<OrgStats>;

            const stats: OrgStats = {
              totalReports: Number(json.totalReports ?? 0),
              last7dReports: Number(json.last7dReports ?? 0),
              activeUsers: json.activeUsers == null ? null : Number(json.activeUsers),
              hateSpeechRatio: Number(json.hateSpeechRatio ?? 0),
              mostToxicPlatform: (json.mostToxicPlatform ?? null) as string | null,
              timeToFirstReviewHours:
                (json.timeToFirstReviewHours ?? null) as number | null,
            };

            return { orgId: o.id, stats };
          })
        );

        const next: Record<string, OrgStats> = {};
        let failed = 0;

        for (const r of settled) {
          if (r.status === "fulfilled") next[r.value.orgId] = r.value.stats;
          else failed++;
        }

        setStatsByOrgId(next);
        setStatsLastSyncedAt(new Date().toISOString());

        if (failed) {
          setStatsError(
            `Some organization stats failed to load (${failed}/${settled.length}).`
          );
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setStatsError(e?.message ?? "Failed to load organization stats");
      } finally {
        setStatsLoading(false);
      }
    },
    [isAdmin, orgs, orgsSource]
  );

  useEffect(() => {
    if (!isAdmin) return;
    if (orgsLoading) return;
    if (!orgs?.length) return;
    if (orgsSource !== "api") return;

    const controller = new AbortController();
    void fetchStats(controller.signal);

    return () => controller.abort();
  }, [isAdmin, orgsLoading, orgsSource, orgs, fetchStats]);

  const rows: OrgRow[] = useMemo(() => {
    return orgs.map((o) => {
      const slugForRoute = (o.slug || o.id.replaceAll("_", "-")).toString();
      const stats = statsByOrgId[o.id];
      const isActive = !!currentOrg && currentOrg.id === o.id;

      return {
        ...o,
        slug: slugForRoute,
        _slugForRoute: slugForRoute,
        _isActive: isActive,
        reportsLast7d: stats ? stats.last7dReports : null,
        totalReports: stats ? stats.totalReports : null,
        activeUsers: stats ? stats.activeUsers : null,
        lastActive: null,
        primaryLanguage: null,
      };
    });
  }, [orgs, statsByOrgId, currentOrg]);

  const filteredSorted = useMemo(() => {
    const query = q.trim().toLowerCase();

    let list = rows.filter((o) => {
      if (!query) return true;
      return (
        o.name.toLowerCase().includes(query) ||
        o.id.toLowerCase().includes(query) ||
        (o.slug ?? "").toLowerCase().includes(query)
      );
    });

    const dir = sortDir === "asc" ? 1 : -1;

    list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "total") {
        return ((a.totalReports ?? -1) - (b.totalReports ?? -1)) * dir;
      }
      return ((a.reportsLast7d ?? -1) - (b.reportsLast7d ?? -1)) * dir;
    });

    return [
      ...list.filter((x) => x._isActive),
      ...list.filter((x) => !x._isActive),
    ];
  }, [rows, q, sortKey, sortDir]);

  const totals = useMemo(() => {
    const hasAny = Object.keys(statsByOrgId).length > 0;
    if (!hasAny) return { totalReports: null, last7d: null, users: null };

    const totalReports = rows.reduce((s, o) => s + (o.totalReports ?? 0), 0);
    const last7d = rows.reduce((s, o) => s + (o.reportsLast7d ?? 0), 0);

    const usersKnown = rows.some((o) => o.activeUsers != null);
    const users = usersKnown
      ? rows.reduce((s, o) => s + (o.activeUsers ?? 0), 0)
      : null;

    return { totalReports, last7d, users };
  }, [rows, statsByOrgId]);

  const handleRefreshStats = async () => {
    const controller = new AbortController();
    await fetchStats(controller.signal);
  };

  if (profileLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-purple-200">
        Loading organizations access...
      </div>
    );
  }

  if (!isAdmin) {
    return <AccessDenied onBack={() => router.replace("/dashboard")} />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-purple-100">Organizations</h1>
            <p className="text-purple-400 mt-2 max-w-3xl">
              Browse connected workspaces, review activity levels, and open each
              organization&apos;s dashboard context.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-xs text-purple-500">
                Source:{" "}
                <span className="font-semibold text-emerald-300">
                  {orgsLoading
                    ? "Loading…"
                    : orgsSource === "api"
                    ? "API / Firestore"
                    : "Unavailable"}
                </span>
              </span>

              {orgsError ? (
                <span className="text-xs text-red-400">Error: {orgsError}</span>
              ) : null}

              {statsError ? (
                <span className="text-xs text-amber-300">{statsError}</span>
              ) : null}

              {statsLastSyncedAt ? (
                <span className="text-xs text-purple-500">
                  Stats synced:{" "}
                  <span className="text-purple-200">
                    {formatDateTime(statsLastSyncedAt)}
                  </span>
                </span>
              ) : null}
            </div>

            {currentOrg ? (
              <p className="text-xs text-purple-500 mt-2">
                Active workspace:{" "}
                <span className="font-semibold text-purple-200">{currentOrg.name}</span>
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleRefreshStats}
              disabled={orgsLoading || orgsSource !== "api" || statsLoading}
              className="px-4 py-2 rounded-xl bg-purple-600/80 border border-purple-400/30 text-white text-sm hover:bg-purple-600 disabled:opacity-60 transition shadow-[0_0_18px_rgba(176,92,255,0.25)]"
            >
              {statsLoading ? "Refreshing..." : "Refresh stats"}
            </motion.button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex-1">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by organization name, slug, or org ID…"
              className="w-full bg-[#120F18] border border-purple-900/50 rounded-2xl px-4 py-2 text-sm text-purple-200 placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sortKey}
              onChange={(e) =>
                setSortKey(e.target.value as "name" | "total" | "last7d")
              }
              className="bg-[#120F18] border border-purple-900/50 rounded-xl px-3 py-2 text-xs text-purple-200"
            >
              <option value="name">Sort: Name</option>
              <option value="total">Sort: Total reports</option>
              <option value="last7d">Sort: Reports (7d)</option>
            </select>

            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
              className="bg-[#120F18] border border-purple-900/50 rounded-xl px-3 py-2 text-xs text-purple-200"
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Organizations"
          value={orgsLoading ? "…" : orgs.length}
          subtext="Connected workspaces"
        />
        <SummaryCard
          label="Reports (last 7 days)"
          value={statsLoading ? "…" : totals.last7d ?? "—"}
          subtext="Across all organizations"
        />
        <SummaryCard
          label="Total reports"
          value={statsLoading ? "…" : totals.totalReports ?? "—"}
          subtext="Aggregated volume"
        />
        <SummaryCard
          label="Active users"
          value={statsLoading ? "…" : totals.users ?? "—"}
          subtext="If tracked"
        />
      </div>

      <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-purple-100">
            Organizations overview
          </h2>
          <span className="text-xs text-purple-400">
            Click any row to open that organization&apos;s dashboard view.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-purple-400 border-b border-purple-900/60">
                <th className="py-2 pr-4">Organization</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Country</th>
                <th className="py-2 pr-4">Reports (7d)</th>
                <th className="py-2 pr-4">Total reports</th>
                <th className="py-2 pr-4">Active users</th>
                <th className="py-2">Last active</th>
              </tr>
            </thead>

            <tbody>
              {orgsLoading ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-purple-400 text-sm">
                    Loading organizations…
                  </td>
                </tr>
              ) : filteredSorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-purple-400 text-sm">
                    No organizations match your search.
                  </td>
                </tr>
              ) : (
                filteredSorted.map((org) => (
                  <tr
                    key={org.id}
                    className={`border-b border-purple-900/40 last:border-0 transition cursor-pointer ${
                      org._isActive ? "bg-purple-900/15" : "hover:bg-purple-900/10"
                    }`}
                    onClick={() => {
                      setCurrentOrg(org);
                      router.push(`/dashboard/organizations/${org._slugForRoute}`);
                    }}
                  >
                    <td className="py-3 pr-4 align-top text-purple-100">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{org.name}</span>
                          {org._isActive ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/50 bg-emerald-500/10 text-emerald-200">
                              Active
                            </span>
                          ) : null}
                        </div>
                        <span className="text-xs text-purple-500">{org._slugForRoute}</span>
                        <span className="text-[11px] text-purple-600 font-mono">{org.id}</span>
                      </div>
                    </td>

                    <td className="py-3 pr-4 align-top">
                      <PlanBadge plan={(org.plan as OrgPlan) ?? "Free"} />
                    </td>

                    <td className="py-3 pr-4 align-top text-purple-200">
                      {org.country || "—"}
                    </td>

                    <td className="py-3 pr-4 align-top text-purple-100">
                      {statsLoading && org.reportsLast7d == null ? (
                        <SkeletonLine w="w-10" />
                      ) : (
                        org.reportsLast7d ?? "—"
                      )}
                    </td>

                    <td className="py-3 pr-4 align-top text-purple-100">
                      {statsLoading && org.totalReports == null ? (
                        <SkeletonLine w="w-12" />
                      ) : (
                        org.totalReports ?? "—"
                      )}
                    </td>

                    <td className="py-3 pr-4 align-top text-purple-100">
                      {statsLoading && org.activeUsers == null ? (
                        <SkeletonLine w="w-10" />
                      ) : (
                        org.activeUsers ?? "—"
                      )}
                    </td>

                    <td className="py-3 align-top text-purple-300 whitespace-nowrap">
                      {formatDateTime(org.lastActive)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-purple-500">
          <span>
            Showing{" "}
            <span className="text-purple-200 font-semibold">
              {filteredSorted.length}
            </span>{" "}
            organization(s)
          </span>
          <span>اضغط على أي صف لفتح صفحة المنظمة</span>
        </div>
      </div>
    </div>
  );
}