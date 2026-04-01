"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useOrg } from "@/app/context/OrgContext";
import { useCachedApi } from "@/app/lib/useCachedApi";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";

type StatsResponse = {
  totalReports: number;
  last7dReports: number;
  activeUsers: number | null;
  hateSpeechRatio: number; // 0..1 or 0..100
  mostToxicPlatform: string | null;
  timeToFirstReviewHours: number | null;
};

type TrendPoint = {
  date: string;
  totalReports: number;
  hateReports: number;
};

type PlatformTrend = {
  platform: string;
  hateReports: number;
};

type TrendsResponse = {
  timeseries?: TrendPoint[];
  byPlatform?: PlatformTrend[];
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function ratioToPct(ratio: number) {
  const x = Number(ratio);
  if (!Number.isFinite(x)) return 0;
  if (x <= 1) return clamp(Math.round(x * 100), 0, 100);
  return clamp(Math.round(x), 0, 100);
}

function formatHours(h: number | null) {
  if (h === null || !Number.isFinite(Number(h))) return "—";
  const x = Number(h);
  if (x < 1) return `${Math.round(x * 60)} min`;
  if (x < 24) return `${Math.round(x)} h`;
  const days = Math.round(x / 24);
  return `${days} d`;
}

export default function DashboardPage() {
  const { currentOrg, orgs } = useOrg();
  const orgId = currentOrg?.id || "";

  // -------- Stats (cached)
  const statsUrl = useMemo(() => (orgId ? `/api/org/${orgId}/stats` : ""), [orgId]);
  const statsKey = useMemo(() => `stats::${orgId}`, [orgId]);

  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
  } = useCachedApi<StatsResponse>({
    key: statsKey,
    url: statsUrl,
    ttlMs: 60_000,
    persist: true,
    enabled: !!orgId,
  });

  // -------- Trends (cached, 7d)
  const trendsUrl = useMemo(() => {
    if (!orgId) return "";
    const params = new URLSearchParams();
    params.set("date_range", "7d");
    return `/api/org/${orgId}/trends?${params.toString()}`;
  }, [orgId]);

  const trendsKey = useMemo(() => `trends::${orgId}::7d`, [orgId]);

  const {
    data: trends,
    loading: trendsLoading,
    error: trendsError,
  } = useCachedApi<TrendsResponse>({
    key: trendsKey,
    url: trendsUrl,
    ttlMs: 60_000,
    persist: true,
    enabled: !!orgId,
  });

  const totalReports = stats?.totalReports ?? 0;
  const last7dReports = stats?.last7dReports ?? 0;
  const hatePct = ratioToPct(stats?.hateSpeechRatio ?? 0);
  const mostToxicPlatform = stats?.mostToxicPlatform || "—";
  const activeUsers = stats?.activeUsers;
  const timeToFirstReview = formatHours(stats?.timeToFirstReviewHours ?? null);

  const activeOrgs = Array.isArray(orgs) ? orgs.length : 0;

  // Pie data: hate vs non-hate (approx via ratio)
  const hateCountApprox = Math.round((hatePct / 100) * totalReports);
  const nonHateApprox = Math.max(0, totalReports - hateCountApprox);

  const pieData = [
    { name: "Hate-speech", value: hateCountApprox },
    { name: "Other", value: nonHateApprox },
  ];

  const timeseries: TrendPoint[] = trends?.timeseries ?? [];

  const platformSeries: PlatformTrend[] = (trends?.byPlatform ?? [])
    .map((p) => ({
      platform: String(p.platform || "Unknown"),
      hateReports: Number(p.hateReports || 0),
    }))
    .sort((a, b) => b.hateReports - a.hateReports)
    .slice(0, 8);

  const anyError = statsError || trendsError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-10"
    >
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white">Dashboard Overview</h1>
        <p className="text-gray-400 mt-2">
          Insight into hate-speech reports, platform activity, and trends.
        </p>

        {currentOrg ? (
          <p className="text-xs text-purple-400 mt-2">
            Active workspace:{" "}
            <span className="text-purple-100 font-medium">{currentOrg.name}</span>
          </p>
        ) : (
          <p className="text-xs text-purple-400 mt-2">
            Select an organization to view workspace analytics.
          </p>
        )}
      </div>

      {/* Errors */}
      {anyError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {anyError}
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          label="Total Reports"
          value={totalReports.toLocaleString()}
          loading={statsLoading}
        />

        <StatCard
          label="Last 7 days"
          value={last7dReports.toLocaleString()}
          loading={statsLoading}
          tone="purple"
        />

        <StatCard
          label="Hate Speech %"
          value={`${hatePct}%`}
          loading={statsLoading}
          tone="red"
        />

        <StatCard
          label="Most Toxic Platform"
          value={mostToxicPlatform}
          loading={statsLoading}
          tone="blue"
          smallText
        />

        <StatCard
          label="Active Organizations"
          value={String(activeOrgs)}
          loading={false}
          tone="green"
        />

        <StatCard
          label="Active Users"
          value={activeUsers === null || activeUsers === undefined ? "—" : String(activeUsers)}
          loading={statsLoading}
          tone="gray"
        />

        <StatCard
          label="Time to first review"
          value={timeToFirstReview}
          loading={statsLoading}
          tone="gray"
        />

        <StatCard
          label="Scope"
          value={currentOrg ? "Org workspace" : "Public"}
          loading={false}
          tone="gray"
          smallText
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* (1) Trends mini line */}
        <div className="bg-[#1A1A1A] h-80 rounded-2xl border border-gray-800 p-5 lg:col-span-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-white">Last 7 days trend</h3>
            <span className="text-[11px] text-gray-400">
              {trendsLoading ? "Loading..." : `${timeseries.length} points`}
            </span>
          </div>

          {trendsLoading && timeseries.length === 0 ? (
            <ChartSkeleton />
          ) : timeseries.length === 0 ? (
            <EmptyChart text="No trend data yet." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "#120F18",
                    border: "1px solid #4c1d95",
                    fontSize: 11,
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="totalReports" name="Total" stroke="#a855f7" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="hateReports" name="Hate" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Right column: Pie + Bar */}
        <div className="grid grid-rows-2 gap-6">
          {/* (2) Distribution (Pie) */}
          <div className="bg-[#1A1A1A] h-80 rounded-2xl border border-gray-800 p-5">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-white">Distribution</h3>
              <span className="text-[11px] text-gray-400">
                {statsLoading ? "Loading..." : `${totalReports.toLocaleString()} total`}
              </span>
            </div>

            {statsLoading && totalReports === 0 ? (
              <ChartSkeleton />
            ) : totalReports === 0 ? (
              <EmptyChart text="No reports yet." />
            ) : (
              <div className="h-[calc(100%-28px)]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        background: "#120F18",
                        border: "1px solid #4c1d95",
                        fontSize: 11,
                      }}
                    />
                    <Legend />
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      <Cell fill="#f97316" />
                      <Cell fill="#a855f7" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                <div className="mt-2 text-xs text-gray-300">
                  <span className="text-orange-300 font-semibold">Hate:</span>{" "}
                  {hateCountApprox.toLocaleString()}{" "}
                  <span className="text-gray-500">({hatePct}%)</span>
                  <span className="mx-2 text-gray-600">•</span>
                  <span className="text-purple-300 font-semibold">Other:</span>{" "}
                  {nonHateApprox.toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* (3) Mini bar by platform */}
          <div className="bg-[#1A1A1A] h-80 rounded-2xl border border-gray-800 p-5">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-white">Top platforms (hate)</h3>
              <span className="text-[11px] text-gray-400">
                {trendsLoading ? "Loading..." : `${platformSeries.length} platforms`}
              </span>
            </div>

            {trendsLoading && platformSeries.length === 0 ? (
              <ChartSkeleton />
            ) : platformSeries.length === 0 ? (
              <EmptyChart text="No platform breakdown yet." />
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
      </div>
    </motion.div>
  );
}

function StatCard({
  label,
  value,
  loading,
  tone,
  smallText,
}: {
  label: string;
  value: string;
  loading: boolean;
  tone?: "red" | "blue" | "green" | "purple" | "gray";
  smallText?: boolean;
}) {
  const color =
    tone === "red"
      ? "text-red-400"
      : tone === "blue"
      ? "text-blue-400"
      : tone === "green"
      ? "text-green-400"
      : tone === "purple"
      ? "text-purple-300"
      : tone === "gray"
      ? "text-gray-200"
      : "text-white";

  return (
    <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-gray-800 shadow-md hover:shadow-lg transition">
      <p className="text-gray-400 text-sm">{label}</p>

      {loading ? (
        <div className="mt-3 h-8 w-28 bg-gray-700/40 rounded animate-pulse" />
      ) : (
        <h2 className={`mt-2 font-bold ${color} ${smallText ? "text-xl" : "text-3xl"}`}>
          {value}
        </h2>
      )}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-[calc(100%-28px)] rounded-xl border border-gray-800 bg-black/30 animate-pulse" />
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-[calc(100%-28px)] flex items-center justify-center text-gray-500 text-sm border border-gray-800 rounded-xl">
      {text}
    </div>
  );
}