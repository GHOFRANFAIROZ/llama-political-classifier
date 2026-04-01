// dashboard_frontend/app/api/suggest/route.ts
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

type Suggestion = { text: string; source: "firestore"; score?: number };

function normalizeQuery(q: string) {
  return q.trim().replace(/\s+/g, " ");
}

// فلترة خفيفة (مش قائمة توقف كاملة، بس تمنع noise)
function isBadToken(t: string) {
  if (!t) return true;
  if (t.length < 3) return true;
  // أرقام فقط
  if (/^\d+$/u.test(t)) return true;
  // حروف مكررة بشكل مبالغ
  if (/^(.)\1{3,}$/u.test(t)) return true;
  return false;
}

function extractEntities(text: string) {
  const out: string[] = [];
  const raw = String(text || "");

  // hashtags / mentions
  const tags = raw.match(/[#@][\p{L}\p{N}_-]{2,}/gu) || [];
  out.push(...tags.map((x) => x.toLowerCase()));

  // كلمات
  const words = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#@_-]+/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => !isBadToken(w));

  // unigrams
  out.push(...words);

  // bi-grams (عبارتين)
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`.trim();
    if (!isBadToken(words[i]) && !isBadToken(words[i + 1])) out.push(bg);
  }

  // tri-grams (3 كلمات) — ممتاز للعربي لو النص طويل
  for (let i = 0; i < words.length - 2; i++) {
    const tg = `${words[i]} ${words[i + 1]} ${words[i + 2]}`.trim();
    out.push(tg);
  }

  return out;
}

function buildSuggestions(q: string, results: any[]): Suggestion[] {
  const query = q.toLowerCase();
  const freq = new Map<string, number>();

  // نعطي وزن قوي للـ query نفسها
  if (query.length >= 2) freq.set(query, 20);

  for (const r of results || []) {
    const t = String(r?.textSnippet ?? r?.text ?? r?.snippet ?? "");
    if (!t) continue;

    const entities = extractEntities(t);

    for (const e of entities) {
      if (isBadToken(e)) continue;

      let w = 1;

      // boost لو فيها query
      if (e.includes(query)) w += 6;

      // boost للهاشتاغ/منشن
      if (e.startsWith("#") || e.startsWith("@")) w += 3;

      // boost للعبارات (فيها مسافة)
      if (e.includes(" ")) w += 2;

      freq.set(e, (freq.get(e) || 0) + w);
    }
  }

  // ترتيب
  const sorted = [...freq.entries()]
    .filter(([t]) => t.length >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([text, score]) => ({ text, source: "firestore" as const, score }));

  return sorted.slice(0, 3);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const qRaw = searchParams.get("q") || "";
    const scope = (searchParams.get("scope") || "public").toLowerCase();
    const orgId = searchParams.get("orgId") || "";

    const q = normalizeQuery(qRaw);
    if (!q || q.length < 2) return NextResponse.json({ suggestions: [] });

    const url = new URL(`${req.nextUrl.origin}/api/search`);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "5");
    url.searchParams.set("offset", "0");
    url.searchParams.set("date_range", "7d");
    if (scope === "org" && orgId) url.searchParams.set("orgId", orgId);

    const resp = await fetch(url.toString(), { cache: "no-store" });
    if (!resp.ok) return NextResponse.json({ suggestions: [] });

    const data = await resp.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const suggestions = buildSuggestions(q, results);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}