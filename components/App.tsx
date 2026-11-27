"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  Loader2,
  ScanSearch,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AtsAnalysisRecord,
  AppSettings,
  JobDescription,
  KeywordAnalysis,
  LinkedInExportSnapshot,
  Profile,
  ProfileImportPreview,
  ProfileSource,
  StoredProfile,
  TitlesPayload,
} from "@/lib/types";
import { serverStore } from "@/lib/store/server";
import type { AppStore } from "@/lib/store/contract";
import Overview from "./Overview";
import ProfileWorkspace from "./ProfileWorkspace";
import JobManager from "./JobManager";
import TitleRecommendations from "./TitleRecommendations";
import AtsPanel from "./AtsPanel";
import SettingsPanel from "./SettingsPanel";

type Section = "overview" | "profile" | "jobs" | "titles" | "ats" | "settings";

const NAV: { id: Section; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, hint: "Your workspace" },
  { id: "profile", label: "Profile", icon: FileText, hint: "Working profile" },
  { id: "jobs", label: "Job descriptions", icon: BriefcaseBusiness, hint: "Paste & analyze" },
  { id: "titles", label: "Job titles", icon: Search, hint: "Discover target roles" },
  { id: "ats", label: "ATS check", icon: ScanSearch, hint: "Score + LinkedIn" },
  { id: "settings", label: "Settings", icon: SettingsIcon, hint: "AI & sources" },
];

export default function App({ store = serverStore }: { store?: AppStore }) {
  const [section, setSection] = useState<Section>("overview");
  const [profiles, setProfiles] = useState<Record<string, StoredProfile | null>>({});
  const [jobs, setJobs] = useState<JobDescription[]>([]);
  const [analyses, setAnalyses] = useState<AtsAnalysisRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [titles, setTitles] = useState<TitlesPayload | null>(null);
  const [linkedin, setLinkedin] = useState<LinkedInExportSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadAll = useCallback(async () => {
    try {
      const snapshot = await store.loadAll();
      setProfiles(snapshot.profiles);
      setJobs(snapshot.jobs);
      setAnalyses(snapshot.analyses);
      setSettings(snapshot.settings);
      setTitles(snapshot.titles);
      setLinkedin(snapshot.linkedin);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load local data.", true);
    } finally {
      setLoading(false);
    }
  }, [notify, store]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function importProfile(files: File[], text: string): Promise<ProfileImportPreview | null> {
    setBusy("profile");
    try {
      const preview = await store.importProfile(files, text);
      await loadAll();
      const counts = Object.values(preview.summary.detected).reduce((sum, value) => sum + value, 0);
      notify(`Profile imported. ${counts.toLocaleString()} LinkedIn rows parsed.`);
      return preview;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Import failed.", true);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function clearLinkedInExport() {
    setBusy("linkedin-clear");
    try {
      await store.clearLinkedInExport();
      await loadAll();
      notify("Stored LinkedIn export deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not clear LinkedIn data.", true);
    } finally {
      setBusy(null);
    }
  }

  async function applyIntent(next: AppSettings) {
    await saveAppSettings(next);
  }

  async function saveActiveProfile(profile: Profile) {
    setBusy("profile");
    try {
      await store.saveActiveProfile(profile);
      await loadAll();
      notify("Profile saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Save failed.", true);
    } finally {
      setBusy(null);
    }
  }

  async function resetProfile(source: ProfileSource) {
    setBusy("reset");
    try {
      await store.resetProfile(source);
      await loadAll();
      notify(`Working profile reset from ${source}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Reset failed.", true);
    } finally {
      setBusy(null);
    }
  }

  async function addJob(title: string, company: string, rawText: string) {
    setBusy("job");
    try {
      const job = await store.addJob(title, company, rawText);
      await loadAll();
      notify("Job description saved.");
      return job;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save job.", true);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function removeJob(id: string) {
    setBusy("job");
    try {
      await store.removeJob(id);
      await loadAll();
      notify("Job description removed.");
    } finally {
      setBusy(null);
    }
  }

  async function clearJobs() {
    setBusy("job");
    try {
      await store.clearJobs();
      await loadAll();
      notify("All job descriptions and their ATS checks were deleted.");
    } finally {
      setBusy(null);
    }
  }

  async function removeAnalysis(id: string) {
    setBusy("analysis");
    try {
      await store.removeAnalysis(id);
      await loadAll();
      notify("ATS check deleted.");
    } finally {
      setBusy(null);
    }
  }

  async function clearAnalyses() {
    setBusy("analysis");
    try {
      await store.clearAnalyses();
      await loadAll();
      notify("All ATS checks were deleted.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshTitles() {
    setBusy("titles");
    try {
      const data = await store.refreshTitles();
      setTitles(data);
      notify(
        store.mode === "local"
          ? "Title suggestions rebuilt from saved job descriptions."
          : "Job titles refreshed from public sources.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not refresh job titles.", true);
    } finally {
      setBusy(null);
    }
  }

  async function clearTitles() {
    setBusy("titles-clear");
    try {
      const data = await store.clearTitles();
      setTitles(data);
      notify("Cached job titles and refresh history deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not clear cached titles.", true);
    } finally {
      setBusy(null);
    }
  }

  async function runAnalysis(jobId: string, source: ProfileSource) {
    setBusy("ats");
    try {
      const record = await store.runAnalysis(jobId, source);
      setAnalyses((prev) => [record, ...prev]);
      notify("ATS analysis complete.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Analysis failed.", true);
    } finally {
      setBusy(null);
    }
  }

  async function analyzeKeywords(rawText: string, source: ProfileSource): Promise<KeywordAnalysis> {
    return store.analyzeKeywords(rawText, source);
  }

  async function saveAppSettings(next: AppSettings) {
    setBusy("settings");
    try {
      const saved = await store.saveSettings(next);
      setSettings(saved);
      await loadAll();
      notify("Settings saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save settings.", true);
    } finally {
      setBusy(null);
    }
  }

  async function requestUpdate(): Promise<{ output: string }> {
    const response = await fetch("/api/update", { method: "POST" });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Could not check for updates.");
    }
    return { output: String(data.output ?? "") };
  }

  const profileReady = Boolean(profiles.active?.profile?.name || profiles.active?.profile?.experience?.length);

  return (
    <div className="flex min-h-screen bg-ink-950">
      <aside className="sticky top-0 hidden h-screen w-[252px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/70 px-4 py-6 lg:flex">
        <div className="mb-9 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-glow">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">Job Search Suite</p>
            <p className="text-[11px] text-slate-500">Local workspace</p>
          </div>
        </div>

        <nav className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  active
                    ? "bg-accent-500/10 text-accent-400 ring-1 ring-inset ring-accent-500/20"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-[11px] opacity-60">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</p>
          <div className="mt-2.5 space-y-2 text-xs">
            <StatusRow ok={profileReady} label="Working profile" />
            <StatusRow ok={Boolean(profiles.imported)} label="Imported snapshot" />
            <StatusRow ok={Boolean(linkedin)} label={`LinkedIn CSVs (${linkedin?.tableCount ?? 0})`} />
            <StatusRow ok={jobs.length > 0} label={`Job descriptions (${jobs.length})`} />
            <StatusRow ok={Boolean(titles?.totalListings)} label={`Cached listings (${titles?.totalListings ?? 0})`} />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="border-b border-white/[0.06] bg-ink-900/40 px-5 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Job Search Suite</p>
            {busy && <Loader2 className="h-4 w-4 animate-spin text-accent-400" />}
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                  section === item.id ? "bg-accent-500/15 text-accent-400" : "text-slate-400"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 lg:py-10">
          {loading || !settings ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-accent-400" />
            </div>
          ) : (
            <div className="fade-up" key={section}>
              {section === "overview" && (
                <Overview
                  profiles={profiles}
                  jobs={jobs}
                  analyses={analyses}
                  settings={settings}
                  linkedin={linkedin}
                  busy={busy}
                  onImport={async (files, text) => { await importProfile(files, text); }}
                  onNavigate={setSection}
                />
              )}
              {section === "profile" && (
                <ProfileWorkspace
                  profiles={profiles}
                  busy={busy}
                  onSave={saveActiveProfile}
                  onReset={resetProfile}
                />
              )}
              {section === "jobs" && (
                <JobManager
                  jobs={jobs}
                  profiles={profiles}
                  busy={busy}
                  onAdd={addJob}
                  onDelete={removeJob}
                  onClearJobs={clearJobs}
                  onSaveProfile={saveActiveProfile}
                  onAnalyzeKeywords={analyzeKeywords}
                  onAnalyze={(jobId) => {
                    setSection("ats");
                    void runAnalysis(jobId, "active");
                  }}
                  onNavigateTitles={() => setSection("titles")}
                  pdfPageMode={settings.pdfPageMode}
                  onPdfPageModeChange={(mode) => void saveAppSettings({ ...settings, pdfPageMode: mode })}
                />
              )}
              {section === "titles" && settings && (
                <TitleRecommendations
                  data={titles}
                  profiles={profiles}
                  busy={busy}
                  onRefresh={refreshTitles}
                  onClear={clearTitles}
                  onNavigateSettings={() => setSection("settings")}
                  onNavigateProfile={() => setSection("profile")}
                  onNavigateJobs={() => setSection("jobs")}
                  staticMode={store.mode === "local"}
                />
              )}
              {section === "ats" && (
                <AtsPanel
                  jobs={jobs}
                  analyses={analyses}
                  profiles={profiles}
                  settings={settings}
                  linkedin={linkedin}
                  busy={busy}
                  onAnalyze={runAnalysis}
                  onDeleteAnalysis={removeAnalysis}
                  onClearAnalyses={clearAnalyses}
                  onNavigateJobs={() => setSection("jobs")}
                  onNavigateProfile={() => setSection("profile")}
                  onImportProfile={async (files, text) => { await importProfile(files, text); }}
                  onClearLinkedIn={clearLinkedInExport}
                  onApplyIntent={applyIntent}
                />
              )}
              {section === "settings" && (
                <SettingsPanel
                  settings={settings}
                  busy={busy}
                  onSave={saveAppSettings}
                  staticMode={store.mode === "local"}
                  onUpdate={store.mode === "local" ? undefined : requestUpdate}
                  onExportBackup={
                    store.exportBackup
                      ? async () => {
                          const json = await store.exportBackup!();
                          const blob = new Blob([json], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = `job-search-suite-backup-${new Date().toISOString().slice(0, 10)}.json`;
                          link.click();
                          URL.revokeObjectURL(url);
                        }
                      : undefined
                  }
                  onImportBackup={
                    store.importBackup
                      ? async (json) => {
                          await store.importBackup!(json);
                          await loadAll();
                        }
                      : undefined
                  }
                  onClearLocalData={
                    store.clearLocalData
                      ? async () => {
                          await store.clearLocalData!();
                          await loadAll();
                        }
                      : undefined
                  }
                />
              )}
            </div>
          )}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-white/10 bg-ink-800 px-4 py-3 shadow-2xl">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${toast.error ? "bg-rose-400" : "bg-mint-400"}`} />
          <p className="text-sm text-slate-200">{toast.text}</p>
          <button onClick={() => setToast(null)} className="text-slate-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-mint-400" : "bg-slate-600"}`} />
      <span className={ok ? "text-slate-300" : "text-slate-500"}>{label}</span>
    </div>
  );
}
