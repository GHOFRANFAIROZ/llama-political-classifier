"use client";

import { useState } from "react";

type LanguageOption = "en" | "ar";
type DateRangeOption = "24h" | "7d" | "30d" | "all";

export default function SettingsPage() {
  const [language, setLanguage] = useState<LanguageOption>("en");
  const [defaultDateRange, setDefaultDateRange] =
    useState<DateRangeOption>("7d");
  const [demoMode, setDemoMode] = useState<boolean>(true);
  const [experimental, setExperimental] = useState<boolean>(false);
  const [emailAlerts, setEmailAlerts] = useState<boolean>(true);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-purple-100">Settings</h1>
        <p className="text-purple-400 mt-2 max-w-3xl">
          Configure how Anti-Hate Monitor behaves for your workspace. These
          settings are local for now and can later be connected to a real
          account/preferences API.
        </p>
      </div>

      {/* Layout: left main settings, right info */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
        {/* Main settings */}
        <div className="space-y-6">
          {/* Language & localization */}
          <section className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)] space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-purple-100">
                Language &amp; localization
              </h2>
              <p className="text-purple-400 text-sm mt-1">
                Choose the primary interface language and default time range for
                analytics views.
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              {/* Language */}
              <div className="flex-1 space-y-2">
                <span className="text-xs text-purple-400 uppercase tracking-wide">
                  Interface language
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLanguage("en")}
                    className={`px-3 py-1.5 text-xs rounded-full border transition ${
                      language === "en"
                        ? "bg-purple-600/80 border-purple-300 text-white"
                        : "bg-black/40 border-purple-900/70 text-purple-300 hover:border-purple-500"
                    }`}
                  >
                    English (default)
                  </button>
                  <button
                    onClick={() => setLanguage("ar")}
                    className={`px-3 py-1.5 text-xs rounded-full border transition ${
                      language === "ar"
                        ? "bg-purple-600/80 border-purple-300 text-white"
                        : "bg-black/40 border-purple-900/70 text-purple-300 hover:border-purple-500"
                    }`}
                  >
                    Arabic (beta)
                  </button>
                </div>
                <p className="text-xs text-purple-500">
                  Later, this can control RTL layout and Arabic labels for
                  categories.
                </p>
              </div>

              {/* Default date range */}
              <div className="flex-1 space-y-2">
                <span className="text-xs text-purple-400 uppercase tracking-wide">
                  Default date range
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "24h", label: "Last 24h" },
                    { id: "7d", label: "Last 7 days" },
                    { id: "30d", label: "Last 30 days" },
                    { id: "all", label: "All time" },
                  ].map((range) => (
                    <button
                      key={range.id}
                      onClick={() =>
                        setDefaultDateRange(range.id as DateRangeOption)
                      }
                      className={`px-3 py-1.5 text-xs rounded-full border transition ${
                        defaultDateRange === range.id
                          ? "bg-purple-600/80 border-purple-300 text-white"
                          : "bg-black/40 border-purple-900/70 text-purple-300 hover:border-purple-500"
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-purple-500">
                  This will be used as the default range for dashboard, trends,
                  and search views.
                </p>
              </div>
            </div>
          </section>

          {/* Workspace behaviour */}
          <section className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5 shadow-[0_0_18px_rgba(176,92,255,0.25)] space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-purple-100">
                Workspace behaviour
              </h2>
              <p className="text-purple-400 text-sm mt-1">
                Control how data is displayed in this dashboard. Perfect while
                running demos or working in staging.
              </p>
            </div>

            <div className="space-y-4 text-sm">
              {/* Demo mode */}
              <ToggleRow
                label="Demo / sample data mode"
                description="When enabled, the dashboard prioritizes sample analytics instead of live production data. Useful for trainings and public demos."
                checked={demoMode}
                onChange={setDemoMode}
              />

              {/* Experimental features */}
              <ToggleRow
                label="Enable experimental features"
                description="Try upcoming analytics widgets and UX improvements before they are generally available."
                checked={experimental}
                onChange={setExperimental}
              />

              {/* Email alerts */}
              <ToggleRow
                label="Email alerts for high-severity incidents"
                description="Receive summary alerts when there is a spike in calls for violence or coordinated hate campaigns."
                checked={emailAlerts}
                onChange={setEmailAlerts}
              />
            </div>
          </section>
        </div>

        {/* Side info */}
        <aside className="space-y-4">
          <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-purple-100 mb-2">
              How settings will be stored
            </h2>
            <p className="text-sm text-purple-300">
              In a production SaaS setup, these preferences would be stored per
              user or per organization:
            </p>
            <ul className="mt-3 text-xs text-purple-400 space-y-2">
              <li>• User profile document in Firestore (per journalist).</li>
              <li>• Organization-level defaults for shared workspaces.</li>
              <li>
                • Synced across devices so the same view is loaded everywhere.
              </li>
            </ul>
          </div>

          <div className="bg-[#120F18] border border-purple-900/60 rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-purple-100 mb-2">
              Current preview state
            </h2>
            <ul className="text-xs text-purple-300 space-y-1">
              <li>
                <span className="text-purple-400">Language: </span>
                {language === "en" ? "English" : "Arabic (beta)"}
              </li>
              <li>
                <span className="text-purple-400">Default range: </span>
                {defaultDateRange === "24h"
                  ? "Last 24h"
                  : defaultDateRange === "7d"
                  ? "Last 7 days"
                  : defaultDateRange === "30d"
                  ? "Last 30 days"
                  : "All time"}
              </li>
              <li>
                <span className="text-purple-400">Demo mode: </span>
                {demoMode ? "On" : "Off"}
              </li>
              <li>
                <span className="text-purple-400">Experimental: </span>
                {experimental ? "Enabled" : "Disabled"}
              </li>
              <li>
                <span className="text-purple-400">Email alerts: </span>
                {emailAlerts ? "On" : "Off"}
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-purple-100 font-medium">{label}</div>
        <div className="text-xs text-purple-400 mt-1 max-w-md">
          {description}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          checked ? "bg-purple-500" : "bg-purple-900"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}