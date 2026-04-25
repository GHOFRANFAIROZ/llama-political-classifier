"use client";

export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { OrgProvider } from "../context/OrgContext";
import { useAuth } from "../context/AuthContext";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

function CenterMessage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050411] text-white px-4 sm:px-6">
      <div className="max-w-lg w-full rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
        <h1 className="text-2xl font-bold mb-3">{title}</h1>
        <p className="text-sm text-gray-300 leading-6">{message}</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, userProfile, loading, profileLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const needsRequestAccess =
    !!user &&
    (!userProfile ||
      (userProfile.status === "active" &&
        userProfile.role === "org_user" &&
        !userProfile.org_id));

  useEffect(() => {
    if (loading || profileLoading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (needsRequestAccess && pathname !== "/request-access") {
      router.replace("/request-access");
    }
  }, [
    user,
    userProfile,
    loading,
    profileLoading,
    needsRequestAccess,
    pathname,
    router,
  ]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileSidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileSidebarOpen]);

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050411] text-white px-4">
        <p className="text-base sm:text-lg text-purple-200">Loading dashboard...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (needsRequestAccess) {
    return (
      <CenterMessage
        title="No workspace assigned yet"
        message="Redirecting you to the access request page..."
      />
    );
  }

  if (!userProfile) {
    return (
      <CenterMessage
        title="Account not provisioned yet"
        message="Your account exists in Firebase Auth, but no user profile was found yet. You can request access from the request-access page."
      />
    );
  }

  if (userProfile.status !== "active") {
    return (
      <CenterMessage
        title="Account inactive"
        message="Your account is not active right now. Contact the administrator."
      />
    );
  }

  return (
    <OrgProvider>
      <div className="min-h-screen bg-[#050411] text-white">
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />

        <div className="min-h-screen min-w-0 md:ml-64 flex flex-col">
          <Navbar onOpenSidebar={() => setMobileSidebarOpen(true)} />

          <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </OrgProvider>
  );
}