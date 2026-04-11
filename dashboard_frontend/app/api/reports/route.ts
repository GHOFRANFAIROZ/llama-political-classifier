import { NextRequest, NextResponse } from "next/server";
import {
  extractScore,
  normalizeClassDisplay,
  normalizeDate,
  normalizePlatformDisplay,
} from "@/app/lib/reports/normalize";

export const runtime = "nodejs";

const backendBaseUrl = process.env.BACKEND_URL;

function computeDateRange(range: string): { from?: string; to?: string } {
  const now = new Date();
  let fromDate: Date | null = null;

  switch ((range || "").toLowerCase()) {
    case "24h":
      fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "all":
    default:
      fromDate = null;
      break;
  }

  if (!fromDate) return {};
  return { from: fromDate.toISOString(), to: now.toISOString() };
}

const PLATFORM_UI_TO_API: Record<string, string | null> = {
  "All platforms": null,
  "Twitter (X)": "Twitter (X)",
  Facebook: "Facebook",
  Instagram: "Instagram",
  TikTok: "TikTok",
  "News Website": "News Website",
};

const CLASS_UI_TO_API: Record<string, string | null> = {
  All: null,
  "Hate Speech": "Hate Speech",
  Abusive: "Abusive",
  Neutral: "Neutral",
};

function normalizePlatformFilter(input: string): string {
  const v = (input ?? "").trim();
  if (!v) return "";
  if (PLATFORM_UI_TO_API[v] === null) return "";
  return PLATFORM_UI_TO_API[v] ?? v;
}

function normalizeClassFilter(input: string): string {
  const v = (input ?? "").trim();
  if (!v) return "";
  if (CLASS_UI_TO_API[v] === null) return "";
  return CLASS_UI_TO_API[v] ?? v;
}

function normalizeSort(sortRaw: string): {
  sortBy: "created_at" | "toxicity";
  direction: "asc" | "desc";
} {
  const s = (sortRaw ?? "").toLowerCase().trim();

  if (s === "created_at_asc") return { sortBy: "created_at", direction: "asc" };
  if (s === "toxicity_desc") return { sortBy: "toxicity", direction: "desc" };
  if (s === "toxicity_asc") return { sortBy: "toxicity", direction: "asc" };

  return { sortBy: "created_at", direction: "desc" };
}

function getRawResults(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.reports)) return data.reports;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;

  if (data.results && typeof data.results === "object") {
    if (Array.isArray(data.results.items)) return data.results.items;
    if (Array.isArray(data.results.reports)) return data.results.reports;
  }

  return [];
}

function getTotalCount(data: any, rawResults: any[]): number {
  if (typeof data?.total === "number") return data.total;
  if (typeof data?.count === "number") return data.count;
  if (typeof data?.total_count === "number") return data.total_count;
  if (typeof data?.pagination?.total === "number") return data.pagination.total;
  if (typeof data?.meta?.total === "number") return data.meta.total;
  return rawResults.length;
}

function mapReportItem(r: any) {
  const rawPlatform = String(
    r?.platform ?? r?.source_type ?? r?.source ?? "Unknown"
  );

  const rawClassification = String(
    r?.classification ??
      r?.label_en ??
      r?.label ??
      r?.label_id ??
      r?.category ??
      "Unknown"
  );

  const displayClassification = normalizeClassDisplay(rawClassification);

  return {
    id: String(r?.id ?? r?.report_id ?? r?.dedupe_key ?? r?.doc_id ?? ""),
    textSnippet: String(
      r?.text_snippet ??
        r?.textSnippet ??
        r?.text ??
        r?.snippet ??
        r?.content ??
        ""
    ),
    platform: normalizePlatformDisplay(rawPlatform),
    classification: displayClassification,
    rawClassification,
    toxicityScore: extractScore(
      r ?? {},
      displayClassification,
      rawClassification
    ),
    date: normalizeDate(
      r?.date ?? r?.created_at ?? r?.post_time ?? r?.timestamp ?? r?.createdAt
    ),
    url: String(r?.url ?? r?.source_url ?? ""),
    classification_status: String(r?.classification_status ?? ""),
    fallback_used: Boolean(r?.fallback_used),
    review_recommended: Boolean(r?.review_recommended),
    parse_status: String(r?.parse_status ?? ""),
    sheet_status: String(r?.sheet_status ?? ""),
    ai_explanation: String(r?.ai_explanation ?? r?.explanation ?? ""),
  };
}

function matchesPlatform(report: any, platformFilter: string) {
  if (!platformFilter) return true;
  return (report.platform ?? "").trim().toLowerCase() === platformFilter.trim().toLowerCase();
}

function matchesClassification(report: any, classificationFilter: string) {
  if (!classificationFilter) return true;
  return (report.classification ?? "").trim().toLowerCase() === classificationFilter.trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  if (!backendBaseUrl) {
    return NextResponse.json(
      { error: "BACKEND_URL is not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);

  const orgId = searchParams.get("orgId");
  const q = (searchParams.get("q") ?? "").trim();

  const platformRaw = (searchParams.get("platform") ?? "").trim();
  const classificationRaw = (
    searchParams.get("classification") ??
    searchParams.get("category") ??
    ""
  ).trim();

  const dateRange = (searchParams.get("date_range") ?? "7d").trim();
  const sortRaw = (searchParams.get("sort") ?? "created_at_desc").trim();

  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const offsetRaw = Number(searchParams.get("offset") ?? "0");

  const limit = Number.isNaN(limitRaw) || limitRaw <= 0 ? 20 : limitRaw;
  const offset = Number.isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

  const isOrgMode = Boolean(orgId);

  let path: string;
  if (isOrgMode) {
    path = q
      ? `/org/${encodeURIComponent(orgId as string)}/search`
      : `/org/${encodeURIComponent(orgId as string)}/reports`;
  } else {
    path = "/api/reports/search";
  }

  const backendUrl = new URL(path, backendBaseUrl);

  const platform = normalizePlatformFilter(platformRaw);
  const classification = normalizeClassFilter(classificationRaw);
  const { sortBy, direction } = normalizeSort(sortRaw);

  if (isOrgMode) {
    const page = Math.floor(offset / limit) + 1;

    backendUrl.searchParams.set("limit", String(limit));
    backendUrl.searchParams.set("page", String(page));
    backendUrl.searchParams.set("sort", direction);
    backendUrl.searchParams.set("sort_by", sortBy);
    backendUrl.searchParams.set("date_range", dateRange);

    const { from, to } = computeDateRange(dateRange);
    if (from) backendUrl.searchParams.set("date_from", from);
    if (to) backendUrl.searchParams.set("date_to", to);

    if (q) {
      backendUrl.searchParams.set("query", q);
      backendUrl.searchParams.set("q", q);
    }
  } else {
    backendUrl.searchParams.set("date_range", dateRange);
    backendUrl.searchParams.set("limit", String(limit));
    backendUrl.searchParams.set("offset", String(offset));
    backendUrl.searchParams.set("sort", direction);
    backendUrl.searchParams.set("sort_by", sortBy);

    if (q) backendUrl.searchParams.set("q", q);
  }

  try {
    const res = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Reports backend error:", {
        url: backendUrl.toString(),
        status: res.status,
        body: text,
      });

      return NextResponse.json(
        {
          error: "Backend error",
          backendUrl: backendUrl.toString(),
          status: res.status,
          details: text.slice(0, 1000),
        },
        { status: 500 }
      );
    }

    const data = await res.json();
    const rawResults = getRawResults(data);

    const normalizedResults = rawResults.map(mapReportItem);
    const filteredResults = normalizedResults.filter((report) => {
      if (!matchesPlatform(report, platform)) return false;
      if (!matchesClassification(report, classification)) return false;
      return true;
    });

    const total = filteredResults.length;
    const paginatedResults = filteredResults.slice(offset, offset + limit);

    return NextResponse.json({
      results: paginatedResults,
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("Reports route processing error:", {
      message: error?.message,
      stack: error?.stack,
      backendUrl: backendUrl.toString(),
    });

    return NextResponse.json(
      {
        error: "Reports route processing failed",
        backendUrl: backendUrl.toString(),
        details: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}