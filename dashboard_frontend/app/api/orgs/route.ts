// app/api/orgs/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getBackendBaseUrl() {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    ""
  ).trim();
}

type Org = {
  id: string;
  slug?: string;
  name: string;
  plan?: "Free" | "Pro" | "Enterprise";
  country?: string;
};

export async function GET(_req: NextRequest) {
  const backendBaseUrl = getBackendBaseUrl();

  if (!backendBaseUrl) {
    return NextResponse.json(
      { error: "BACKEND_URL is not configured" },
      { status: 500 }
    );
  }

  const backendUrl = new URL("/orgs", backendBaseUrl);

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

    const orgs: Org[] = Array.isArray(data.results)
      ? data.results.map((o: any) => {
          const rawId = String(o.org_id ?? o.id ?? "");
          const displayName =
            (o.display_name ?? o.name ?? rawId) || "Unnamed organization";

          const slugFromBackend = (o.slug as string | undefined) ?? undefined;
          const fallbackSlug = rawId ? rawId.replace(/_/g, "-") : undefined;

          return {
            id: rawId,
            slug: slugFromBackend || fallbackSlug,
            name: displayName,
            plan: (o.plan ?? undefined) as Org["plan"] | undefined,
            country: (o.country ?? undefined) as string | undefined,
          };
        })
      : [];

    return NextResponse.json({ orgs });
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