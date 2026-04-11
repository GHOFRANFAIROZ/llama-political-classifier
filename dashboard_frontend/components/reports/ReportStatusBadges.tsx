"use client";

import type { ReportItem } from "@/app/lib/reports/types";

function Badge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${className}`}
    >
      {label}
    </span>
  );
}

export default function ReportStatusBadges({
  report,
}: {
  report: ReportItem;
}) {
  const parseStatus = (report.parse_status ?? "").trim().toLowerCase();
  const classificationStatus = (report.classification_status ?? "")
    .trim()
    .toLowerCase();

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {report.fallback_used ? (
        <Badge
          label="Fallback"
          className="bg-yellow-500/10 text-yellow-200 border-yellow-500/30"
        />
      ) : (
        <Badge
          label="Primary"
          className="bg-emerald-500/10 text-emerald-200 border-emerald-500/30"
        />
      )}

      {report.review_recommended ? (
        <Badge
          label="Needs review"
          className="bg-red-500/10 text-red-300 border-red-500/30"
        />
      ) : (
        <Badge
          label="No review"
          className="bg-white/5 text-gray-300 border-white/10"
        />
      )}

      {parseStatus ? (
        <Badge
          label={
            parseStatus === "ok" || parseStatus === "parsed"
              ? "Parsed"
              : (report.parse_status ?? "Parse unknown").replaceAll("_", " ")
          }
          className={
            parseStatus === "ok" || parseStatus === "parsed"
              ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30"
              : "bg-orange-500/10 text-orange-300 border-orange-500/30"
          }
        />
      ) : (
        <Badge
          label="Parse unknown"
          className="bg-white/5 text-gray-300 border-white/10"
        />
      )}

      {classificationStatus &&
      classificationStatus !== "ok" &&
      classificationStatus !== "classified" ? (
        <Badge
          label={(report.classification_status ?? "Classified").replaceAll("_", " ")}
          className="bg-purple-500/10 text-purple-200 border-purple-500/30"
        />
      ) : (
        <Badge
          label="Classified"
          className="bg-purple-500/10 text-purple-200 border-purple-500/30"
        />
      )}
    </div>
  );
}