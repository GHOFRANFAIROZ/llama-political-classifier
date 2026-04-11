"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "recharts";

type OrgStats = {
  totalReports: number;
  last7dReports: number;
  activeUsers: number | null;
  hateSpeechRatio: number;
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

type WordcloudTerm = {
  term: string;
  count: number;
  category?: string | null;
};

function slugifyFallback(id: string) {
  return id.replaceAll("_", "-");
}

function normalizeStats(json: any): OrgStats {
  return {
    totalReports: Number(json?.totalReports ?? json?.total_reports ?? 0),
    last7dReports: Number(json?.last7dReports ?? json?.last_7d_reports ?? 0),
    activeUsers:
      json?.activeUsers == null ? null : Number(json?.activeUsers),
    hateSpeechRatio: Number(json?.hateSpeechRatio ?? json?.hate_speech_ratio ?? 0),
    mostToxicPlatform: (json?.mostToxicPlatform ?? json?.most_toxic_platform ?? null) as string | null,
    timeToFirstReviewHours:
      json?.timeToFirstReviewHours == null
        ? null
        : Number(json?.timeToFirstReviewHours),
  };
}

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

function normalizeWordTerm(item: any): WordcloudTerm {
  return {
    term: String(item?.term ?? item?.text ?? item?.label ?? ""),
    count: Number(item?.count ?? item?.value ?? item?.mentions ?? 0),
    category: item?.category ?? item?.type ?? null,
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

function getCategoryBorder(category?: string | null) {
  if (category === "group") return "border-emerald-500";
  if (category === "individual") return "border-sky-500";
  if (category === "political") return "border-amber-500";
  return "border-purple-700";
}

function getCategoryLabel(category?: string | null) {
  if (category === "group") return "Groups / communities";
  if (category === "individual") return "Individuals";
  if (category === "political") return "Political / public";
  return "Mixed / other";
}

export default function OrgDashboardPage() {
  const params = useParams<{ slug: string }>();
  const slug = (params?.slug as string) || "";
  const router = useRouter();

  const { orgs, currentOrg, setCurrentOrg, orgsLoading, orgsSource } = useOrg();
  const [org, setOrg] = useState<typeof currentOrg>(null);

  const [stats, setStats] = useState<OrgStats | null>(null);
  const [trendsSeries, setTrendsSeries] = useState<TrendPoint[]>([]);
  const [platformSeries, setPlatformSeries] = useState<PlatformTrend[]>([]);
  const [wordcloudTerms, setWordcloudTerms] = useState<WordcloudTerm[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<"7d" | "30d" | "all">("7d");

  const foundOrg = useMemo(() => {
    if (!slug) return null;

    let found = orgs.find((o) => o.slug === slug);
    if (found) return found;

    found = orgs.find((o) => (o.slug || slugifyFallback(o.id)) === slug);
    if (found) return found;

    found = orgs.find((o) => o.id === slug);
    return found || null;
  }, [orgs, slug]);

  useEffect(() => {
    if (orgsLoading) return;
    setOrg(foundOrg);

    if (foundOrg && (!currentOrg || currentOrg.id !== foundOrg.id)) {
      setCurrentOrg(foundOrg);
    }
  }, [orgsLoading, foundOrg, currentOrg?.id, setCurrentOrg]);

  useEffect(() => {
    if (!org) return;

    const orgId = org.id;
    const controller = new AbortController();

    async function fetchAll() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("date_range", dateRange);

        const [statsRes, trendsRes, wordcloudRes] = await Promise.all([
          fetch(`/api/org/${orgId}/stats?${params.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`/api/org/${orgId}/trends?${params.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`/api/org/${orgId}/wordcloud?${params.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (!statsRes.ok || !trendsRes.ok || !wordcloudRes.ok) {
          throw new Error("Backend error while loading organization data");
        }

        const statsJson = await statsRes.json();
        const trendsJson = await trendsRes.json();
        const wordcloudJson = await wordcloudRes.json();

        const rawTrendSeries = trendsJson?.timeseries ?? trendsJson?.series ?? [];
        const rawPlatformSeries =
          trendsJson?.byPlatform ?? trendsJson?.by_platform ?? [];
        const rawWordTerms =
          wordcloudJson?.terms ?? wordcloudJson?.items ?? wordcloudJson?.data ?? [];

        setStats(normalizeStats(statsJson));
        setTrendsSeries(
          Array.isArray(rawTrendSeries) ? rawTrendSeries.map(normalizeTrendPoint) : []
        );
        setPlatformSeries(
          Array.isArray(rawPlatformSeries)
            ? rawPlatformSeries.map(normalizePlatformTrend)
            : []
        );
        setWordcloudTerms(
          Array.isArray(rawWordTerms)
            ? rawWordTerms
                .map(normalizeWordTerm)
                .filter((t) => t.term && Number.isFinite(t.count) && t.count > 0)
                .sort((a, b) => b.count - a.count)
            : []
        );
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Failed to load organization data");
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
    return () => controller.abort();
  }, [org?.id, dateRange]);

  if (orgsLoading) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-purple-100">Loading…</h1>
        <p className="text-purple-400">
          Loading organizations list from {orgsSource === "api" ? "API" : "fallback"}…
        </p>
        <div className="h-24 bg-purple-900/20 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-purple-100">
          Organization not found
        </h1>
        <p className="text-purple-400">
          We couldn&apos;t find a workspace matching slug:{" "}
          <span className="font-mono text-purple-200">{slug}</span>
        </p>
        <button
          onClick={() => router.push("/dashboard/organizations")}
          className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-500 transition"
        >
          Back to organizations
        </button>
      </div>
    );
  }

  const hateRatioPercent =
    stats && stats.hateSpeechRatio <= 1
      ? Math.round(stats.hateSpeechRatio * 100)
      : Math.round(stats?.hateSpeechRatio ?? 0);

  const topWord = wordcloudTerms[0]?.term ?? "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap justify-between gap-4 items-start">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-purple-100 flex items-center gap-3">
            {org.name}
            {org.plan && (
              <span className="text-xs px-2.5 py-1 rounded-full border border-purple-500/70 bg-purple-500/10 text-purple-100">
                {org.plan} plan
              </span>
            )}
          </h1>
          <p className="text-purple-400">
            Organization-specific monitoring view across reports, trends, and key
            terms.
          </p>
          <p className="text-xs text-purple-500">
            Slug:{" "}
            <span className="font-mono text-purple-200">
              {org.slug || slugifyFallback(org.id)}
            </span>
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
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

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          label="Total reports"
          value={stats?.totalReports ?? "—"}
          loading={loading}
        />
        <StatCard
          label="Reports (last 7d)"
          value={stats?.last7dReports ?? "—"}
          loading={loading}
        />
        <StatCard
          label="Hate-speech ratio"
          value={stats ? `${hateRatioPercent}%` : "—"}
          loading={loading}
        />
        <StatCard
          label="Most toxic platform"
          value={stats?.mostToxicPlatform ?? "—"}
          loading={loading}
        />
        <StatCard
          label="Top term"
          value={topWord}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)] h-[340px]">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-purple-100">
              Reports over time
            </h2>
            <span className="text-[11px] text-purple-400">
              {loading ? "Loading..." : `${trendsSeries.length} points`}
            </span>
          </div>

          {error ? (
            <ErrorBox message={error} />
          ) : trendsSeries.length === 0 ? (
            <EmptyBox text="No trend data for this period." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendsSeries}>
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

        <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)] h-[340px]">
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)]">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-purple-100">
              Targeted groups & entities
            </h2>
            <span className="text-[11px] text-purple-400">
              {loading ? "Loading..." : `${wordcloudTerms.length} terms`}
            </span>
          </div>

          {error ? (
            <ErrorBox message={error} />
          ) : wordcloudTerms.length === 0 ? (
            <EmptyBox text="No term data for this period." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {wordcloudTerms.slice(0, 40).map((term) => {
                const size = Math.min(26, 12 + Math.log(term.count + 1) * 4);
                const border = getCategoryBorder(term.category);

                return (
                  <span
                    key={term.term}
                    className={`px-2.5 py-1 rounded-full border ${border} text-purple-100 bg-purple-500/10`}
                    style={{ fontSize: size }}
                    title={`${term.term} • ${term.count}`}
                  >
                    {term.term}
                    <span className="ml-1 text-[10px] text-purple-300">
                      {term.count}
                    </span>
                  </span>
                );
              })}
            </div>
          )}

          <div className="mt-4 text-[11px] text-purple-500 flex flex-wrap gap-3">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border border-emerald-500 bg-emerald-500/10" />
              group / community
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border border-sky-500 bg-sky-500/10" />
              individual / person
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border border-amber-500 bg-amber-500/10" />
              political / public entity
            </span>
          </div>
        </div>

        <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)]">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-purple-100">
              Top terms
            </h2>
            <span className="text-[11px] text-purple-400">
              {loading ? "Loading..." : `${Math.min(10, wordcloudTerms.length)} shown`}
            </span>
          </div>

          {error ? (
            <ErrorBox message={error} />
          ) : wordcloudTerms.length === 0 ? (
            <EmptyBox text="No ranked terms available." />
          ) : (
            <div className="space-y-2">
              {wordcloudTerms.slice(0, 10).map((term, index) => (
                <div
                  key={term.term}
                  className="flex items-center justify-between rounded-xl border border-purple-900/50 bg-black/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-purple-100 truncate">
                      {index + 1}. {term.term}
                    </p>
                    <p className="text-[11px] text-purple-500">
                      {getCategoryLabel(term.category)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-purple-200">
                    {term.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-4 flex flex-col gap-2 shadow-[0_0_18px_rgba(176,92,255,0.18)]">
      <span className="text-[11px] uppercase tracking-wide text-purple-400">
        {label}
      </span>
      {loading ? (
        <div className="h-6 w-20 bg-purple-900/40 rounded animate-pulse" />
      ) : (
        <span className="text-xl font-semibold text-purple-50">{value}</span>
      )}
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