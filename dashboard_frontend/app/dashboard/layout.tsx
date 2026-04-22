"use client";

export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OrgProvider } from "../context/OrgContext";
import { useAuth } from "../context/AuthContext";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050411] text-white">
        <p className="text-lg text-purple-200">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <OrgProvider>
      <div className="flex min-h-screen bg-[#050411] text-white">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />

          <main className="flex-1 px-6 py-6 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </OrgProvider>
  );
}