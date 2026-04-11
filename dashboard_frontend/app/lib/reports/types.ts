export type ReportItem = {
  id: string;
  textSnippet: string;
  platform?: string;
  classification?: string;
  rawClassification?: string;
  toxicityScore?: number | null;
  date?: string;
  url?: string;
  classification_status?: string;
  fallback_used?: boolean;
  review_recommended?: boolean;
  parse_status?: string;
  sheet_status?: string;
  ai_explanation?: string;
};