"use client";

import React, { ReactNode } from "react";
import { FunnelIcon } from "@heroicons/react/24/outline";

export type ReportsFiltersValue = {
  platform: string;
  classification: string;
  dateRange: string;
};

type Props = {
  value: ReportsFiltersValue;
  onChange: (value: ReportsFiltersValue) => void;
  headerRight?: ReactNode; // ✅ نحقن فيه Org/Public + Sort + Clear + Refresh
  className?: string;
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

export default function ReportsFilters({
  value,
  onChange,
  headerRight,
  className,
}: Props) {
  const setField = (field: keyof ReportsFiltersValue, v: string) =>
    onChange({ ...value, [field]: v });

  return (
    <div
      className={[
        "bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)] space-y-4",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm text-purple-200 font-medium">
          Filters
          <span className="ml-2 text-xs text-purple-500">
            Platform, classification & time window
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {headerRight ? <div className="flex items-center gap-2 flex-wrap">{headerRight}</div> : null}

          <div className="hidden md:flex items-center gap-2 text-purple-400 text-xs uppercase tracking-wide">
            <FunnelIcon className="w-4 h-4" />
            Active filters
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Platform */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-purple-400 uppercase tracking-wide">
            Platform
          </span>
          <select
            value={value.platform}
            onChange={(e) => setField("platform", e.target.value)}
            className="bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-w-[160px]"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Classification */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-purple-400 uppercase tracking-wide">
            Classification
          </span>
          <select
            value={value.classification}
            onChange={(e) => setField("classification", e.target.value)}
            className="bg-black/40 border border-purple-900/70 rounded-xl px-3 py-2 text-sm text-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-w-[140px]"
          >
            {CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-purple-400 uppercase tracking-wide">
            Date range
          </span>
          <div className="flex flex-wrap gap-2">
            {DATE_RANGES.map((range) => (
              <button
                key={range.id}
                onClick={() => setField("dateRange", range.id)}
                className={`px-3 py-1.5 text-xs rounded-full border transition
                  ${
                    value.dateRange === range.id
                      ? "bg-purple-600/80 border-purple-300 text-white"
                      : "bg-black/40 border-purple-900/70 text-purple-300 hover:border-purple-500"
                  }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}