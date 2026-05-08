// app/api/org/[orgId]/stats/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getBackendBaseUrl() {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    ""
  ).trim();
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

  const { orgId } = params;
  const { searchParams } = new URL(req.url);

  const backendUrl = new URL(
    `/org/${encodeURIComponent(orgId)}/stats`,
    backendBaseUrl
  );

  searchParams.forEach((value, key) => {
    backendUrl.searchParams.set(key, value);
  });

  try {
    const res = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "Backend error", details: text },
        { status: 500 }
      );
    }

    const data = await res.json();

    const mapped = {
      totalReports:
        data.total_reports ?? data.totalReports ?? data.total ?? 0,
      last7dReports:
        data.last7d_reports ??
        data.last_7d_reports ??
        data.last7DaysReports ??
        data.last7d ??
        0,
      activeUsers: data.active_users ?? data.activeUsers ?? null,
      hateSpeechRatio:
        data.hate_speech_ratio ?? data.hateSpeechRatio ?? data.hateRatio ?? data.hate_speech ?? 0,
      mostToxicPlatform:
        data.most_toxic_platform ?? data.mostToxicPlatform ?? null,
      timeToFirstReviewHours:
        data.time_to_first_review_hours ??
        data.timeToFirstReviewHours ??
        null,
    };

    return NextResponse.json(mapped);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to reach backend",
        details: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}