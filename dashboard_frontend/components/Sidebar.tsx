"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartBarIcon,
  DocumentMagnifyingGlassIcon,
  HomeIcon,
  SwatchIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  Cog6ToothIcon,
  ClipboardDocumentListIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { useAuth } from "@/app/context/AuthContext";

type SidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { userProfile } = useAuth();

  const role = userProfile?.role ?? null;
  const isAdmin = role === "admin";

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
    { name: "Reports", href: "/dashboard/reports", icon: DocumentMagnifyingGlassIcon },
    { name: "Trends", href: "/dashboard/trends", icon: ChartBarIcon },
    { name: "Wordcloud", href: "/dashboard/wordcloud", icon: SwatchIcon },
    { name: "Search", href: "/dashboard/search", icon: MagnifyingGlassIcon },
    ...(isAdmin
      ? [
          { name: "Organizations", href: "/dashboard/organizations", icon: UsersIcon },
          {
            name: "Org Requests",
            href: "/dashboard/admin/org-requests",
            icon: ClipboardDocumentListIcon,
          },
        ]
      : []),
    { name: "Settings", href: "/dashboard/settings", icon: Cog6ToothIcon },
  ];

  const sidebarInner = (
    <>
      <div className="flex items-center justify-between px-6 pb-2">
        <div className="text-2xl font-bold text-purple-300 tracking-tight">
          Anti-Hate Monitor
        </div>

        <button
          type="button"
          onClick={onClose}
          className="md:hidden inline-flex items-center justify-center rounded-lg border border-purple-900/50 bg-[#120F18] p-2 text-purple-200"
          aria-label="Close navigation"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="px-6 pb-6">
        <span className="inline-flex items-center rounded-full border border-purple-700/40 bg-black/30 px-2 py-1 text-[11px] text-purple-300">
          Role:&nbsp;
          <span className="text-purple-100 font-medium">{role ?? "unknown"}</span>
        </span>
      </div>

      <nav className="flex flex-col gap-2 px-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

          const Icon = item.icon;

          return (
            <motion.div
              key={item.name}
              whileHover={{ scale: 1.02, x: 4 }}
              transition={{ type: "spring", stiffness: 250, damping: 18 }}
            >
              <Link
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                  ${
                    isActive
                      ? "bg-purple-700/40 text-white shadow-[0_0_18px_rgba(176,92,255,0.55)] border border-purple-600/40"
                      : "text-purple-300/70 hover:bg-purple-900/30 hover:text-purple-200 hover:shadow-[0_0_15px_rgba(176,92,255,0.35)]"
                  }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-30 w-64 bg-[#0A0A0F]/95 backdrop-blur-md border-r border-purple-900/30 flex-col py-6 shadow-[0_0_25px_rgba(138,43,226,0.25)] overflow-y-auto">
        {sidebarInner}
      </aside>

      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[#0A0A0F]/98 backdrop-blur-md border-r border-purple-900/30 py-6 shadow-[0_0_25px_rgba(138,43,226,0.25)] overflow-y-auto transform transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarInner}
      </aside>
    </>
  );
}