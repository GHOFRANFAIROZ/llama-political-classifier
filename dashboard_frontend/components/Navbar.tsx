"use client";

import {
  BellIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  Bars3Icon,
} from "@heroicons/react/24/outline";
import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  ChangeEvent,
  KeyboardEvent,
} from "react";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useOrg } from "@/app/context/OrgContext";
import { useAuth } from "@/app/context/AuthContext";
import { auth } from "@/lib/firebase";

type SuggestItem = { text: string; source: "firestore" | "recent" | "search" };

type NavbarProps = {
  onOpenSidebar: () => void;
};

function NavbarContent({ onOpenSidebar }: NavbarProps) {
  const [open, setOpen] = useState(false);

  const [searchValue, setSearchValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loadingSug, setLoadingSug] = useState(false);
  const [remoteSug, setRemoteSug] = useState<{ text: string }[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const router = useRouter();
  const pathname = usePathname();

  const { user, userProfile } = useAuth();
  const role = userProfile?.role ?? null;
  const isAdmin = role === "admin";

  const { currentOrg, orgs, setCurrentOrg, orgsLoading, orgsSource, orgsError } =
    useOrg();

  const searchRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scope = currentOrg ? "org" : "public";
  const orgId = currentOrg?.id || "";

  const suggestCacheRef = useRef<
    Map<string, { ts: number; suggestions: { text: string }[] }>
  >(new Map());
  const SUGGEST_TTL_MS = 60_000;

  const RECENT_KEY = "ahm_recent_searches_v1";

  function loadRecent(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, 5) : [];
    } catch {
      return [];
    }
  }

  function saveRecent(nextQ: string) {
    const cleaned = nextQ.trim();
    if (!cleaned) return;

    const prev = loadRecent();
    const lower = cleaned.toLowerCase();
    const merged = [cleaned, ...prev.filter((x) => x.toLowerCase() !== lower)].slice(
      0,
      5
    );

    localStorage.setItem(RECENT_KEY, JSON.stringify(merged));
    setRecent(merged);
  }

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const handleOrgChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const org = orgs.find((o) => o.id === e.target.value);
    if (!org) return;

    setCurrentOrg(org);

    const isOrgDashboardRoute =
      pathname?.startsWith("/dashboard/organizations/") &&
      pathname !== "/dashboard/organizations";

    if (isOrgDashboardRoute) {
      const slug = org.slug || org.id.replaceAll("_", "-");
      router.push(`/dashboard/organizations/${slug}`);
    }
  };

  useEffect(() => {
    const qq = searchValue.trim();
    if (qq.length < 2) {
      setRemoteSug([]);
      setActiveIdx(-1);
      setLoadingSug(false);
      return;
    }

    const key = `${scope}::${orgId}::${qq.toLowerCase()}`;
    const now = Date.now();

    const cached = suggestCacheRef.current.get(key);
    if (cached && now - cached.ts < SUGGEST_TTL_MS) {
      setRemoteSug(cached.suggestions);
      return;
    }

    const controller = new AbortController();

    const t = setTimeout(async () => {
      try {
        setLoadingSug(true);

        const url = new URL("/api/suggest", window.location.origin);
        url.searchParams.set("q", qq);
        url.searchParams.set("scope", scope);
        if (scope === "org" && orgId) {
          url.searchParams.set("orgId", orgId);
        }

        const resp = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await resp.json();

        const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
        const normalized: { text: string }[] = suggestions
          .map((s: unknown) => {
            const text =
              typeof s === "object" && s !== null && "text" in s
                ? String((s as { text?: unknown }).text ?? "")
                : "";
            return { text };
          })
          .filter((x: { text: string }) => x.text.length > 0);

        setRemoteSug(normalized);
        suggestCacheRef.current.set(key, {
          ts: Date.now(),
          suggestions: normalized,
        });
      } catch (e: unknown) {
        if (!(e instanceof Error && e.name === "AbortError")) {
          setRemoteSug([]);
        }
      } finally {
        setLoadingSug(false);
      }
    }, 140);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [searchValue, scope, orgId]);

  const mergedSuggestions: SuggestItem[] = useMemo(() => {
    const q = searchValue.trim();
    const ql = q.toLowerCase();

    const base: SuggestItem[] = q.length > 0 ? [{ text: q, source: "search" }] : [];

    const remoteTop: SuggestItem[] = remoteSug
      .slice(0, 3)
      .map((s) => ({ text: s.text, source: "firestore" }));

    const useRecent = remoteTop.length < 3;

    const recentTop: SuggestItem[] = !useRecent
      ? []
      : q.length < 2
      ? recent.slice(0, 2).map((text) => ({ text, source: "recent" as const }))
      : recent
          .filter((x) => x.toLowerCase().includes(ql))
          .slice(0, 2)
          .map((text) => ({ text, source: "recent" as const }));

    const seen = new Set<string>();
    const out: SuggestItem[] = [];

    for (const s of [...base, ...remoteTop, ...recentTop]) {
      const key = s.text.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }

    return out;
  }, [searchValue, recent, remoteSug]);

  function renderHighlighted(text: string, query: string) {
    const q = query.trim();
    if (!q) return text;

    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;

    const before = text.slice(0, idx);
    const mid = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);

    return (
      <>
        {before}
        <span className="font-semibold text-purple-100">{mid}</span>
        {after}
      </>
    );
  }

  const triggerSearch = (override?: string) => {
    const q = (override ?? searchValue).trim();
    if (!q) return;

    saveRecent(q);

    const encoded = encodeURIComponent(q);
    router.push(`/dashboard/search?q=${encoded}&scope=${scope}`);

    setShowSuggestions(false);
    setActiveIdx(-1);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowSuggestions(false);
      setActiveIdx(-1);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!showSuggestions) setShowSuggestions(true);
      if (mergedSuggestions.length === 0) return;
      setActiveIdx((i) => (i + 1) % mergedSuggestions.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!showSuggestions) setShowSuggestions(true);
      if (mergedSuggestions.length === 0) return;
      setActiveIdx((i) => (i - 1 + mergedSuggestions.length) % mergedSuggestions.length);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const picked = activeIdx >= 0 ? mergedSuggestions[activeIdx]?.text : searchValue;
      triggerSearch(picked);
    }
  };

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;

      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowSuggestions(false);
        setActiveIdx(-1);
      }

      if (menuRef.current && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-full overflow-x-hidden border-b border-purple-900/40 bg-[#0C0A12]/80 backdrop-blur-xl px-3 py-3 sm:px-4 lg:px-6 shadow-[0_0_25px_rgba(138,43,226,0.25)]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 overflow-hidden">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="md:hidden inline-flex items-center justify-center rounded-lg border border-purple-900/50 bg-[#120F18] p-2 text-purple-200 shrink-0"
              aria-label="Open navigation"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            <div className="min-w-0 flex items-center gap-3 overflow-hidden">
              <span className="hidden sm:inline text-purple-400 animate-pulse shrink-0">●</span>

              <span className="truncate text-lg sm:text-xl font-semibold tracking-tight text-purple-200">
                Anti-Hate Monitor
              </span>

              {currentOrg && (
                <span className="hidden xl:inline-flex max-w-[180px] truncate text-xs font-normal text-purple-400 px-2 py-0.5 rounded-full border border-purple-700/60 bg-black/30">
                  Workspace:&nbsp;
                  <span className="truncate text-purple-100">{currentOrg.name}</span>
                </span>
              )}

              <span className="hidden lg:inline text-[10px] text-purple-500 border border-purple-900/50 bg-black/20 px-2 py-0.5 rounded-full shrink-0">
                {isAdmin ? "Admin" : role === "org_user" ? "Org User" : "Unknown"}
              </span>

              <span className="hidden 2xl:inline text-[10px] text-purple-500 border border-purple-900/50 bg-black/20 px-2 py-0.5 rounded-full shrink-0">
                {orgsLoading ? "Loading orgs…" : orgsSource === "api" ? "API" : "Fallback"}
              </span>
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-2" ref={menuRef}>
            <motion.button
              whileHover={{ scale: 1.08 }}
              type="button"
              className="p-2 rounded-lg hover:bg-purple-900/40 transition shadow-[0_0_12px_rgba(176,92,255,0.35)]"
            >
              <BellIcon className="w-5 h-5 sm:w-6 sm:h-6 text-purple-300" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-purple-900/40 transition"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-purple-800 border border-purple-600 shadow-inner" />
              <ChevronDownIcon className="w-4 h-4 text-purple-400" />
            </motion.button>

            {open && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute right-0 top-14 z-50 bg-[#120F18] border border-purple-900/40 rounded-xl p-3 w-56 shadow-xl"
              >
                <p className="text-purple-300 text-xs mb-2 break-all">
                  {user?.email ?? "Signed in user"}
                </p>

                <button
                  type="button"
                  className="block w-full text-left text-purple-200 text-sm hover:text-white py-1"
                >
                  Profile
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push("/dashboard/settings");
                  }}
                  className="block w-full text-left text-purple-200 text-sm hover:text-white py-1"
                >
                  Settings
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-left w-full text-red-400 text-sm hover:text-red-300 py-1"
                >
                  Logout
                </button>
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative min-w-0 flex-1" ref={searchRef}>
            <input
              ref={inputRef}
              type="text"
              placeholder={scope === "org" ? "Search inside org..." : "Search public..."}
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                setShowSuggestions(true);
                setActiveIdx(-1);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={onSearchKey}
              className="w-full bg-[#120F18] border border-purple-900/40 rounded-xl px-4 py-2.5 text-sm text-purple-200 placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
            />

            <MagnifyingGlassIcon
              className="w-5 h-5 text-purple-400 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer hover:text-purple-300 transition"
              onClick={() => triggerSearch()}
            />

            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-purple-900/40 bg-[#0F0C16] shadow-[0_0_25px_rgba(138,43,226,0.18)]">
                {loadingSug && (
                  <div className="px-4 py-3 space-y-2">
                    <div className="h-3 rounded bg-purple-900/30 animate-pulse" />
                    <div className="h-3 rounded bg-purple-900/20 animate-pulse" />
                  </div>
                )}

                {!loadingSug && mergedSuggestions.length === 0 && (
                  <div className="px-4 py-3 text-sm text-purple-400/80">
                    No suggestions — press{" "}
                    <span className="text-purple-200 font-semibold">Enter</span> to search.
                  </div>
                )}

                {!loadingSug &&
                  mergedSuggestions.map((s, idx) => (
                    <button
                      key={`${s.source}-${s.text}-${idx}`}
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => triggerSearch(s.text)}
                      className={[
                        "flex w-full items-center justify-between px-4 py-2 text-left text-sm transition",
                        idx === activeIdx
                          ? "bg-purple-900/30"
                          : "bg-transparent hover:bg-purple-900/20",
                      ].join(" ")}
                    >
                      <span className="truncate text-purple-200">
                        {s.source === "search" ? (
                          <>
                            <span className="text-purple-400 mr-2">Search for</span>
                            {renderHighlighted(s.text, searchValue)}
                          </>
                        ) : (
                          renderHighlighted(s.text, searchValue)
                        )}
                      </span>

                      <span className="ml-3 shrink-0 text-[10px] text-purple-400/70 border border-purple-900/40 bg-black/20 px-2 py-0.5 rounded-full">
                        {s.source === "recent"
                          ? "Recent"
                          : s.source === "search"
                          ? "Enter"
                          : "Suggest"}
                      </span>
                    </button>
                  ))}

                <div className="px-4 py-2 text-[10px] text-purple-500/80 border-t border-purple-900/30">
                  ↑↓ to navigate • Enter to search • Esc to close
                </div>
              </div>
            )}
          </div>

          {isAdmin ? (
            <div className="w-full lg:w-64 shrink-0">
              <span className="block text-[10px] uppercase tracking-wide text-purple-500 mb-1">
                Organization
              </span>

              <select
                value={currentOrg?.id ?? ""}
                onChange={handleOrgChange}
                disabled={orgsLoading || orgs.length === 0}
                className="w-full bg-[#120F18] border border-purple-900/60 rounded-lg px-3 py-2.5 text-xs text-purple-100 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60"
              >
                {orgs.length === 0 ? (
                  <option value="">No orgs</option>
                ) : (
                  orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {org.plan ? `(${org.plan})` : ""}
                    </option>
                  ))
                )}
              </select>

              {orgsError && (
                <span className="mt-1 block text-[10px] text-red-400">{orgsError}</span>
              )}
            </div>
          ) : (
            <div className="w-full lg:w-64 shrink-0">
              <span className="block text-[10px] uppercase tracking-wide text-purple-500 mb-1">
                Organization
              </span>
              <div className="w-full truncate bg-[#120F18] border border-purple-900/60 rounded-lg px-3 py-2.5 text-xs text-purple-100">
                {currentOrg?.name || userProfile?.org_id || "Assigned org"}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Navbar({ onOpenSidebar }: NavbarProps) {
  return (
    <Suspense
      fallback={<div className="w-full h-20 border-b border-purple-900/40 bg-[#0C0A12]/80" />}
    >
      <NavbarContent onOpenSidebar={onOpenSidebar} />
    </Suspense>
  );
}