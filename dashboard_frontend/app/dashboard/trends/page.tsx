// app/dashboard/trends/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/app/context/OrgContext";
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

type TrendsResponse = {
  timeseries?: TrendPoint[];
  byPlatform?: PlatformTrend[];
};

export default function TrendsPage() {
  const { currentOrg } = useOrg();

  const [dateRange, setDateRange] = useState<"7d" | "30d" | "all">("7d");

  const orgId = currentOrg?.id || "";

  const url = useMemo(() => {
    if (!orgId) return "";
    const params = new URLSearchParams();
    params.set("date_range", dateRange);
    return `/api/org/${orgId}/trends?${params.toString()}`;
  }, [orgId, dateRange]);

  const cacheKey = useMemo(() => `trends::${orgId}::${dateRange}`, [orgId, dateRange]);

  const { data, loading, error } = useCachedApi<TrendsResponse>({
    key: cacheKey,
    url,
    ttlMs: 60_000,       // ✅ 60s cache
    persist: true,       // ✅ keep across refresh
    enabled: !!orgId,
  });

  const timeseries = data?.timeseries ?? [];
  const platformSeries = data?.byPlatform ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap justify-between gap-4 items-start">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-purple-100">Trends</h1>
          <p className="text-purple-400 max-w-2xl">
            Time-series view of total reports and hate-speech for the active workspace,
            broken down by platform.
          </p>
          {currentOrg && (
            <p className="text-xs text-purple-500 mt-1">
              Active workspace:{" "}
              <span className="text-purple-200 font-medium">{currentOrg.name}</span>
            </p>
          )}
        </div>

        {/* Time window selector */}
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs text-purple-400 uppercase tracking-wide">Time window</span>
          <div className="flex gap-2">
            {[
              { id: "7d", label: "Last 7 days" },
              { id: "30d", label: "Last 30 days" },
              { id: "all", label: "All time" },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => setDateRange(r.id as any)}
                className={`px-3 py-1.5 text-xs rounded-full border transition
                  ${
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

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Time series */}
        <div className="lg:col-span-2 bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)] h-[340px]">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-purple-100">
              Reports & hate-speech over time
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
                  name="Hate-speech"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By platform */}
        <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)] h-[340px]">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-purple-100">
              Hate-speech by platform
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
    </motion.div>
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