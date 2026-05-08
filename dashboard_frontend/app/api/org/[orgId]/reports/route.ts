import { NextRequest, NextResponse } from "next/server";
import {
    extractScore,
    normalizeClassDisplay,
    normalizeDate,
    normalizePlatformDisplay,
} from "@/app/lib/reports/normalize";

export const runtime = "nodejs";

function getBackendBaseUrl() {
    return (
        process.env.BACKEND_URL ||
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        ""
    ).trim();
}

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
        case "all_time":
        default:
            fromDate = null;
            break;
    }

    if (!fromDate) return {};
    return { from: fromDate.toISOString(), to: now.toISOString() };
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

export async function GET(
    req: NextRequest,
    { params }: { params: { orgId: string } }
) {
    const backendBaseUrl = getBackendBaseUrl();

    if (!backendBaseUrl) {
        return NextResponse.json(
            { error: "BACKEND_URL is not configured" },
            { status: 500 }
        );
    }

    const orgId = params.orgId;
    const { searchParams } = new URL(req.url);

    const platform = (searchParams.get("platform") ?? "").trim();
    const category = (
        searchParams.get("category") ??
        searchParams.get("classification") ??
        ""
    ).trim();

    const dateRange = (searchParams.get("date_range") ?? "7d").trim();
    const sortRaw = (searchParams.get("sort") ?? "created_at_desc").trim();

    const limitRaw = Number(searchParams.get("limit") ?? "20");
    const offsetRaw = Number(searchParams.get("offset") ?? "0");

    const limit = Number.isNaN(limitRaw) || limitRaw <= 0 ? 20 : limitRaw;
    const offset = Number.isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

    const { sortBy, direction } = normalizeSort(sortRaw);
    const page = Math.floor(offset / limit) + 1;

    const backendUrl = new URL(
        `/org/${encodeURIComponent(orgId)}/reports`,
        backendBaseUrl
    );

    backendUrl.searchParams.set("limit", String(limit));
    backendUrl.searchParams.set("page", String(page));
    backendUrl.searchParams.set("sort", direction);
    backendUrl.searchParams.set("sort_by", sortBy);
    backendUrl.searchParams.set("date_range", dateRange);

    const { from, to } = computeDateRange(dateRange);
    if (from) backendUrl.searchParams.set("date_from", from);
    if (to) backendUrl.searchParams.set("date_to", to);

    if (platform) backendUrl.searchParams.set("platform", platform);
    if (category) backendUrl.searchParams.set("category", category);

    try {
        const res = await fetch(backendUrl.toString(), {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("Org reports backend error:", {
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
        const total = getTotalCount(data, rawResults);

        return NextResponse.json({
            results: normalizedResults,
            total,
            limit,
            offset,
        });
    } catch (error: any) {
        console.error("Org reports route processing error:", {
            message: error?.message,
            stack: error?.stack,
            backendUrl: backendUrl.toString(),
        });

        return NextResponse.json(
            {
                error: "Org reports route processing failed",
                backendUrl: backendUrl.toString(),
                details: error?.message ?? String(error),
            },
            { status: 500 }
        );
    }
}