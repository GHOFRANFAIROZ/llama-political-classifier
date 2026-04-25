"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
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

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function AdminOrgRequestsPage() {
  const { user, userProfile, loading, profileLoading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<OrgRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">(
    "pending"
  );
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

  async function loadRequests() {
    if (!canLoad) return;
    if (!BACKEND_URL) {
      setError("NEXT_PUBLIC_BACKEND_URL is not configured.");
      setLoadingList(false);
      return;
    }

    try {
      setLoadingList(true);
      setError(null);

      const token = await user!.getIdToken();

      const url = new URL(`${BACKEND_URL}/admin/org_requests`);
      if (statusFilter !== "all") {
        url.searchParams.set("status", statusFilter);
      }
      url.searchParams.set("limit", "100");

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
  }

  useEffect(() => {
    if (!canLoad) return;
    void loadRequests();
  }, [canLoad, statusFilter]);

  async function handleReview(
    requestId: string,
    action: "approve" | "reject"
  ) {
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

      const token = await user.getIdToken();

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-purple-100">Organization requests</h1>
          <p className="text-purple-400 mt-2">
            Review pending organization access requests and approve or reject them.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as "pending" | "approved" | "rejected" | "all"
              )
            }
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
                className="rounded-2xl border border-purple-900/50 bg-[#120F18] p-5 shadow-[0_0_18px_rgba(176,92,255,0.18)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-purple-100">
                        {item.organization_name}
                      </h2>

                      <span className="rounded-full border border-purple-700/50 bg-black/30 px-2 py-1 text-[11px] text-purple-200">
                        {item.status}
                      </span>

                      {item.requested_plan ? (
                        <span className="rounded-full border border-purple-700/50 bg-black/30 px-2 py-1 text-[11px] text-purple-300">
                          {item.requested_plan}
                        </span>
                      ) : null}
                    </div>

                    <p className="text-sm text-purple-300 break-all">
                      {item.requester_email}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-purple-400">
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
                    </div>

                    {item.message ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-purple-200 whitespace-pre-wrap">
                        {item.message}
                      </div>
                    ) : null}

                    {item.review_note ? (
                      <div className="mt-2 text-xs text-amber-300">
                        Review note: {item.review_note}
                      </div>
                    ) : null}

                    {item.org_id ? (
                      <div className="mt-2 text-xs text-emerald-300">
                        Approved org_id: {item.org_id}
                      </div>
                    ) : null}

                    {item.linked_user_uid ? (
                      <div className="mt-1 text-xs text-purple-400 break-all">
                        Linked user UID: {item.linked_user_uid}
                      </div>
                    ) : null}
                  </div>

                  {pending ? (
                    <div className="flex flex-wrap gap-2">
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