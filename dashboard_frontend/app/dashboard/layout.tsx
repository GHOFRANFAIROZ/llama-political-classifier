"use client";

export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
    <div className="min-h-screen flex items-center justify-center bg-[#050411] text-white px-6">
      <div className="max-w-lg w-full rounded-2xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-2xl font-bold mb-3">{title}</h1>
        <p className="text-sm text-gray-300">{message}</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, userProfile, loading, profileLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050411] text-white">
        <p className="text-lg text-purple-200">Loading dashboard...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!userProfile) {
    return (
      <CenterMessage
        title="Account not provisioned yet"
        message="Your account exists in Firebase Auth, but no user profile was found in Firestore under users/{uid}. Create the profile first, then refresh."
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
      <div className="flex min-h-screen bg-[#050411] text-white">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />

          <main className="flex-1 px-6 py-6 overflow-y-auto">{children}</main>
        </div>
      </div>
    </OrgProvider>
  );
}