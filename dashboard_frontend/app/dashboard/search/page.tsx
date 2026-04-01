"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";   // ⭐ ADDED
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useOrg } from "@/app/context/OrgContext";
import { motion, AnimatePresence } from "framer-motion";
import ReportDetailDrawer from "../reports/ReportDetailDrawer";

type Report = {
  id: string;
  textSnippet: string;
  platform: string;
  date: string; // ISO
  classification: string;
  toxicityScore: number; // 0–100
  url?: string;
};

type Scope = "org" | "public";

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
}   // ← المهم إنك سكرت الدالة هون ✔️

function clampScore(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function clientSideSort(items: Report[], sort: string) {
  const arr = [...items];
  if (sort === "created_at_desc") {
    arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } else if (sort === "created_at_asc") {
    arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } else if (sort === "toxicity_desc") {
    arr.sort((a, b) => (b.toxicityScore ?? 0) - (a.toxicityScore ?? 0));
  } else if (sort === "toxicity_asc") {
    arr.sort((a, b) => (a.toxicityScore ?? 0) - (b.toxicityScore ?? 0));
  }
  return arr;
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
            <mark key={i} className="bg-purple-500/25 text-purple-100 px-1 rounded">
              {p}
            </mark>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export default function SearchPage() {
  const { currentOrg } = useOrg();
  const searchParams = useSearchParams();  // ⭐ ADDED

  /** -------------------------------
   * ⭐ URL → Query sync
   * ------------------------------- */
  const [query, setQuery] = useState("");
  const [initializedFromURL, setInitializedFromURL] = useState(false);  // ⭐ ADDED

  // أول تحميل للصفحة: إذا URL فيه q → ننسخه للواجهة
  useEffect(() => {
    if (initializedFromURL) return;
    const qInURL = searchParams.get("q");
    if (qInURL) {
      setQuery(qInURL);
    }
    setInitializedFromURL(true);
  }, [searchParams, initializedFromURL]);   // ⭐ ADDED

  const debouncedQuery = useDebouncedValue(query, 300);


  /** -------------------------------
   * Scope handling
   * ------------------------------- */
  const [scope, setScope] = useState<Scope>(currentOrg ? "org" : "public");
  const scopeTouchedRef = useRef(false);

  useEffect(() => {
    if (!scopeTouchedRef.current) setScope(currentOrg ? "org" : "public");
  }, [currentOrg]);


  /** -------------------------------
   * Filters
   * ------------------------------- */
  const [platform, setPlatform] = useState<string>("All platforms");
  const [classification, setClassification] =
    useState<(typeof CLASSIFICATIONS)[number]>("All");
  const [dateRange, setDateRange] = useState<string>("30d");
  const [sort, setSort] =
    useState<(typeof SORT_OPTIONS)[number]["id"]>("created_at_desc");


  /** -------------------------------
   * Pagination
   * ------------------------------- */
  const [limit, setLimit] = useState<number>(25);
  const [page, setPage] = useState<number>(1);


  /** -------------------------------
   * Results state
   * ------------------------------- */
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);


  /** Reset page when filters or query change */
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, platform, classification, dateRange, sort, scope, limit]);


  function clearAll() {
    setQuery("");
    setPlatform("All platforms");
    setClassification("All");
    setDateRange("30d");
    setSort("created_at_desc");
    setLimit(25);
    setPage(1);
  }


  /** -------------------------------
   * CHIPS
   * ------------------------------- */
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];

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
        label: `Category: ${classification}`,
        onRemove: () => setClassification("All"),
      });
    }

    if (dateRange !== "30d") {
      const label = DATE_RANGES.find((d) => d.id === dateRange)?.label ?? dateRange;
      chips.push({
        key: "dateRange",
        label: `Date: ${label}`,
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

    if (scope === "org") {
      chips.push({
        key: "scope",
        label: "Scope: Org",
        onRemove: () => setScope("public"),
      });
    }

    return chips;
  }, [debouncedQuery, platform, classification, dateRange, sort, scope]);


  /** -------------------------------
   * FETCH RESULTS
   * ------------------------------- */
  useEffect(() => {
    const controller = new AbortController();

    async function fetchReports() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();

      if (scope === "org") {
        if (!currentOrg?.id) {
          setReports([]);
          setTotal(0);
          setHasMore(false);
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
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load search results");
        }

        const data = await res.json();

        const raw: Report[] = (data.results ?? []) as Report[];
        const sorted = clientSideSort(raw, sort);

        const totalFromApi =
          typeof data.total === "number"
            ? data.total
            : typeof data.count === "number"
            ? data.count
            : raw.length;

        setReports(sorted);
        setTotal(totalFromApi);

        setHasMore(offset + sorted.length < totalFromApi);
      } catch (err: any) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchReports();
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


  /** -------------------------------
   * UI
   * ------------------------------- */
  const resultsLabel = useMemo(() => {
    if (loading && reports.length === 0) return "Loading...";
    if (error) return "Error";
    if (total == null)
      return `${reports.length} result${reports.length !== 1 ? "s" : ""}`;
    return `${total} result${total !== 1 ? "s" : ""}`;
  }, [loading, reports.length, total, error]);

  const showingLabel = useMemo(() => {
    const offset = (page - 1) * limit;
    const from = total === 0 ? 0 : offset + 1;
    const to = offset + reports.length;
    if (total == null) return `Showing ${from}–${to}`;
    return `Showing ${from}–${to} of ${total}`;
  }, [page, limit, reports, total]);


  const canGoPrev = page > 1;
  const canGoNext = hasMore;


  return (
    <>
      <div className="space-y-8">
        {/* ---------------- HEADER ---------------- */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold text-purple-100">Search</h1>
            <p className="text-purple-400 mt-2">
              Fast search with filters, chips, and pagination — Org or Public.
            </p>

            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] px-2.5 py-1 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-200">
                {scope === "org" ? "Org workspace" : "Public"}
              </span>

              {scope === "org" && currentOrg && (
                <span className="text-xs text-purple-500">
                  Active workspace:{" "}
                  <span className="text-purple-200 font-medium">
                    {currentOrg.name}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Right buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRefreshKey((x) => x + 1)}
              className="px-3 py-2 rounded-xl border border-purple-900/70 bg-black/40 text-sm text-purple-100 hover:border-purple-500 transition"
            >
              <ArrowPathIcon className="w-4 h-4 text-purple-300" />
              Refresh
            </button>

            <button
              onClick={clearAll}
              className="px-3 py-2 rounded-xl border border-purple-900/70 bg-black/40 text-sm text-purple-100 hover:border-purple-500 transition"
            >
              <XMarkIcon className="w-4 h-4 text-purple-300" />
              Clear
            </button>
          </div>
        </div>

        {/* ---------------- FILTER BAR ---------------- */}
        <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 space-y-4 shadow-[0_0_18px_rgba(176,92,255,0.25)]">
          {/* Search input */}
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

          {/* Chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={chip.onRemove}
                  className="px-3 py-1.5 text-xs rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-200 flex items-center gap-1"
                >
                  {chip.label}
                  <XMarkIcon className="w-4 h-4 text-purple-300" />
                </button>
              ))}
            </div>
          )}

          {/* Filters row */}
          <div className="flex flex-wrap gap-4 mt-2">
            {/* Platform */}
            <div>
              <span className="text-xs text-purple-400">Platform</span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="block bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <span className="text-xs text-purple-400">Category</span>
              <select
                value={classification}
                onChange={(e) =>
                  setClassification(e.target.value as (typeof CLASSIFICATIONS)[number])
                }
                className="block bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50"
              >
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <span className="text-xs text-purple-400">Sort</span>
              <select
                value={sort}
                onChange={(e) =>
                  setSort(e.target.value as (typeof SORT_OPTIONS)[number]["id"])
                }
                className="block bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Page size */}
            <div>
              <span className="text-xs text-purple-400">Page size</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="block bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50"
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div>
              <span className="text-xs text-purple-400">Date range</span>
              <div className="flex gap-2">
                {DATE_RANGES.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDateRange(d.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border ${
                      dateRange === d.id
                        ? "bg-purple-600/80 border-purple-300 text-white"
                        : "bg-black/40 border-purple-900/70 text-purple-300 hover:border-purple-500"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- TABLE ---------------- */}
        <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg text-purple-100 font-semibold">
              {resultsLabel}
            </h2>

            <span className="text-xs text-purple-400">
              {error ? "Error" : loading ? "Fetching…" : showingLabel}
            </span>
          </div>

          {error ? (
            <div className="py-10 text-red-400">
              {error}
              <div className="text-red-500 text-sm">
                Check BACKEND_URL or Flask server.
              </div>
            </div>
          ) : loading && reports.length === 0 ? (
            <div className="py-8 text-purple-400 text-center">
              Loading…
            </div>
          ) : reports.length === 0 ? (
            <div className="py-8 text-purple-400 text-center">
              No results found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-purple-400 border-b border-purple-900/60">
                    <th className="py-2 pr-4">Snippet</th>
                    <th className="py-2 pr-4">Platform</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Toxicity</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedReport(r)}
                      className="cursor-pointer border-b border-purple-900/40 hover:bg-purple-900/10"
                    >
                      <td className="py-3 pr-4 text-purple-100 max-w-xl">
                        <span className="line-clamp-2">
                          {highlight(r.textSnippet, debouncedQuery)}
                        </span>
                      </td>

                      <td className="py-3 pr-4 text-purple-200">{r.platform}</td>

                      <td className="py-3 pr-4">
                        <span className="px-2 py-1 text-xs rounded-full bg-purple-500/10 border border-purple-500/40 text-purple-200">
                          {r.classification}
                        </span>
                      </td>

                      <td className="py-3 pr-4 text-purple-100">
                        {clampScore(r.toxicityScore)}%
                      </td>

                      <td className="py-3 pr-4 text-purple-300 whitespace-nowrap">
                        {formatDate(r.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
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