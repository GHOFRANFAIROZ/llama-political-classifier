import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://127.0.0.1:10000";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateRange = searchParams.get("date_range") || "30d";

    const backendUrl = new URL("/api/reports/wordcloud", BACKEND_URL);
    backendUrl.searchParams.set("date_range", dateRange);

    const response = await fetch(backendUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Failed to fetch public report wordcloud",
        detail: message,
      },
      { status: 500 }
    );
  }
}
