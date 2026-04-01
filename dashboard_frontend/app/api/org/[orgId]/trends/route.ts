// app/api/org/[orgId]/trends/route.ts
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
    `/org/${encodeURIComponent(orgId)}/trends`,
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
      const text = await res.text();
      return NextResponse.json(
        { error: "Backend error", details: text },
        { status: 500 }
      );
    }

    const data = await res.json();

    // ---- timeseries (supports camelCase + snake_case)
    const rawSeries = data.timeseries || data.series || data.timeline || [];
    const timeseries = Array.isArray(rawSeries)
      ? rawSeries.map((p: any) => ({
          date: p.date ?? p.day ?? p.bucket ?? "",
          totalReports:
            Number(p.totalReports ?? p.total_reports ?? p.total ?? p.count ?? 0) ||
            0,
          hateReports:
            Number(
              p.hateReports ??
                p.hate_reports ??
                p.hate_speech ??
                p.hate ??
                p.toxic ??
                0
            ) || 0,
        }))
      : [];

    // ---- byPlatform (robust: supports array + map)
    const rawPlatforms =
      data.byPlatform ??
      data.by_platform ??
      data.platforms ??
      data.platform_stats ??
      [];

    let byPlatform: { platform: string; hateReports: number }[] = [];

    if (Array.isArray(rawPlatforms)) {
      byPlatform = rawPlatforms.map((p: any) => ({
        platform: p.platform ?? p.name ?? "Other",
        hateReports:
          Number(
            p.hateReports ?? p.hate_reports ?? p.hate ?? p.hate_speech ?? p.total ?? 0
          ) || 0,
      }));
    } else if (rawPlatforms && typeof rawPlatforms === "object") {
      // map example: { twitter: 3, facebook: 1 }
      byPlatform = Object.entries(rawPlatforms).map(([platform, v]) => ({
        platform,
        hateReports:
          Number(
            typeof v === "number"
              ? v
              : (v as any)?.hateReports ??
                (v as any)?.hate ??
                (v as any)?.count ??
                0
          ) || 0,
      }));
      byPlatform.sort((a, b) => b.hateReports - a.hateReports);
    }

    return NextResponse.json({ timeseries, byPlatform });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to reach backend", details: String(error) },
      { status: 500 }
    );
  }
}