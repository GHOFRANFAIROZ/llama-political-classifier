// app/api/org/[orgId]/stats/route.ts
import { NextRequest, NextResponse } from "next/server";

const backendBaseUrl = process.env.BACKEND_URL;

export async function GET(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
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

  // مرر أي params (مثلاً date_range) للـ backend
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
      const text = await res.text();
      return NextResponse.json(
        { error: "Backend error", details: text },
        { status: 500 }
      );
    }

    const data = await res.json();

    // تطبيع البيانات لأسماء مفهومة في الـ frontend
    const mapped = {
      totalReports:
        data.total_reports ?? data.totalReports ?? data.total ?? 0,
      last7dReports:
        data.last_7d_reports ?? data.last7DaysReports ?? data.last7d ?? 0,
      activeUsers: data.active_users ?? data.activeUsers ?? null,
      hateSpeechRatio:
        data.hate_speech_ratio ?? data.hateRatio ?? data.hate_speech ?? 0,
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
      { error: "Failed to reach backend", details: String(error) },
      { status: 500 }
    );
  }
}