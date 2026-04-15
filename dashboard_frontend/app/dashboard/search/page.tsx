"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useOrg } from "@/app/context/OrgContext";
import { motion, AnimatePresence } from "framer-motion";
import type { ReportItem } from "@/app/lib/reports/types";
import ReportDetailDrawer from "@/components/reports/ReportDetailDrawer";
import ReportStatusBadges from "@/components/reports/ReportStatusBadges";

type Scope = "org" | "public";

type ApiResponse = {
  results?: ReportItem[];
  total?: number | null;
  count?: number;
  limit?: number;
  offset?: number;
};

const PLATFORMS = [
  "All platforms",
  "Twitter (X)",
  "Facebook",
  "Instagram",
  "TikTok",
  "News Website",
];

const CLASSIFICATIONS = ["All", "Hate Speech", "Abusive", "Neutral"] as const;

const DATE_RANGES = [
  { id: "24h", label: "Last 24h" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All time" },
];

const SORT_OPTIONS = [
  { id: "created_at_desc", label: "Newest first" },
  { id: "created_at_asc", label: "Oldest first" },
  { id: "toxicity_desc", label: "Toxicity (high → low)" },
  { id: "toxicity_asc", label: "Toxicity (low → high)" },
] as const;

type SortId = (typeof SORT_OPTIONS)[number]["id"];
type ParseStatusFilter = "all" | "parsed" | "unknown" | "non_ok";

function formatDate(dateString: string) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clampScore(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

function highlight(snippet: string, query: string) {
  const q = query.trim();
  if (!q) return snippet;

  const tokens = Array.from(
    new Set(q.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2))
  );

  if (tokens.length === 0) return snippet;

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = snippet.split(re);

  return (
    <>
      {parts.map((p, i) => {
        if (re.test(p)) {
          re.lastIndex = 0;
          return (
            <mark
              key={i}
              className="bg-purple-500/25 text-purple-100 px-1 rounded"
            >
              {p}
            </mark>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-xs text-purple-100">
      {label}
      {onRemove ? (
        <button
          onClick={onRemove}
          className="rounded-full hover:bg-purple-500/20 p-0.5 transition"
          aria-label={`Remove ${label}`}
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-purple-900/40 bg-black/20 px-4 py-4 animate-pulse"
        >
          <div className="h-4 w-1/3 bg-purple-900/40 rounded mb-3" />
          <div className="h-3 w-2/3 bg-purple-900/30 rounded mb-2" />
          <div className="h-3 w-1/2 bg-purple-900/20 rounded" />
        </div>
      ))}
    </div>
  );
}

function matchesParseStatusFilter(
  report: ReportItem,
  filter: ParseStatusFilter
): boolean {
  if (filter === "all") return true;

  const raw = (report.parse_status ?? "").trim().toLowerCase();

  if (filter === "parsed") {
    return raw === "ok" || raw === "parsed";
  }

  if (filter === "unknown") {
    return raw === "";
  }

  if (filter === "non_ok") {
    return raw !== "" && raw !== "ok" && raw !== "parsed";
  }

  return true;
}

function SearchPageContent() {
  const { currentOrg, orgsLoading, orgsError, orgs } = useOrg();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [initializedFromURL, setInitializedFromURL] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    if (initializedFromURL) return;
    const qInURL = searchParams.get("q");
    if (qInURL) setQuery(qInURL);
    setInitializedFromURL(true);
  }, [searchParams, initializedFromURL]);

  const [scope, setScope] = useState<Scope>(currentOrg ? "org" : "public");
  const scopeTouchedRef = useRef(false);

  useEffect(() => {
    if (!scopeTouchedRef.current) setScope(currentOrg ? "org" : "public");
  }, [currentOrg]);

  const [platform, setPlatform] = useState<string>("All platforms");
  const [classification, setClassification] =
    useState<(typeof CLASSIFICATIONS)[number]>("All");
  const [dateRange, setDateRange] = useState<string>("30d");
  const [sort, setSort] = useState<SortId>("created_at_desc");

  const [onlyFallback, setOnlyFallback] = useState(false);
  const [onlyReviewRecommended, setOnlyReviewRecommended] = useState(false);
  const [parseStatusFilter, setParseStatusFilter] =
    useState<ParseStatusFilter>("all");

  const [limit, setLimit] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  const [rawReports, setRawReports] = useState<ReportItem[]>([]);
  const [totalFromApi, setTotalFromApi] = useState<number | null>(null);
  const [hasMoreFromApi, setHasMoreFromApi] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedQuery,
    platform,
    classification,
    dateRange,
    sort,
    scope,
    limit,
    onlyFallback,
    onlyReviewRecommended,
    parseStatusFilter,
  ]);

  function clearAll() {
    setQuery("");
    setPlatform("All platforms");
    setClassification("All");
    setDateRange("30d");
    setSort("created_at_desc");
    setOnlyFallback(false);
    setOnlyReviewRecommended(false);
    setParseStatusFilter("all");
    setLimit(25);
    setPage(1);
  }

  const activeChips = useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      onRemove?: () => void;
    }> = [];

    chips.push({
      key: "scope",
      label: scope === "org" ? "Scope: Org" : "Scope: Public",
      onRemove:
        scope === "org"
          ? () => {
              scopeTouchedRef.current = true;
              setScope("public");
            }
          : undefined,
    });

    if (debouncedQuery.trim()) {
      chips.push({
        key: "q",
        label: `Query: "${debouncedQuery.trim()}"`,
        onRemove: () => setQuery(""),
      });
    }

    if (platform !== "All platforms") {
      chips.push({
        key: "platform",
        label: `Platform: ${platform}`,
        onRemove: () => setPlatform("All platforms"),
      });
    }

    if (classification !== "All") {
      chips.push({
        key: "classification",
        label: `Class: ${classification}`,
        onRemove: () => setClassification("All"),
      });
    }

    if (dateRange !== "30d") {
      const label =
        DATE_RANGES.find((d) => d.id === dateRange)?.label ?? dateRange;

      chips.push({
        key: "dateRange",
        label: `Range: ${label}`,
        onRemove: () => setDateRange("30d"),
      });
    }

    if (sort !== "created_at_desc") {
      const label = SORT_OPTIONS.find((s) => s.id === sort)?.label ?? sort;
      chips.push({
        key: "sort",
        label: `Sort: ${label}`,
        onRemove: () => setSort("created_at_desc"),
      });
    }

    if (onlyFallback) {
      chips.push({
        key: "fallback",
        label: "Fallback only",
        onRemove: () => setOnlyFallback(false),
      });
    }

    if (onlyReviewRecommended) {
      chips.push({
        key: "review",
        label: "Needs review only",
        onRemove: () => setOnlyReviewRecommended(false),
      });
    }

    if (parseStatusFilter !== "all") {
      const label =
        parseStatusFilter === "parsed"
          ? "Parse: Parsed"
          : parseStatusFilter === "unknown"
          ? "Parse: Unknown"
          : "Parse: Non-ok";

      chips.push({
        key: "parseStatus",
        label,
        onRemove: () => setParseStatusFilter("all"),
      });
    }

    return chips;
  }, [
    scope,
    debouncedQuery,
    platform,
    classification,
    dateRange,
    sort,
    onlyFallback,
    onlyReviewRecommended,
    parseStatusFilter,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchReports() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();

      if (scope === "org") {
        if (!currentOrg?.id) {
          setRawReports([]);
          setTotalFromApi(0);
          setHasMoreFromApi(false);
          setLoading(false);
          return;
        }
        params.set("orgId", currentOrg.id);
      }

      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      if (platform !== "All platforms") params.set("platform", platform);
      if (classification !== "All") params.set("classification", classification);

      params.set("date_range", dateRange);
      params.set("sort", sort);
      params.set("limit", String(limit));

      const offset = (page - 1) * limit;
      params.set("offset", String(offset));

      try {
        const res = await fetch(`/api/search?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load search results");
        }

        const data: ApiResponse = await res.json();
        const list = data.results ?? [];

        const total =
          typeof data.total === "number"
            ? data.total
            : typeof data.count === "number"
            ? data.count
            : null;

        setRawReports(list);
        setTotalFromApi(total);

        const inferredHasMore =
          total != null ? offset + list.length < total : list.length === limit;

        setHasMoreFromApi(inferredHasMore);
        setLastRefreshAt(new Date().toLocaleTimeString());
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message || "Unexpected error");
          setRawReports([]);
          setTotalFromApi(null);
          setHasMoreFromApi(false);
        }
      } finally {
        setLoading(false);
      }
    }

    void fetchReports();
    return () => controller.abort();
  }, [
    scope,
    currentOrg?.id,
    debouncedQuery,
    platform,
    classification,
    dateRange,
    sort,
    page,
    limit,
    refreshKey,
  ]);

  const reports = useMemo(() => {
    return rawReports.filter((report) => {
      if (onlyFallback && !report.fallback_used) return false;
      if (onlyReviewRecommended && !report.review_recommended) return false;
      if (!matchesParseStatusFilter(report, parseStatusFilter)) return false;
      return true;
    });
  }, [rawReports, onlyFallback, onlyReviewRecommended, parseStatusFilter]);

  const showNoOrgState = scope === "org" && !orgsLoading && !currentOrg;

  const resultsLabel = useMemo(() => {
    if (showNoOrgState) return "No organization selected";
    if (loading && rawReports.length === 0) return "Loading...";
    if (error) return "Error";

    const count = reports.length;
    return `${count} result${count !== 1 ? "s" : ""}`;
  }, [showNoOrgState, loading, rawReports.length, error, reports.length]);

  const showingLabel = useMemo(() => {
    if (reports.length === 0) return "Showing 0";
    const offset = (page - 1) * limit;
    const from = offset + 1;
    const to = offset + reports.length;

    if (totalFromApi == null) return `Showing ${from}–${to}`;
    return `Showing ${from}–${to} of ${totalFromApi}`;
  }, [page, limit, reports.length, totalFromApi]);

  const canGoPrev = page > 1;
  const canGoNext = hasMoreFromApi;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="space-y-8"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold text-purple-100">Search</h1>
            <p className="text-purple-400 mt-2">
              Search reports across Org or Public scope with filters, pagination,
              and detailed review metadata.
            </p>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] px-2.5 py-1 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-200">
                {scope === "org" ? "Org workspace" : "Public"}
              </span>

              {scope === "org" && currentOrg ? (
                <span className="text-xs text-purple-500">
                  Active workspace:{" "}
                  <span className="text-purple-200 font-medium">
                    {currentOrg.name}
                  </span>
                </span>
              ) : null}

              {lastRefreshAt ? (
                <span className="text-xs text-purple-500">
                  Last refresh:{" "}
                  <span className="text-purple-300">{lastRefreshAt}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setRefreshKey((x) => x + 1)}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-900/70 bg-black/40 text-sm text-purple-100 hover:border-purple-500 transition ${
                loading ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <ArrowPathIcon
                className={`w-4 h-4 text-purple-300 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              onClick={clearAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-900/70 bg-black/40 text-sm text-purple-100 hover:border-purple-500 transition"
            >
              <XMarkIcon className="w-4 h-4 text-purple-300" />
              Clear
            </button>
          </div>
        </div>

        <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 space-y-4 shadow-[0_0_18px_rgba(176,92,255,0.25)]">
          <div className="relative flex-1 min-w-[260px]">
            <MagnifyingGlassIcon className="w-5 h-5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />

            <input
              type="text"
              placeholder="Search by keywords, phrases, or entities..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-black/40 border border-purple-900/70 rounded-xl pl-10 pr-3 py-2.5 text-sm text-purple-50 placeholder:text-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {activeChips.map((chip) => (
              <FilterChip
                key={chip.key}
                label={chip.label}
                onRemove={chip.onRemove}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-4 mt-2">
            <div>
              <span className="text-xs text-purple-400">Scope</span>
              <div className="mt-1 inline-flex rounded-xl border border-purple-900/70 bg-black/40 p-1">
                <button
                  onClick={() => {
                    scopeTouchedRef.current = true;
                    setScope("org");
                  }}
                  disabled={!currentOrg}
                  className={`px-3 py-2 text-xs rounded-lg transition ${
                    scope === "org"
                      ? "bg-purple-600/80 text-white"
                      : "text-purple-300 hover:bg-purple-900/20"
                  } ${!currentOrg ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Org
                </button>
                <button
                  onClick={() => {
                    scopeTouchedRef.current = true;
                    setScope("public");
                  }}
                  className={`px-3 py-2 text-xs rounded-lg transition ${
                    scope === "public"
                      ? "bg-purple-600/80 text-white"
                      : "text-purple-300 hover:bg-purple-900/20"
                  }`}
                >
                  Public
                </button>
              </div>
            </div>

            <div>
              <span className="text-xs text-purple-400">Platform</span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="mt-1 block bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-xs text-purple-400">Classification</span>
              <select
                value={classification}
                onChange={(e) =>
                  setClassification(
                    e.target.value as (typeof CLASSIFICATIONS)[number]
                  )
                }
                className="mt-1 block bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50"
              >
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-xs text-purple-400">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortId)}
                className="mt-1 block bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-xs text-purple-400">Page size</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="mt-1 block bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50"
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-xs text-purple-400">Date range</span>
              <div className="mt-1 flex gap-2 flex-wrap">
                {DATE_RANGES.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDateRange(d.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border ${
                      dateRange === d.id
                        ? "bg-purple-600/80 border-purple-300 text-white"
                        : "bg-black/40 border border-purple-900/70 text-purple-300 hover:border-purple-500"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-purple-900/40 pt-4">
            <div className="text-sm font-medium text-purple-200 mb-3">
              Advanced filters
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="inline-flex items-center gap-2 text-sm text-purple-200">
                <input
                  type="checkbox"
                  checked={onlyFallback}
                  onChange={(e) => setOnlyFallback(e.target.checked)}
                  className="rounded border-purple-700 bg-black/40 text-purple-500 focus:ring-purple-500"
                />
                Fallback only
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-purple-200">
                <input
                  type="checkbox"
                  checked={onlyReviewRecommended}
                  onChange={(e) => setOnlyReviewRecommended(e.target.checked)}
                  className="rounded border-purple-700 bg-black/40 text-purple-500 focus:ring-purple-500"
                />
                Needs review only
              </label>

              <div>
                <span className="text-xs text-purple-400 block mb-1">
                  Parse status
                </span>
                <select
                  value={parseStatusFilter}
                  onChange={(e) =>
                    setParseStatusFilter(e.target.value as ParseStatusFilter)
                  }
                  className="block bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50"
                >
                  <option value="all">All parse states</option>
                  <option value="parsed">Parsed only</option>
                  <option value="unknown">No parse info</option>
                  <option value="non_ok">Non-ok parse only</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg text-purple-100 font-semibold">
              {resultsLabel}
            </h2>

            <span className="text-xs text-purple-400">
              {error ? "Error" : loading ? "Fetching…" : showingLabel}
            </span>
          </div>

          {showNoOrgState ? (
            <div className="py-10 text-center">
              <p className="text-purple-200 font-medium">
                No organization selected.
              </p>
              <p className="text-sm text-purple-400 mt-1">
                {orgsError
                  ? `Failed to load organizations: ${orgsError}`
                  : orgs.length === 0
                  ? "No organizations are available from the backend yet."
                  : "Pick an organization from the selector to search org reports."}
              </p>
            </div>
          ) : error ? (
            <div className="py-10 text-red-400 text-center">
              {error}
              <div className="text-red-500 text-sm mt-1">
                Check BACKEND_URL, Flask server, or search API response shape.
              </div>
            </div>
          ) : loading && rawReports.length === 0 ? (
            <LoadingSkeleton />
          ) : reports.length === 0 ? (
            <div className="py-10 text-center text-purple-400">
              <p className="text-purple-200 font-medium">No results found.</p>
              <p className="text-sm text-purple-500 mt-1">
                Try another keyword, wider date range, or fewer filters.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-purple-400 border-b border-purple-900/60">
                      <th className="py-2 pr-4">Snippet</th>
                      <th className="py-2 pr-4">Platform</th>
                      <th className="py-2 pr-4">Classification</th>
                      <th className="py-2 pr-4">Toxicity</th>
                      <th className="py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => {
                      const score = clampScore(r.toxicityScore ?? 0);

                      return (
                        <tr
                          key={r.id}
                          onClick={() => setSelectedReport(r)}
                          className="cursor-pointer border-b border-purple-900/40 hover:bg-purple-900/10 transition"
                        >
                          <td className="py-3 pr-4 text-purple-100 max-w-xl align-top">
                            <span className="line-clamp-2">
                              {highlight(r.textSnippet ?? "", debouncedQuery)}
                            </span>
                            <ReportStatusBadges report={r} />
                          </td>

                          <td className="py-3 pr-4 text-purple-200 align-top whitespace-nowrap">
                            {r.platform || "Unknown"}
                          </td>

                          <td className="py-3 pr-4 align-top">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit px-2.5 py-1 text-xs rounded-full bg-purple-500/10 border border-purple-500/40 text-purple-200">
                                {r.classification || "Unknown"}
                              </span>

                              {r.rawClassification &&
                              r.rawClassification !== r.classification ? (
                                <span className="text-[10px] text-purple-500 uppercase tracking-wide">
                                  raw: {r.rawClassification}
                                </span>
                              ) : null}
                            </div>
                          </td>

                          <td className="py-3 pr-4 text-purple-100 align-top min-w-[120px]">
                            <div
                              className={`font-semibold ${
                                score >= 80
                                  ? "text-red-300"
                                  : score >= 60
                                  ? "text-orange-300"
                                  : score >= 40
                                  ? "text-yellow-200"
                                  : "text-emerald-200"
                              }`}
                            >
                              {score}%
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-white/5 border border-white/10 overflow-hidden">
                              <div
                                className={`h-full ${
                                  score >= 80
                                    ? "bg-red-500/60"
                                    : score >= 60
                                    ? "bg-orange-500/60"
                                    : score >= 40
                                    ? "bg-yellow-500/60"
                                    : "bg-emerald-500/60"
                                }`}
                                style={{
                                  width: `${Math.max(4, Math.min(100, score))}%`,
                                }}
                              />
                            </div>
                          </td>

                          <td className="py-3 pr-4 text-purple-300 whitespace-nowrap align-top">
                            {formatDate(r.date ?? "")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between gap-4 text-xs text-purple-300">
                <div>{showingLabel}</div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={!canGoPrev}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border ${
                      !canGoPrev
                        ? "opacity-40 cursor-not-allowed border-purple-900/60"
                        : "border-purple-700 hover:bg-purple-700/20"
                    }`}
                  >
                    Prev
                  </button>

                  <span className="text-purple-400">
                    Page <span className="font-semibold text-purple-100">{page}</span>
                  </span>

                  <button
                    disabled={!canGoNext}
                    onClick={() => setPage((p) => p + 1)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border ${
                      !canGoNext
                        ? "opacity-40 cursor-not-allowed border-purple-900/60"
                        : "border-purple-700 hover:bg-purple-700/20"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedReport && (
          <ReportDetailDrawer
            report={selectedReport}
            isOpen={!!selectedReport}
            onClose={() => setSelectedReport(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-purple-300">Loading...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}