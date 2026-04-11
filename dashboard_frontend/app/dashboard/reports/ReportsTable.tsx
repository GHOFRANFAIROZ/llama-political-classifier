"use client";

import type { ReportItem } from "@/app/lib/reports/types";
import ReportStatusBadges from "@/components/reports/ReportStatusBadges";

export type Report = ReportItem;

type Props = {
  reports: Report[];
  loading: boolean;
  total?: number | null;
  page: number;
  pageSize: number;
  hasMore?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onReportClick?: (report: Report) => void;
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getToxicityTone(score: number) {
  if (score >= 80) return "text-red-300";
  if (score >= 60) return "text-orange-300";
  if (score >= 40) return "text-yellow-200";
  return "text-emerald-200";
}

export default function ReportsTable({
  reports,
  loading,
  total,
  page,
  pageSize,
  hasMore,
  onPageChange,
  onPageSizeChange,
  onReportClick,
}: Props) {
  const offset = (page - 1) * pageSize;
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + reports.length;

  const totalPages =
    typeof total === "number" ? Math.max(1, Math.ceil(total / pageSize)) : null;

  const canPrev = page > 1;
  const canNext = totalPages != null ? page < totalPages : !!hasMore;

  return (
    <div className="space-y-4">
      {loading && reports.length === 0 ? (
        <div className="py-10 text-center text-purple-400">
          Loading reports...
        </div>
      ) : reports.length === 0 ? (
        <div className="py-10 text-center text-purple-400">
          No reports found for this filter set.
        </div>
      ) : (
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
              {reports.map((report) => {
                const score = Math.max(
                  0,
                  Math.min(100, Math.round(Number(report.toxicityScore ?? 0)))
                );

                return (
                  <tr
                    key={report.id}
                    className="border-b border-purple-900/40 last:border-0 hover:bg-purple-900/10 transition cursor-pointer"
                    onClick={() => onReportClick && onReportClick(report)}
                  >
                    <td className="py-3 pr-4 align-top text-purple-100 max-w-xl">
                      <span className="line-clamp-2">{report.textSnippet}</span>
                      <ReportStatusBadges report={report} />
                    </td>

                    <td className="py-3 pr-4 align-top text-purple-200 whitespace-nowrap">
                      {report.platform || "Unknown"}
                    </td>

                    <td className="py-3 pr-4 align-top">
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex w-fit px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-200 border border-purple-500/40">
                          {report.classification || "Unknown"}
                        </span>

                        {report.rawClassification &&
                        report.rawClassification !== report.classification ? (
                          <span className="text-[10px] text-purple-500 uppercase tracking-wide">
                            raw: {report.rawClassification}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="py-3 pr-4 align-top">
                      <div className="min-w-[120px]">
                        <div className={`font-semibold ${getToxicityTone(score)}`}>
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
                      </div>
                    </td>

                    <td className="py-3 align-top text-purple-300 whitespace-nowrap">
                      {formatDate(report.date ?? "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 text-xs text-purple-300">
        <div>
          {typeof total === "number" ? (
            <>
              Showing <span className="font-semibold">{from}</span>–{" "}
              <span className="font-semibold">{to}</span> of{" "}
              <span className="font-semibold">{total}</span>
            </>
          ) : (
            <>
              Showing <span className="font-semibold">{from}</span>–{" "}
              <span className="font-semibold">{to}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="bg-black/40 border border-purple-900/70 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <button
              disabled={!canPrev}
              onClick={() => onPageChange(page - 1)}
              className={`px-2 py-1 rounded-lg border text-xs ${
                !canPrev
                  ? "opacity-40 cursor-not-allowed border-purple-900/60"
                  : "border-purple-700 hover:bg-purple-700/20"
              }`}
            >
              Prev
            </button>
            <button
              disabled={!canNext}
              onClick={() => onPageChange(page + 1)}
              className={`px-2 py-1 rounded-lg border text-xs ${
                !canNext
                  ? "opacity-40 cursor-not-allowed border-purple-900/60"
                  : "border-purple-700 hover:bg-purple-700/20"
              }`}
            >
              Next
            </button>
          </div>

          <div className="hidden md:block">
            Page <span className="font-semibold">{page}</span>
            {totalPages != null ? (
              <>
                {" "}
                of <span className="font-semibold">{totalPages}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}