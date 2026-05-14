import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getBackendBaseUrl() {
    return (
        process.env.BACKEND_URL ||
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        ""
    ).trim();
}

export async function PATCH(req: NextRequest) {
    const backendBaseUrl = getBackendBaseUrl();

    if (!backendBaseUrl) {
        return NextResponse.json(
            { error: "BACKEND_URL is not configured" },
            { status: 500 }
        );
    }

    let body: unknown;

    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        );
    }

    try {
        const res = await fetch(`${backendBaseUrl}/api/reports/review`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        return NextResponse.json(data, { status: res.ok ? 200 : res.status });
    } catch (error: unknown) {
        return NextResponse.json(
            {
                error: "Reports review route processing failed",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}
