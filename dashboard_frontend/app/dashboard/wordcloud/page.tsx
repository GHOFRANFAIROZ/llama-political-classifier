// app/dashboard/wordcloud/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useOrg } from "@/app/context/OrgContext";
import { motion } from "framer-motion";
import { useCachedApi } from "@/app/lib/useCachedApi";

type WordcloudTerm = {
  term: string;
  count: number;
  category?: string | null;
};

type WordcloudResponse = {
  terms?: WordcloudTerm[];
};

export default function WordcloudPage() {
  const { currentOrg } = useOrg();

  const [dateRange, setDateRange] = useState<"7d" | "30d" | "all">("7d");
  const orgId = currentOrg?.id || "";

  const url = useMemo(() => {
    if (!orgId) return "";
    const params = new URLSearchParams();
    params.set("date_range", dateRange);
    return `/api/org/${orgId}/wordcloud?${params.toString()}`;
  }, [orgId, dateRange]);

  const cacheKey = useMemo(
    () => `wordcloud::${orgId}::${dateRange}`,
    [orgId, dateRange]
  );

  const { data, loading, error } = useCachedApi<WordcloudResponse>({
    key: cacheKey,
    url,
    ttlMs: 60_000,
    persist: true,
    enabled: !!orgId,
  });

  const terms = data?.terms ?? [];

  const totalMentions = terms.reduce((sum, t) => sum + t.count, 0);
  const uniqueTerms = terms.length;

  let topCategoryLabel = "—";
  if (terms.length > 0) {
    const counts: Record<string, number> = {};
    for (const t of terms) {
      const key = t.category || "other";
      counts[key] = (counts[key] || 0) + t.count;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted[0]?.[0];
    if (top === "group") topCategoryLabel = "Groups / communities";
    else if (top === "individual") topCategoryLabel = "Individuals";
    else if (top === "political") topCategoryLabel = "Political / public";
    else topCategoryLabel = "Mixed / other";
  }

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
          <h1 className="text-3xl md:text-4xl font-bold text-purple-100">
            Wordcloud
          </h1>
          <p className="text-purple-400 max-w-2xl">
            Explore which groups, communities, and entities are most frequently
            targeted in hate-speech captured for this workspace.
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard label="Unique terms" value={uniqueTerms} loading={loading} />
        <SummaryCard label="Total mentions" value={totalMentions} loading={loading} />
        <SummaryCard label="Top category" value={topCategoryLabel} loading={loading} />
      </div>

      {/* Wordcloud */}
      <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)]">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold text-purple-100">
            Targeted groups & entities
          </h2>
          <span className="text-[11px] text-purple-400">
            {loading ? "Loading..." : `${terms.length} terms`}
          </span>
        </div>

        {error ? (
          <ErrorBox message={error} />
        ) : loading && terms.length === 0 ? (
          <div className="py-10 text-center text-purple-400">Loading terms...</div>
        ) : terms.length === 0 ? (
          <div className="py-10 text-center text-purple-400">
            No term data for this period.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {terms
              .sort((a, b) => b.count - a.count)
              .slice(0, 60)
              .map((term) => {
                const size = Math.min(26, 12 + Math.log(term.count + 1) * 4);
                let border = "border-purple-700";
                if (term.category === "group") border = "border-emerald-500";
                else if (term.category === "individual") border = "border-sky-500";
                else if (term.category === "political") border = "border-amber-500";

                return (
                  <span
                    key={term.term}
                    className={`px-2.5 py-1 rounded-full border ${border} text-purple-100 bg-purple-500/10`}
                    style={{ fontSize: size }}
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
    </motion.div>
  );
}

function SummaryCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-4 flex flex-col gap-2">
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