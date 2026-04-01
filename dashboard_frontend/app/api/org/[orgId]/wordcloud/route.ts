// app/api/org/[orgId]/wordcloud/route.ts
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
    `/org/${encodeURIComponent(orgId)}/wordcloud`,
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

    const rawTerms = data.terms || data.words || data.items || [];

    const terms = Array.isArray(rawTerms)
      ? rawTerms.map((t: any) => ({
          term: t.term ?? t.text ?? t.word ?? "",
          count: Number(t.count ?? t.value ?? t.freq ?? 0) || 0,
          category: t.category ?? t.type ?? null,
        }))
      : [];

    return NextResponse.json({ terms });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to reach backend", details: String(error) },
      { status: 500 }
    );
  }
}