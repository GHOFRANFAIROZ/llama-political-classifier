"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

type OrgRequest = {
  request_id: string;
  requester_email: string;
  organization_name: string;
  organization_slug?: string;
  org_id_preview?: string;
  requested_plan?: string;
  country?: string | null;
  message?: string | null;
  status: "pending" | "approved" | "rejected" | string;
  created_at?: string;
  reviewed_at?: string;
  reviewed_by_email?: string | null;
  review_note?: string | null;
  linked_user_uid?: string | null;
  user_profile_created?: boolean;
  org_id?: string | null;
};

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const base =
    "rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize";

  if (status === "approved") {
    return (
      <span
        className={`${base} border-emerald-500/40 bg-emerald-500/10 text-emerald-300`}
      >
        approved
      </span>
    );
  }

  if (status === "rejected") {
    return (
      <span
        className={`${base} border-red-500/40 bg-red-500/10 text-red-300`}
      >
        rejected
      </span>
    );
  }

  return (
    <span
      className={`${base} border-amber-500/40 bg-amber-500/10 text-amber-300`}
    >
      pending
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone = "purple",
}: {
  label: string;
  value: string | number;
  tone?: "purple" | "amber" | "emerald" | "red";
}) {
  const toneMap = {
    purple: "text-purple-100 border-purple-900/60",
    amber: "text-amber-200 border-amber-500/20",
    emerald: "text-emerald-200 border-emerald-500/20",
    red: "text-red-200 border-red-500/20",
  };

  return (
    <div
      className={`rounded-2xl border bg-[#120F18] p-4 shadow-[0_0_18px_rgba(176,92,255,0.12)] ${toneMap[tone]}`}
    >
      <div className="text-xs uppercase tracking-wide text-purple-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

export default function AdminOrgRequestsPage() {
  const { user, userProfile, loading, profileLoading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<OrgRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [loadingList, setLoadingList] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = userProfile?.role === "admin";

  const canLoad = useMemo(() => {
    return !!user && !!userProfile && userProfile.status === "active" && isAdmin;
  }, [user, userProfile, isAdmin]);

  useEffect(() => {
    if (loading || profileLoading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (!isAdmin) {
      router.replace("/dashboard");
    }
  }, [user, loading, profileLoading, isAdmin, router]);

  const loadRequests = useCallback(async () => {
    if (!canLoad) return;

    if (!BACKEND_URL) {
      setError("NEXT_PUBLIC_BACKEND_URL is not configured.");
      setLoadingList(false);
      return;
    }

    try {
      setLoadingList(true);
      setError(null);

      const token = await user!.getIdToken(true);

      const url = new URL(`${BACKEND_URL}/admin/org_requests`);
      if (statusFilter !== "all") {
        url.searchParams.set("status", statusFilter);
      }
      url.searchParams.set("limit", "100");

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Failed to load requests (${res.status})`);
      }

      setItems(Array.isArray(data?.results) ? data.results : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load requests");
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  }, [canLoad, statusFilter, user]);

  useEffect(() => {
    if (!canLoad) return;
    void loadRequests();
  }, [canLoad, loadRequests]);

  async function handleReview(requestId: string, action: "approve" | "reject") {
    if (!BACKEND_URL || !user) return;

    const note =
      window.prompt(
        action === "approve"
          ? "Optional approval note:"
          : "Optional rejection note:"
      ) ?? "";

    try {
      setActioningId(requestId);
      setError(null);

      const token = await user.getIdToken(true);

      const res = await fetch(
        `${BACKEND_URL}/admin/org_requests/${requestId}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            review_note: note.trim() || null,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Failed to ${action} request`);
      }

      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? `Failed to ${action} request`);
    } finally {
      setActioningId(null);
    }
  }

  const counts = useMemo(() => {
    const all = items.length;
    const pending = items.filter((x) => x.status === "pending").length;
    const approved = items.filter((x) => x.status === "approved").length;
    const rejected = items.filter((x) => x.status === "rejected").length;

    return { all, pending, approved, rejected };
  }, [items]);

  if (loading || profileLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-purple-100">Loading...</h1>
      </div>
    );
  }

  if (!user) return null;

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-purple-100">Access denied</h1>
        <p className="text-purple-400">
          This page is available to admin users only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-purple-100">
            Organization requests
          </h1>
          <p className="text-purple-400 mt-2 max-w-3xl">
            Review pending organization access requests and approve or reject them.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-[#120F18] border border-purple-900/50 rounded-xl px-3 py-2 text-sm text-purple-200"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>

          <button
            type="button"
            onClick={() => void loadRequests()}
            className="px-4 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-500 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Shown requests" value={counts.all} />
        <SummaryCard label="Pending" value={counts.pending} tone="amber" />
        <SummaryCard label="Approved" value={counts.approved} tone="emerald" />
        <SummaryCard label="Rejected" value={counts.rejected} tone="red" />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {loadingList ? (
        <div className="rounded-2xl border border-purple-900/50 bg-[#120F18] p-6 text-purple-300">
          Loading requests...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-purple-900/50 bg-[#120F18] p-6 text-purple-300">
          No requests found for this filter.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const pending = item.status === "pending";
            const busy = actioningId === item.request_id;

            return (
              <div
                key={item.request_id}
                className="rounded-2xl border border-purple-900/50 bg-[#120F18] p-4 sm:p-5 shadow-[0_0_18px_rgba(176,92,255,0.18)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-purple-100 break-words">
                        {item.organization_name}
                      </h2>

                      <StatusBadge status={item.status} />

                      {item.requested_plan ? (
                        <span className="rounded-full border border-purple-700/50 bg-black/30 px-2 py-1 text-[11px] text-purple-300">
                          {item.requested_plan}
                        </span>
                      ) : null}
                    </div>

                    <p className="text-sm text-purple-300 break-all">
                      {item.requester_email}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-purple-400">
                      <div>
                        <span className="text-purple-500">Request ID: </span>
                        <span className="text-purple-200 break-all">
                          {item.request_id}
                        </span>
                      </div>

                      <div>
                        <span className="text-purple-500">Org ID preview: </span>
                        <span className="text-purple-200">
                          {item.org_id_preview || "—"}
                        </span>
                      </div>

                      <div>
                        <span className="text-purple-500">Slug: </span>
                        <span className="text-purple-200">
                          {item.organization_slug || "—"}
                        </span>
                      </div>

                      <div>
                        <span className="text-purple-500">Country: </span>
                        <span className="text-purple-200">
                          {item.country || "—"}
                        </span>
                      </div>

                      <div>
                        <span className="text-purple-500">Created: </span>
                        <span className="text-purple-200">
                          {formatDateTime(item.created_at)}
                        </span>
                      </div>

                      <div>
                        <span className="text-purple-500">Reviewed: </span>
                        <span className="text-purple-200">
                          {formatDateTime(item.reviewed_at)}
                        </span>
                      </div>

                      <div className="sm:col-span-2">
                        <span className="text-purple-500">Reviewed by: </span>
                        <span className="text-purple-200 break-all">
                          {item.reviewed_by_email || "—"}
                        </span>
                      </div>
                    </div>

                    {item.message ? (
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-purple-200 whitespace-pre-wrap break-words">
                        {item.message}
                      </div>
                    ) : null}

                    {item.review_note ? (
                      <div className="text-xs text-amber-300 break-words">
                        Review note: {item.review_note}
                      </div>
                    ) : null}

                    {item.org_id ? (
                      <div className="text-xs text-emerald-300 break-all">
                        Approved org_id: {item.org_id}
                      </div>
                    ) : null}

                    {item.linked_user_uid ? (
                      <div className="text-xs text-purple-400 break-all">
                        Linked user UID: {item.linked_user_uid}
                      </div>
                    ) : null}

                    {typeof item.user_profile_created === "boolean" ? (
                      <div className="text-xs text-purple-400">
                        User profile created:{" "}
                        <span className="text-purple-200">
                          {item.user_profile_created ? "Yes" : "No"}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {pending ? (
                    <div className="flex flex-col sm:flex-row xl:flex-col gap-2 xl:min-w-[150px]">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleReview(item.request_id, "approve")}
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 transition"
                      >
                        {busy ? "Working..." : "Approve"}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleReview(item.request_id, "reject")}
                        className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500 disabled:opacity-60 transition"
                      >
                        {busy ? "Working..." : "Reject"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}