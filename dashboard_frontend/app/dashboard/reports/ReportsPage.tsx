"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useOrg } from "@/app/context/OrgContext";
import ReportsFilters, { ReportsFiltersValue } from "./ReportsFilters";
import ReportsTable, { Report } from "./ReportsTable";
import ReportDetailDrawer from "./ReportDetailDrawer";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

type Scope = "org" | "public";

type ApiResponse = {
  results?: Report[];
  total?: number;
  limit?: number;
  offset?: number;
};

const SORT_OPTIONS = [
  { id: "created_at_desc", label: "Newest first" },
  { id: "created_at_asc", label: "Oldest first" },
  { id: "toxicity_desc", label: "Toxicity (high → low)" },
  { id: "toxicity_asc", label: "Toxicity (low → high)" },
] as const;

type SortId = (typeof SORT_OPTIONS)[number]["id"];

function sortClient(items: Report[], sort: SortId) {
  const arr = [...items];
  const getDate = (r: any) => new Date(r.date ?? 0).getTime();
  const getTox = (r: any) => Number(r.toxicityScore ?? 0) || 0;

  if (sort === "created_at_desc") arr.sort((a, b) => getDate(b) - getDate(a));
  if (sort === "created_at_asc") arr.sort((a, b) => getDate(a) - getDate(b));
  if (sort === "toxicity_desc") arr.sort((a, b) => getTox(b) - getTox(a));
  if (sort === "toxicity_asc") arr.sort((a, b) => getTox(a) - getTox(b));
  return arr;
}

export default function ReportsPage() {
  const { currentOrg } = useOrg();

  const [scope, setScope] = useState<Scope>(currentOrg ? "org" : "public");
  const scopeTouchedRef = useRef(false);

  useEffect(() => {
    if (!scopeTouchedRef.current) setScope(currentOrg ? "org" : "public");
  }, [currentOrg]);

  const [filters, setFilters] = useState<ReportsFiltersValue>({
    platform: "All platforms",
    classification: "All",
    dateRange: "30d", // ✅ أخف من all، ولسه بيجيب تقاريرك الحالية
  });

  const [sort, setSort] = useState<SortId>("created_at_desc");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setPage(1);
    setSelectedReport(null);
  }, [filters, scope, sort, limit]);

  function clearFilters() {
    setFilters({
      platform: "All platforms",
      classification: "All",
      dateRange: "30d",
    });
    setSort("created_at_desc");
    setLimit(20);
    setPage(1);
    setSelectedReport(null);
  }

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

      const offset = (page - 1) * limit;
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      params.set("date_range", filters.dateRange);
      params.set("sort", sort);

      if (filters.platform !== "All platforms") params.set("platform", filters.platform);
      if (filters.classification !== "All") params.set("classification", filters.classification);

      try {
        const res = await fetch(`/api/reports?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load reports");
        }

        const data: ApiResponse = await res.json();
        const list = data.results ?? [];

        const sorted = sortClient(list, sort);
        setReports(sorted);

        const totalFromApi = typeof data.total === "number" ? data.total : null;
        setTotal(totalFromApi);

        const inferredHasMore =
          totalFromApi != null ? offset + sorted.length < totalFromApi : sorted.length === limit;
        setHasMore(inferredHasMore);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setError(err.message || "Unexpected error");
      } finally {
        setLoading(false);
      }
    }

    fetchReports();
    return () => controller.abort();
  }, [currentOrg?.id, scope, page, limit, filters, sort, refreshKey]);

  const headerCount = useMemo(() => {
    if (loading && reports.length === 0) return "Loading...";
    if (error) return "Error";
    if (total == null) return `${reports.length} report${reports.length !== 1 ? "s" : ""}`;
    return `${total} report${total !== 1 ? "s" : ""}`;
  }, [loading, reports.length, total, error]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2 tracking-tight text-purple-100">
          Reports
        </h1>
        <p className="text-purple-400 max-w-2xl">
          Browse reports in your selected scope (Org workspace or Public).
        </p>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] px-2.5 py-1 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-200">
            {scope === "org" ? "Org workspace" : "Public"}
          </span>

          {scope === "org" && currentOrg ? (
            <span className="text-xs text-purple-500">
              Active workspace:{" "}
              <span className="text-purple-200 font-medium">{currentOrg.name}</span>
            </span>
          ) : null}
        </div>
      </div>

      <ReportsFilters
        value={filters}
        onChange={setFilters}
        headerRight={
          <>
            <div className="inline-flex rounded-xl border border-purple-900/70 bg-black/40 p-1">
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

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortId)}
              className="bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>

            <button
              onClick={clearFilters}
              className="px-3 py-2 rounded-xl border border-purple-900/70 bg-black/40 text-xs text-purple-200 hover:border-purple-500 transition"
            >
              Clear
            </button>

            <button
              onClick={() => setRefreshKey((x) => x + 1)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-900/70 bg-black/40 text-xs text-purple-100 hover:border-purple-500 transition"
              title="Refresh"
            >
              <ArrowPathIcon className="w-4 h-4 text-purple-300" />
              Refresh
            </button>
          </>
        }
      />

      <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-purple-100">{headerCount}</h2>
          <span className="text-xs text-purple-400">
            {error ? "Backend error – check Flask server logs." : scope === "org" ? "Org Mode API" : "Public Mode API"}
          </span>
        </div>

        {error ? (
          <div className="py-10 text-center text-red-400">
            {error}
            <span className="block text-sm text-red-500 mt-1">
              Check Flask logs + BACKEND_URL + Firestore permissions.
            </span>
          </div>
        ) : (
          <ReportsTable
            reports={reports}
            loading={loading}
            total={total}
            hasMore={hasMore}
            page={page}
            pageSize={limit}
            onPageChange={setPage}
            onPageSizeChange={setLimit}
            onReportClick={setSelectedReport}
          />
        )}
      </div>

      <ReportDetailDrawer
        report={selectedReport}
        isOpen={!!selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </motion.div>
  );
}