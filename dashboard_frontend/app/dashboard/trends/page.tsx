"use client";
export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { useOrg } from "@/app/context/OrgContext";
import { useAuth } from "@/app/context/AuthContext";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { useCachedApi } from "@/app/lib/useCachedApi";

type TrendPoint = {
  date: string;
  totalReports: number;
  hateReports: number;
};

type PlatformTrend = {
  platform: string;
  hateReports: number;
};

type Scope = "org" | "public";

type TrendsResponse = {
  timeseries?: any[];
  byPlatform?: any[];
  by_platform?: any[];
  series?: any[];
};

function normalizeTrendPoint(item: any): TrendPoint {
  return {
    date: String(item?.date ?? item?.day ?? item?.bucket ?? ""),
    totalReports: Number(
      item?.totalReports ?? item?.total_reports ?? item?.reports ?? item?.total ?? 0
    ),
    hateReports: Number(
      item?.hateReports ?? item?.hate_reports ?? item?.hate ?? item?.hateSpeech ?? 0
    ),
  };
}

function normalizePlatformTrend(item: any): PlatformTrend {
  return {
    platform: String(item?.platform ?? item?.source ?? item?.name ?? "Unknown"),
    hateReports: Number(
      item?.hateReports ?? item?.hate_reports ?? item?.hate ?? item?.count ?? 0
    ),
  };
}

function formatShortDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
  });
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
    <div className="rounded-2xl border border-purple-900/60 bg-[#120F18] p-4 shadow-[0_0_18px_rgba(176,92,255,0.18)]">
      <p className="text-[11px] uppercase tracking-wide text-purple-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-purple-100">{value}</p>
      {subtext ? <p className="mt-1 text-xs text-purple-500">{subtext}</p> : null}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-red-400 text-xs text-center px-4">
      {message}
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-purple-400 text-xs text-center px-4">
      {text}
    </div>
  );
}

export default function TrendsPage() {
  const { currentOrg } = useOrg();
  const { userProfile } = useAuth();
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "all">("7d");
  const [scope, setScope] = useState<Scope>("public");

  const orgId = currentOrg?.id || "";
  const isAdmin = userProfile?.role === "admin";
  const effectiveScope: Scope = isAdmin ? scope : "org";
  const isPublicMode = effectiveScope === "public";

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("date_range", dateRange);

    if (isPublicMode) {
      return `/api/reports/trends?${params.toString()}`;
    }

    if (!orgId) return "";

    return `/api/org/${orgId}/trends?${params.toString()}`;
  }, [isPublicMode, orgId, dateRange]);

  const cacheKey = useMemo(
    () => `trends::${effectiveScope}::${orgId || "none"}::${dateRange}`,
    [effectiveScope, orgId, dateRange]
  );

  const { data, loading, error } = useCachedApi<TrendsResponse>({
    key: cacheKey,
    url,
    ttlMs: 60_000,
    persist: true,
    enabled: isPublicMode || !!orgId,
  });

  const timeseries = useMemo(() => {
    const raw =
      data?.timeseries ??
      data?.series ??
      [];
    return Array.isArray(raw) ? raw.map(normalizeTrendPoint) : [];
  }, [data]);

  const platformSeries = useMemo(() => {
    const raw =
      data?.byPlatform ??
      data?.by_platform ??
      [];
    return Array.isArray(raw) ? raw.map(normalizePlatformTrend) : [];
  }, [data]);

  const totalReports = useMemo(() => {
    return timeseries.reduce((sum, item) => sum + Number(item.totalReports || 0), 0);
  }, [timeseries]);

  const totalHateReports = useMemo(() => {
    return timeseries.reduce((sum, item) => sum + Number(item.hateReports || 0), 0);
  }, [timeseries]);

  const peakPoint = useMemo(() => {
    if (timeseries.length === 0) return null;
    return timeseries.reduce((max, item) =>
      item.totalReports > max.totalReports ? item : max
    );
  }, [timeseries]);

  const trackedPlatforms = platformSeries.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap justify-between gap-4 items-start">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-purple-100">Trends</h1>
          <p className="text-purple-400 max-w-2xl">
            Time-series view of reporting activity and hate-related content in the
            active workspace.
          </p>
          {currentOrg && (
            <p className="text-xs text-purple-500 mt-1">
              Active workspace:{" "}
              <span className="text-purple-200 font-medium">{currentOrg.name}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {isAdmin ? (
            <div className="inline-flex rounded-xl border border-purple-900/70 bg-black/40 p-1">
              <button
                onClick={() => setScope("public")}
                className={`px-3 py-1.5 text-xs rounded-lg transition ${
                  effectiveScope === "public"
                    ? "bg-purple-600/80 text-white"
                    : "text-purple-300 hover:bg-purple-900/20"
                }`}
              >
                Public
              </button>
              <button
                onClick={() => setScope("org")}
                disabled={!currentOrg}
                className={`px-3 py-1.5 text-xs rounded-lg transition ${
                  effectiveScope === "org"
                    ? "bg-purple-600/80 text-white"
                    : "text-purple-300 hover:bg-purple-900/20"
                } ${!currentOrg ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Org
              </button>
            </div>
          ) : null}

          <span className="text-xs text-purple-400 uppercase tracking-wide">
            Time window
          </span>
          <div className="flex gap-2">
            {[
              { id: "7d", label: "Last 7 days" },
              { id: "30d", label: "Last 30 days" },
              { id: "all", label: "All time" },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => setDateRange(r.id as "7d" | "30d" | "all")}
                className={`px-3 py-1.5 text-xs rounded-full border transition ${
                  dateRange === r.id
                    ? "bg-purple-600/80 border-purple-300 text-white"
                    : "bg-black/40 border-purple-900/70 text-purple-300 hover:border-purple-500"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!orgId ? (
        <div className="rounded-2xl border border-purple-900/60 bg-[#120F18] p-6 text-sm text-purple-300">
          Select an organization to view trends.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard
              label="Total reports"
              value={loading ? "..." : totalReports}
              subtext="Across selected range"
            />
            <SummaryCard
              label="Hate reports"
              value={loading ? "..." : totalHateReports}
              subtext="Detected hate-related items"
            />
            <SummaryCard
              label="Peak day"
              value={
                loading
                  ? "..."
                  : peakPoint
                  ? formatShortDate(peakPoint.date)
                  : "-"
              }
              subtext={
                peakPoint ? `${peakPoint.totalReports} reports` : "No data"
              }
            />
            <SummaryCard
              label="Platforms tracked"
              value={loading ? "..." : trackedPlatforms}
              subtext="Platforms in current results"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)] h-[360px]">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-purple-100">
                  Reports over time
                </h2>
                <span className="text-[11px] text-purple-400">
                  {loading ? "Loading..." : `${timeseries.length} points`}
                </span>
              </div>

              {error ? (
                <ErrorBox message={error} />
              ) : timeseries.length === 0 ? (
                <EmptyBox text="No trend data for this period." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={formatShortDate}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "#120F18",
                        border: "1px solid #4c1d95",
                        fontSize: 11,
                      }}
                      labelFormatter={(label) => formatShortDate(String(label))}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="totalReports"
                      name="Total reports"
                      stroke="#a855f7"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="hateReports"
                      name="Hate reports"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)] h-[360px]">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-purple-100">
                  Hate reports by platform
                </h2>
                <span className="text-[11px] text-purple-400">
                  {loading ? "Loading..." : `${platformSeries.length} platforms`}
                </span>
              </div>

              {error ? (
                <ErrorBox message={error} />
              ) : platformSeries.length === 0 ? (
                <EmptyBox text="No platform data for this period." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={platformSeries}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="platform" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "#120F18",
                        border: "1px solid #4c1d95",
                        fontSize: 11,
                      }}
                    />
                    <Bar dataKey="hateReports" name="Hate reports" fill="#a855f7" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
