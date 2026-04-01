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
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
    { name: "Reports", href: "/dashboard/reports", icon: DocumentMagnifyingGlassIcon },
    { name: "Trends", href: "/dashboard/trends", icon: ChartBarIcon },
    { name: "Wordcloud", href: "/dashboard/wordcloud", icon: SwatchIcon },
    { name: "Search", href: "/dashboard/search", icon: MagnifyingGlassIcon },
    { name: "Organizations", href: "/dashboard/organizations", icon: UsersIcon },
    { name: "Settings", href: "/dashboard/settings", icon: Cog6ToothIcon },
  ];

  return (
    <aside className="w-64 h-screen bg-[#0A0A0F]/95 backdrop-blur-md border-r border-purple-900/30 flex flex-col py-6 shadow-[0_0_25px_rgba(138,43,226,0.25)]">

      <div className="px-6 pb-6 text-2xl font-bold text-purple-300 tracking-tight">
        Anti-Hate Monitor
      </div>

      <nav className="flex flex-col gap-2 px-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <motion.div
              key={item.name}
              whileHover={{ scale: 1.05, x: 6 }}
              transition={{ type: "spring", stiffness: 250, damping: 18 }}
            >
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all
                  ${isActive
                    ? "bg-purple-700/40 text-white shadow-[0_0_18px_rgba(176,92,255,0.55)] border border-purple-600/40"
                    : "text-purple-300/60 hover:bg-purple-900/30 hover:text-purple-200 hover:shadow-[0_0_15px_rgba(176,92,255,0.35)]"
                  }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>
    </aside>
  );
}