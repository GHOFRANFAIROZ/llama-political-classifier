"use client";
export const dynamic = "force-dynamic";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

type RequestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export default function RequestAccessPage() {
  const backendUrl = useMemo(
    () => process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, "") || "",
    []
  );

  const [requesterEmail, setRequesterEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [country, setCountry] = useState("");
  const [requestedPlan, setRequestedPlan] = useState<"Free" | "Pro" | "Enterprise">("Free");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<RequestState>({ kind: "idle" });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!backendUrl) {
      setState({
        kind: "error",
        message:
          "The backend URL is not configured. Check NEXT_PUBLIC_BACKEND_URL before testing request access.",
      });
      return;
    }

    if (!requesterEmail.trim() || !organizationName.trim()) {
      setState({
        kind: "error",
        message: "Work email and organization name are required.",
      });
      return;
    }

    try {
      setState({ kind: "loading" });

      const res = await fetch(`${backendUrl}/org_requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requester_email: requesterEmail.trim().toLowerCase(),
          organization_name: organizationName.trim(),
          country: country.trim() || null,
          requested_plan: requestedPlan,
          message: message.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setState({
          kind: "error",
          message:
            data?.error ||
            `Request failed with status ${res.status}.`,
        });
        return;
      }

      const req = data?.request;
      const successMessage = req
        ? `Your request was submitted successfully and is now marked as ${req.status}. An admin can review it and approve your organization workspace.`
        : "Your request was submitted successfully. An admin can review it and approve your organization workspace.";

      setState({
        kind: "success",
        message: successMessage,
      });

      setRequesterEmail("");
      setOrganizationName("");
      setCountry("");
      setRequestedPlan("Free");
      setMessage("");
    } catch (error: any) {
      setState({
        kind: "error",
        message: error?.message || "Failed to submit request.",
      });
    }
  }

  return (
    <main className="min-h-screen bg-[#050411] text-white px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <Link
            href="/login"
            className="text-sm text-purple-300 hover:text-purple-200 transition"
          >
            ← Back to login
          </Link>
        </div>

        <div className="rounded-3xl border border-purple-900/40 bg-[#120F18] p-8 shadow-[0_0_30px_rgba(138,43,226,0.18)]">
          <div className="mb-8 space-y-3">
            <span className="inline-flex rounded-full border border-purple-700/50 bg-black/30 px-3 py-1 text-[11px] uppercase tracking-wide text-purple-300">
              Organization onboarding
            </span>

            <h1 className="text-4xl font-bold text-purple-100">Request organization access</h1>

            <p className="text-sm text-purple-300 max-w-2xl leading-6">
              Use this form if you are requesting a dedicated workspace for an
              organization, team, or initiative. After submission, an admin can
              review your request and approve your workspace.
            </p>

            <div className="rounded-2xl border border-purple-900/40 bg-black/20 px-4 py-3 text-sm text-purple-300">
              <span className="font-medium text-purple-100">Before you submit:</span>{" "}
              use the same work email address you plan to use for sign-in. If that
              email already exists in Firebase Auth, approval can link your account
              to the organization more smoothly.
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs uppercase tracking-wide text-purple-400 mb-2">
                Work email
              </label>
              <input
                type="email"
                value={requesterEmail}
                onChange={(e) => setRequesterEmail(e.target.value)}
                placeholder="name@organization.com"
                className="w-full rounded-2xl border border-purple-900/50 bg-black/30 px-4 py-3 text-sm text-white placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide text-purple-400 mb-2">
                Organization name
              </label>
              <input
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Example Organization"
                className="w-full rounded-2xl border border-purple-900/50 bg-black/30 px-4 py-3 text-sm text-white placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs uppercase tracking-wide text-purple-400 mb-2">
                  Country
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Syria"
                  className="w-full rounded-2xl border border-purple-900/50 bg-black/30 px-4 py-3 text-sm text-white placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wide text-purple-400 mb-2">
                  Requested plan
                </label>
                <select
                  value={requestedPlan}
                  onChange={(e) =>
                    setRequestedPlan(e.target.value as "Free" | "Pro" | "Enterprise")
                  }
                  className="w-full rounded-2xl border border-purple-900/50 bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Free">Free</option>
                  <option value="Pro">Pro</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide text-purple-400 mb-2">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Briefly describe your organization, intended use, or what kind of workspace you need."
                className="w-full rounded-2xl border border-purple-900/50 bg-black/30 px-4 py-3 text-sm text-white placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            {state.kind === "error" && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {state.message}
              </div>
            )}

            {state.kind === "success" && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {state.message}
              </div>
            )}

            <div className="rounded-2xl border border-purple-900/40 bg-black/20 px-4 py-3 text-xs text-purple-400 leading-6">
              What happens next:
              <div className="mt-2 space-y-1">
                <div>1. Your request is stored for admin review.</div>
                <div>2. An admin can approve or reject the request.</div>
                <div>3. If approved, your organization workspace is created.</div>
                <div>4. If your email already exists as a user, it can be linked to that workspace.</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={state.kind === "loading"}
                className="rounded-2xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60 transition"
              >
                {state.kind === "loading" ? "Submitting..." : "Submit request"}
              </button>

              <Link
                href="/login"
                className="rounded-2xl border border-purple-800/60 px-6 py-3 text-sm text-purple-200 hover:bg-purple-900/20 transition"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}