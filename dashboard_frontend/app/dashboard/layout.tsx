"use client";

import type { ReactNode } from "react";
import { OrgProvider } from "../context/OrgContext";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <div className="flex min-h-screen bg-[#050411] text-white">
        {/* ✅ Left Sidebar */}
        <Sidebar />

        {/* ✅ Right content */}
        <div className="flex-1 flex flex-col min-w-0">
          <Navbar />

          {/* Content area scroll */}
          <main className="flex-1 px-6 py-6 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </OrgProvider>
  );
}