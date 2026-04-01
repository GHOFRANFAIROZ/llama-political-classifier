"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardIcon,
  CheckIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  LinkIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  FireIcon,
} from "@heroicons/react/24/outline";
import { Report } from "./ReportsTable";

type ReportDetailDrawerProps = {
  report: Report | null;
  isOpen: boolean;
  onClose: () => void;
};

type Risk = {
  label: "Low" | "Medium" | "High" | "Critical";
  tone: "green" | "yellow" | "orange" | "red";
  className: string;
  icon: React.ReactNode;
};

function getRisk(score: number): Risk {
  if (score >= 80)
    return {
      label: "Critical",
      tone: "red",
      className: "bg-red-500/10 text-red-300 border-red-500/40",
      icon: <FireIcon className="w-4 h-4" />,
    };
  if (score >= 60)
    return {
      label: "High",
      tone: "orange",
      className: "bg-orange-500/10 text-orange-300 border-orange-500/40",
      icon: <ExclamationTriangleIcon className="w-4 h-4" />,
    };
  if (score >= 40)
    return {
      label: "Medium",
      tone: "yellow",
      className: "bg-yellow-500/10 text-yellow-200 border-yellow-500/40",
      icon: <ShieldCheckIcon className="w-4 h-4" />,
    };
  return {
    label: "Low",
    tone: "green",
    className: "bg-emerald-500/10 text-emerald-200 border-emerald-500/40",
    icon: <ShieldCheckIcon className="w-4 h-4" />,
  };
}

function formatDate(dateStr: string) {
  if (!dateStr) return "Unknown date";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString();
}

function formatRelativeTime(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d ago`;
}

async function safeCopy(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

async function safeShare(payload: { title?: string; text?: string; url?: string }) {
  try {
    // @ts-ignore
    if (navigator.share) {
      // @ts-ignore
      await navigator.share(payload);
      return true;
    }
  } catch {}
  return false;
}

function clamp0to100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export default function ReportDetailDrawer({
  report,
  isOpen,
  onClose,
}: ReportDetailDrawerProps) {
  const [toast, setToast] = useState<null | { kind: "ok" | "err"; msg: string }>(
    null
  );

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1400);
    return () => clearTimeout(t);
  }, [toast]);

  const score = useMemo(
    () => clamp0to100(Number(report?.toxicityScore ?? 0)),
    [report?.toxicityScore]
  );
  const risk = useMemo(() => getRisk(score), [score]);

  const shareText = useMemo(() => {
    if (!report) return "";
    const urlLine = report.url ? `\n\nSource: ${report.url}` : "";
    return `Flagged report (${report.classification}) on ${report.platform}:\n\n"${report.textSnippet}"${urlLine}`;
  }, [report]);

  const barClass = useMemo(() => {
    if (risk.tone === "red") return "bg-red-500/50";
    if (risk.tone === "orange") return "bg-orange-500/50";
    if (risk.tone === "yellow") return "bg-yellow-500/50";
    return "bg-emerald-500/50";
  }, [risk.tone]);

  const handleCopySnippet = async () => {
    if (!report?.textSnippet) return;
    const ok = await safeCopy(report.textSnippet);
    setToast(ok ? { kind: "ok", msg: "Snippet copied" } : { kind: "err", msg: "Copy failed" });
  };

  const handleCopySummary = async () => {
    if (!report) return;
    const ok = await safeCopy(shareText);
    setToast(ok ? { kind: "ok", msg: "Summary copied" } : { kind: "err", msg: "Copy failed" });
  };

  const handleCopySourceUrl = async () => {
    if (!report?.url) return;
    const ok = await safeCopy(report.url);
    setToast(ok ? { kind: "ok", msg: "Source URL copied" } : { kind: "err", msg: "Copy failed" });
  };

  const handleShare = async () => {
    if (!report) return;

    const title = `Anti-Hate Monitor • ${report.classification || "Report"}`;
    const ok = await safeShare({
      title,
      text: shareText,
      url: report.url || undefined,
    });

    if (ok) {
      setToast({ kind: "ok", msg: "Shared" });
      return;
    }

    // fallback: copy summary
    const copied = await safeCopy(shareText);
    setToast(copied ? { kind: "ok", msg: "Share text copied" } : { kind: "err", msg: "Share failed" });
  };

  const handleExportJson = async () => {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${report.id}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // optional: also copy json
    const ok = await safeCopy(json);
    if (ok) setToast({ kind: "ok", msg: "JSON exported + copied" });
  };

  const handleOpenSource = () => {
    if (!report?.url) return;
    window.open(report.url, "_blank", "noopener,noreferrer");
  };

  const headerTime = useMemo(() => {
    if (!report?.date) return "Unknown date";
    const rel = formatRelativeTime(report.date);
    return `${formatDate(report.date)}${rel ? ` · ${rel}` : ""}`;
  }, [report?.date]);

  return (
    <AnimatePresence>
      {isOpen && report && (
        <motion.div
          className="fixed inset-0 z-40 flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Overlay */}
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Panel */}
          <motion.aside
            className="relative w-full max-w-xl bg-[#050509] border-l border-purple-500/30 shadow-2xl shadow-purple-900/40 flex flex-col"
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            {/* Toast */}
            <AnimatePresence>
              {toast && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2 text-xs border shadow-lg
                    ${
                      toast.kind === "ok"
                        ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30"
                        : "bg-red-500/10 text-red-200 border-red-500/30"
                    }`}
                >
                  {toast.msg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-purple-500/20">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-purple-300 flex-wrap">
                  <span className="inline-flex items-center gap-2 rounded-full bg-purple-500/10 px-2 py-1 border border-purple-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                    Report Detail
                  </span>
                  <span className="text-gray-500">ID: {report.id}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-gray-100">
                    {report.classification || "Unlabeled content"}
                  </h2>

                  {/* Severity badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${risk.className}`}
                    title={`Severity: ${risk.label}`}
                  >
                    {risk.icon}
                    {risk.label}
                  </span>

                  {/* Score chip */}
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-200">
                    Score: <span className="ml-1 font-semibold">{score}</span>/100
                  </span>

                  {/* Platform chip */}
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-200">
                    {report.platform || "Unknown"}
                  </span>
                </div>

                <p className="text-xs text-gray-400">{headerTime}</p>
              </div>

              <button
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-full p-1.5 border border-purple-500/40 text-gray-400 hover:text-white hover:bg-purple-500/20 transition"
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Toxicity bar */}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Toxicity score
                </p>
                <div className="h-2 rounded-full bg-white/5 border border-white/10 overflow-hidden">
                  <div
                    className={`h-full ${barClass}`}
                    style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCopySnippet}
                  className="inline-flex items-center gap-2 rounded-lg border border-purple-500/40 px-3 py-1.5 text-sm font-medium text-purple-200 hover:bg-purple-500/10 transition"
                >
                  <ClipboardIcon className="w-4 h-4" />
                  Copy snippet
                </button>

                <button
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-2 rounded-lg border border-purple-500/40 px-3 py-1.5 text-sm font-medium text-purple-200 hover:bg-purple-500/10 transition"
                >
                  <ClipboardIcon className="w-4 h-4" />
                  Copy summary
                </button>

                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-2 rounded-lg border border-purple-500/40 px-3 py-1.5 text-sm font-medium text-purple-200 hover:bg-purple-500/10 transition"
                  title="Share (or copy share text)"
                >
                  <ShareIcon className="w-4 h-4" />
                  Share
                </button>

                <button
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-2 rounded-lg border border-purple-500/40 px-3 py-1.5 text-sm font-medium text-purple-200 hover:bg-purple-500/10 transition"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Export JSON
                </button>

                <button
                  onClick={handleCopySourceUrl}
                  disabled={!report.url}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition
                    ${
                      report.url
                        ? "border border-purple-500/40 text-purple-200 hover:bg-purple-500/10"
                        : "bg-white/5 text-gray-500 cursor-not-allowed border border-white/10"
                    }`}
                  title={report.url ? "Copy source URL" : "No source URL"}
                >
                  <LinkIcon className="w-4 h-4" />
                  Copy source
                </button>

                <button
                  onClick={handleOpenSource}
                  disabled={!report.url}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition
                    ${
                      report.url
                        ? "bg-purple-600 text-white hover:bg-purple-500"
                        : "bg-white/5 text-gray-500 cursor-not-allowed border border-white/10"
                    }`}
                  title={report.url ? "Open source" : "No source URL"}
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                  Open source
                </button>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Content snippet
                </p>
                <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-black to-black p-4 text-sm text-gray-100 shadow-inner shadow-purple-900/40">
                  {report.textSnippet || (
                    <span className="text-gray-500">No text available.</span>
                  )}
                </div>
              </div>

              {/* Source */}
              {report.url ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Source</p>
                  <a
                    href={report.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-purple-200 underline hover:text-white break-all"
                  >
                    {report.url}
                  </a>
                </div>
              ) : null}

              {/* Timeline */}
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Review timeline
                </p>
                <ol className="relative border-l border-purple-500/30 pl-4 space-y-4 text-xs text-gray-300">
                  <li className="ml-1">
                    <div className="absolute -left-[9px] mt-0.5 h-2 w-2 rounded-full bg-purple-400 shadow shadow-purple-500" />
                    <p className="font-medium text-gray-100">Detected by AI classifier</p>
                    <p className="text-[11px] text-gray-500">{formatDate(report.date)}</p>
                  </li>
                  <li className="ml-1">
                    <div className="absolute -left-[9px] mt-0.5 h-2 w-2 rounded-full bg-indigo-400 shadow shadow-indigo-500" />
                    <p className="font-medium text-gray-100">Queued for newsroom review</p>
                    <p className="text-[11px] text-gray-500">
                      Awaiting assignment to reviewer
                    </p>
                  </li>
                  <li className="ml-1">
                    <div className="absolute -left-[9px] mt-0.5 h-2 w-2 rounded-full bg-gray-500 shadow shadow-gray-500" />
                    <p className="font-medium text-gray-100">Reviewer action</p>
                    <p className="text-[11px] text-gray-500">
                      Connect “reviewed” later when you add backend update endpoint.
                    </p>
                  </li>
                </ol>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}