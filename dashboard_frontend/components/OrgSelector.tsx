"use client";

import React, { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOrg } from "@/app/context/OrgContext";
import { useAuth } from "@/app/context/AuthContext";

export default function OrgSelector() {
  const router = useRouter();
  const pathname = usePathname();

  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === "admin";

  const { orgs, currentOrg, setCurrentOrg, orgsLoading } = useOrg();

  const options = useMemo(() => {
    return (orgs ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug || o.id.replaceAll("_", "-"),
    }));
  }, [orgs]);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!isAdmin) return;

    const selectedId = e.target.value;
    const found = orgs.find((o) => o.id === selectedId);
    if (!found) return;

    setCurrentOrg(found);

    const isOrgDashboardRoute =
      pathname?.startsWith("/dashboard/organizations/") &&
      pathname !== "/dashboard/organizations";

    if (isOrgDashboardRoute) {
      const slug = found.slug || found.id.replaceAll("_", "-");
      router.push(`/dashboard/organizations/${slug}`);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-purple-500">
          Organization
        </span>
        <div
          className="bg-[#120F18] border border-purple-900/60 rounded-lg px-3 py-1.5 text-xs text-purple-100
                     min-w-[170px]"
        >
          {currentOrg?.name || userProfile?.org_id || "Assigned org"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-purple-500">
        Organization
      </span>
      <select
        className="bg-[#120F18] border border-purple-900/60 rounded-lg px-3 py-1.5 text-xs text-purple-100
                   focus:outline-none focus:ring-1 focus:ring-purple-500 min-w-[170px]"
        value={currentOrg?.id ?? ""}
        onChange={onChange}
        disabled={orgsLoading || options.length === 0}
      >
        {options.length === 0 ? (
          <option value="">No orgs</option>
        ) : (
          options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))
        )}
      </select>
    </div>
  );
}