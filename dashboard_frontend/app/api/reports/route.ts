// app/api/reports/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const backendBaseUrl = process.env.BACKEND_URL;

/** ----- Helpers ----- */
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

function clamp0to100(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// UI -> API (filters)
const PLATFORM_UI_TO_API: Record<string, string | null> = {
  "All platforms": null,
  "Twitter (X)": "X",
  Facebook: "facebook_post",
  Instagram: "instagram_post",
  TikTok: "tiktok_post",
  "News Website": "news",
};

const CLASS_UI_TO_API: Record<string, string | null> = {
  All: null,
  "Hate Speech": "HATE_SPEECH",
  Abusive: "ABUSIVE",
  Neutral: "NEUTRAL_OTHER",
};

// API -> UI (display) ✅ (fixed typing)
const PLATFORM_API_TO_UI: Record<string, string | undefined> = {
  X: "Twitter (X)",
  twitter: "Twitter (X)",
  facebook_post: "Facebook",
  facebook: "Facebook",
  instagram_post: "Instagram",
  instagram: "Instagram",
  tiktok_post: "TikTok",
  tiktok: "TikTok",
  news: "News Website",
};

const CLASS_API_TO_UI: Record<string, string | undefined> = {
  HATE_SPEECH: "Hate Speech",
  ABUSIVE: "Abusive",
  NEUTRAL_OTHER: "Neutral",
};

function normalizePlatformFilter(input: string) {
  const v = (input ?? "").trim();
  if (!v) return "";
  if (PLATFORM_UI_TO_API[v] === null) return "";
  return PLATFORM_UI_TO_API[v] ?? v;
}

function normalizeClassFilter(input: string) {
  const v = (input ?? "").trim();
  if (!v) return "";
  if (CLASS_UI_TO_API[v] === null) return "";
  return CLASS_UI_TO_API[v] ?? v;
}

function normalizeSortDirection(sortRaw: string): "asc" | "desc" {
  const s = (sortRaw ?? "").toLowerCase().trim();
  if (s === "asc" || s === "created_at_asc" || s === "toxicity_asc") return "asc";
  return "desc";
}

function normalizeDate(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "number") return new Date(val).toISOString();
  if (typeof val === "object") {
    const sec = (val.seconds ?? val._seconds) as number | undefined;
    if (typeof sec === "number") return new Date(sec * 1000).toISOString();
  }
  return String(val);
}

function extractScore(r: any): number {
  if (typeof r.toxicityScore === "number" || typeof r.toxicityScore === "string") {
    return clamp0to100(r.toxicityScore);
  }

  if (typeof r.toxicity_score === "number" || typeof r.toxicity_score === "string") {
    return clamp0to100(r.toxicity_score);
  }

  if (typeof r.toxicity === "number" || typeof r.toxicity === "string") {
    return clamp0to100(r.toxicity);
  }

  if (typeof r.confidence_score === "number") {
    const x = r.confidence_score <= 1 ? r.confidence_score * 100 : r.confidence_score;
    return clamp0to100(x);
  }

  return 0;
}

function normalizePlatformDisplay(apiValue: string) {
  const v = (apiValue ?? "").trim();
  return PLATFORM_API_TO_UI[v] ?? (v || "Unknown");
}

function normalizeClassDisplay(apiValue: string) {
  const v = (apiValue ?? "").trim();
  return CLASS_API_TO_UI[v] ?? (v || "Unknown");
}

/** ----- Handler ----- */
export async function GET(req: NextRequest) {
  if (!backendBaseUrl) {
    return NextResponse.json({ error: "BACKEND_URL is not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);

  const orgId = searchParams.get("orgId");
  const q = (searchParams.get("q") ?? "").trim();

  const platformRaw = (searchParams.get("platform") ?? "").trim();
  const classificationRaw =
    (searchParams.get("classification") ?? searchParams.get("category") ?? "").trim();

  const dateRange = (searchParams.get("date_range") ?? "7d").trim();
  const sortRaw = (searchParams.get("sort") ?? "desc").trim();

  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const offsetRaw = Number(searchParams.get("offset") ?? "0");
  const limit = Number.isNaN(limitRaw) || limitRaw <= 0 ? 20 : limitRaw;
  const offset = Number.isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

  const isOrgMode = !!orgId;

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
  const sortDir = normalizeSortDirection(sortRaw);

  if (isOrgMode) {
    const page = Math.floor(offset / limit) + 1;

    backendUrl.searchParams.set("limit", String(limit));
    backendUrl.searchParams.set("page", String(page));
    backendUrl.searchParams.set("sort", sortDir);

    if (platform) backendUrl.searchParams.set("platform", platform);

    if (classification) {
      backendUrl.searchParams.set("classification", classification);
      backendUrl.searchParams.set("category", classification);
    }

    backendUrl.searchParams.set("date_range", dateRange);
    const { from, to } = computeDateRange(dateRange);
    if (from) backendUrl.searchParams.set("date_from", from);
    if (to) backendUrl.searchParams.set("date_to", to);

    if (q) {
      backendUrl.searchParams.set("query", q);
      backendUrl.searchParams.set("q", q);
    }
  } else {
    if (q) backendUrl.searchParams.set("q", q);
    if (platform) backendUrl.searchParams.set("platform", platform);
    if (classification) backendUrl.searchParams.set("classification", classification);

    backendUrl.searchParams.set("date_range", dateRange);
    backendUrl.searchParams.set("limit", String(limit));
    backendUrl.searchParams.set("offset", String(offset));
  }

  try {
    const res = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "Backend error", details: text.slice(0, 300) },
        { status: 500 }
      );
    }

    const data = await res.json();
    const rawResults = Array.isArray(data.results) ? data.results : [];

    const results = rawResults.map((r: any) => {
      const apiPlatformVal = String(r.platform ?? r.source ?? "Unknown");
      const apiClassVal = String(r.classification ?? r.label_en ?? r.label ?? r.label_id ?? "Unknown");

      return {
        id: String(r.id ?? r.report_id ?? r.dedupe_key ?? r.doc_id ?? ""),
        textSnippet: String(r.text_snippet ?? r.textSnippet ?? r.text ?? r.snippet ?? ""),
        platform: normalizePlatformDisplay(apiPlatformVal),
        classification: normalizeClassDisplay(apiClassVal),
        toxicityScore: extractScore(r),
        date: normalizeDate(r.date ?? r.created_at ?? r.post_time ?? r.timestamp),
        url: String(r.url ?? ""),
      };
    });

    const total =
      typeof data.total === "number"
        ? data.total
        : typeof data.count === "number"
        ? data.count
        : results.length;

    return NextResponse.json({
      results,
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to reach backend", details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}