export function clamp0to100(x: unknown): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

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
  manual: "Manual",
};

const CLASS_API_TO_UI: Record<string, string | undefined> = {
  HATE_SPEECH: "Hate Speech",
  HATE_SPEECH_GROUP: "Hate Speech",
  HATE_SPEECH_INDIVIDUAL: "Hate Speech",
  CALL_FOR_VIOLENCE: "Violence",
  VIOLENCE: "Violence",
  ABUSIVE: "Abusive",
  ABUSE: "Abusive",
  HARASSMENT: "Abusive",
  INSULT: "Abusive",
  NEUTRAL_OTHER: "Neutral",
  NEUTRAL: "Neutral",
  MISINFORMATION: "Misinformation",
  POLITICAL: "Political",
};

export function normalizeDate(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "number") return new Date(val).toISOString();

  if (typeof val === "object" && val !== null) {
    const maybeObj = val as { seconds?: number; _seconds?: number };
    const sec = maybeObj.seconds ?? maybeObj._seconds;
    if (typeof sec === "number") {
      return new Date(sec * 1000).toISOString();
    }
  }

  return String(val);
}

export function normalizePlatformDisplay(apiValue: string): string {
  const v = (apiValue ?? "").trim();
  return PLATFORM_API_TO_UI[v] ?? (v || "Unknown");
}

export function normalizeClassDisplay(apiValue: string): string {
  const v = (apiValue ?? "").trim().toUpperCase();
  return CLASS_API_TO_UI[v] ?? (apiValue || "Unknown");
}

export function deriveScoreFromClass(
  displayClass: string,
  rawClass: string
): number {
  const display = String(displayClass ?? "").toUpperCase();
  const raw = String(rawClass ?? "").toUpperCase();
  const combined = `${display} ${raw}`;

  if (combined.includes("VIOLENCE")) return 95;
  if (combined.includes("HATE")) return 90;
  if (combined.includes("ABUS")) return 70;
  if (combined.includes("HARASS")) return 65;
  if (combined.includes("INSULT")) return 60;
  if (combined.includes("MISINFO")) return 55;
  if (combined.includes("POLITICAL")) return 40;
  if (combined.includes("NEUTRAL")) return 10;
  return 0;
}

export function extractScore(
  r: Record<string, unknown>,
  displayClass: string,
  rawClass: string
): number {
  if (r.toxicity_score != null) return clamp0to100(r.toxicity_score);
  if (r.toxicityScore != null) return clamp0to100(r.toxicityScore);
  if (r.toxicity != null) return clamp0to100(r.toxicity);

  if (typeof r.confidence_score === "number") {
    const x =
      r.confidence_score <= 1 ? r.confidence_score * 100 : r.confidence_score;
    return clamp0to100(x);
  }

  return deriveScoreFromClass(displayClass, rawClass);
}