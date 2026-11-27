"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  ExternalLink,
  FileText,
  Linkedin,
  Link2,
  Loader2,
  ScanSearch,
  UploadCloud,
} from "lucide-react";
import type {
  AppSettings,
  AtsAnalysisRecord,
  JobDescription,
  LinkedInExportSnapshot,
  StoredProfile,
} from "@/lib/types";
import { Card, EmptyState, SectionHeader, Stat } from "./ui";

type Props = {
  profiles: Record<string, StoredProfile | null>;
  jobs: JobDescription[];
  analyses: AtsAnalysisRecord[];
  settings: AppSettings | null;
  linkedin: LinkedInExportSnapshot | null;
  busy: string | null;
  onImport: (files: File[], text: string) => Promise<void>;
  onNavigate: (section: "overview" | "profile" | "jobs" | "titles" | "ats" | "settings") => void;
};

export default function Overview({ profiles, jobs, analyses, settings, linkedin, busy, onImport, onNavigate }: Props) {
  const latest = analyses[0];
  const profileReady = Boolean(profiles.active?.profile?.name || profiles.active?.profile?.experience?.length);
  const importedLinkedIn = profiles.active?.profile.links.find((link) => /linkedin/i.test(link.url || link.label));
  const linkedinUrl = safeExternalUrl(settings?.profileLinks?.linkedin || importedLinkedIn?.url || "");
  const indeedUrl = safeExternalUrl(settings?.profileLinks?.indeed || "");

  return (
    <>
      <SectionHeader
        eyebrow="Welcome back"
        title="Your job search workspace"
        description="Import your resume and LinkedIn data together, score the result against a job description, and explore your LinkedIn export in the dashboard under ATS Check. Everything stays on this machine."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Profile data" value={profileReady ? "Ready" : "Missing"} hint={profiles.active?.filename || "Import a resume or export"} tone={profileReady ? "good" : "warn"} />
        <Stat label="LinkedIn CSVs" value={linkedin?.tableCount ?? 0} hint={linkedin ? `${linkedin.rowCount.toLocaleString()} rows` : "Export not loaded"} tone={linkedin ? "good" : "default"} />
        <Stat label="Job descriptions" value={jobs.length} hint="Saved ATS targets" />
        <Stat label="Latest ATS score" value={latest ? `${latest.result.overall}` : "—"} hint={latest?.jobTitle ?? "No analysis yet"} tone={latest ? (latest.result.overall >= 70 ? "good" : "warn") : "default"} />
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <ImportCard
          profiles={profiles}
          busy={busy === "profile"}
          onImport={onImport}
          onOpenDashboard={() => onNavigate("ats")}
        />

        <Card className="relative overflow-hidden p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-400">LinkedIn Dashboard</p>
            <h2 className="mt-3 text-lg font-semibold text-white">Turn your export into signals</h2>
            <p className="muted mt-2 text-sm">
              Search queries, saved alerts, connections, follows, learning, screening answers, and every raw CSV are
              available in a local dashboard under ATS Check.
            </p>
            <div className="mt-5 space-y-2 text-xs text-slate-400">
              <p className="flex items-center gap-2"><Linkedin className="h-3.5 w-3.5 text-slate-500" /> Career intent analyzer with apply-to-search controls</p>
              <p className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-slate-500" /> One editable working profile, with an imported snapshot for reset</p>
              <p className="flex items-center gap-2"><ScanSearch className="h-3.5 w-3.5 text-slate-500" /> Sensitive CSVs masked by default and excluded from insights</p>
            </div>
            <button onClick={() => onNavigate("ats")} className="btn-primary mt-5">
              Open LinkedIn Dashboard <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Link2 className="h-4 w-4 text-accent-400" /> Your profile shortcuts</h2>
            <p className="muted mt-1 text-xs">Open your profiles directly. Edit the URLs in Settings.</p>
          </div>
          <button onClick={() => onNavigate("settings")} className="btn-ghost px-3 py-1.5 text-[11px]">
            Edit links
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {linkedinUrl ? (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 transition hover:border-accent-500/25 hover:bg-accent-500/[0.05]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0a66c2]/15 text-[#60a5fa]"><Linkedin className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-slate-100">LinkedIn profile</span>
                <span className="block truncate text-[11px] text-slate-500">{linkedinUrl}</span>
              </span>
              <ExternalLink className="h-4 w-4 text-slate-600 group-hover:text-accent-400" />
            </a>
          ) : (
            <button
              onClick={() => onNavigate("settings")}
              className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 px-4 py-3.5 text-left transition hover:border-accent-500/30"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-slate-500"><Linkedin className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-slate-300">Add LinkedIn URL</span>
                <span className="block text-[11px] text-slate-500">Saved locally in Settings</span>
              </span>
            </button>
          )}

          {indeedUrl ? (
            <a
              href={indeedUrl}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 transition hover:border-accent-500/25 hover:bg-accent-500/[0.05]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sm font-bold text-sky-400">in</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-slate-100">Indeed profile</span>
                <span className="block truncate text-[11px] text-slate-500">{indeedUrl}</span>
              </span>
              <ExternalLink className="h-4 w-4 text-slate-600 group-hover:text-accent-400" />
            </a>
          ) : (
            <button
              onClick={() => onNavigate("settings")}
              className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 px-4 py-3.5 text-left transition hover:border-accent-500/30"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-xs font-bold text-slate-500">in</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-slate-300">Add Indeed URL</span>
                <span className="block text-[11px] text-slate-500">Saved locally in Settings</span>
              </span>
            </button>
          )}
        </div>
      </Card>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent ATS results</h2>
            <button onClick={() => onNavigate("ats")} className="text-xs font-medium text-accent-400 hover:text-accent-300">
              View all →
            </button>
          </div>
          {analyses.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                icon={<ScanSearch className="h-5 w-5" />}
                title="No analyses yet"
                description="Add a job description, run an ATS check, and your score breakdown will appear here."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-2.5">
              {analyses.slice(0, 4).map((a) => (
                <div key={a.id} className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                    style={{
                      color: a.result.overall >= 70 ? "#6ee7b7" : a.result.overall >= 50 ? "#fcd34d" : "#fda4af",
                      background: "rgba(255,255,255,0.05)",
                    }}
                  >
                    {a.result.overall}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">{a.jobTitle}</p>
                    <p className="text-xs text-slate-500">
                      {a.result.source} profile · {a.result.missingKeywords.length} keyword gaps
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-400">Next step</p>
          <h2 className="mt-3 text-lg font-semibold text-white">Run your first ATS check</h2>
          <p className="muted mt-2">
            {!profileReady
              ? "Import a resume or LinkedIn export to build your working profile first."
              : jobs.length === 0
                ? "Add the job description you are targeting."
                : "Pick a job description and see where you stand."}
          </p>
          <button
            onClick={() => onNavigate(!profileReady ? "profile" : jobs.length === 0 ? "jobs" : "ats")}
            className="btn-primary mt-5"
          >
            {!profileReady ? "Open profile" : jobs.length === 0 ? "Add a job" : "Run ATS check"}
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="mt-6 space-y-2 border-t border-white/[0.06] pt-5 text-xs text-slate-400">
            <p className="flex items-center gap-2"><BriefcaseBusiness className="h-3.5 w-3.5 text-slate-500" /> Paste a job description for live keyword gaps</p>
            <p className="flex items-center gap-2"><UploadCloud className="h-3.5 w-3.5 text-slate-500" /> Local storage — no account needed</p>
          </div>
        </Card>
      </div>
    </>
  );
}

function safeExternalUrl(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function ImportCard({
  profiles,
  busy,
  onImport,
  onOpenDashboard,
}: {
  profiles: Record<string, StoredProfile | null>;
  busy: boolean;
  onImport: (files: File[], text: string) => Promise<void>;
  onOpenDashboard: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"file" | "text">("file");

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) await onImport(files, text);
  }

  const ready = Boolean(profiles.active || profiles.imported);

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-accent-400">
          <UploadCloud className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">Import your profile data</h2>
            {ready && <span className="chip border-mint-500/20 bg-mint-500/10 text-mint-400">Ready</span>}
          </div>
          <p className="muted mt-1.5 text-[13px]">
            One import builds your working profile, an imported snapshot, and the LinkedIn Dashboard. Add a resume file,
            a LinkedIn ZIP/folder, or multiple CSV files — any combination works.
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => setMode("file")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${mode === "file" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
        >
          Files or ZIP
        </button>
        <button
          onClick={() => setMode("text")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${mode === "text" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
        >
          Paste text
        </button>
      </div>

      {mode === "file" ? (
        <div className="mt-5">
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Choose files
            </button>
            <button className="btn-ghost text-xs" disabled={busy} onClick={() => folderRef.current?.click()}>
              <Linkedin className="h-4 w-4" /> Choose folder
            </button>
          </div>
          <input ref={fileRef} type="file" multiple accept=".zip,.csv,.pdf,.docx,.txt,.md,.json" className="hidden" onChange={(event) => void handleFiles(event)} />
          <input ref={folderRef} type="file" multiple className="hidden" {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(event) => void handleFiles(event)} />
          <p className="mt-3 text-[11px] text-slate-500">
            PDF/DOCX/TXT resume · LinkedIn export ZIP · selected CSV files · pasted text can be added in the Paste tab.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <textarea
            className="input min-h-32"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste your resume or profile text here."
          />
          <button className="btn-primary mt-3 text-xs" disabled={busy || !text.trim()} onClick={() => void onImport([], text)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Import pasted text
          </button>
        </div>
      )}

      {ready && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
          <p className="text-[11px] text-slate-500">
            Last import: <span className="text-slate-300">{profiles.active?.filename || profiles.imported?.filename}</span>
          </p>
          <button className="text-xs font-medium text-accent-400 hover:text-accent-300" onClick={onOpenDashboard}>
            View LinkedIn Dashboard →
          </button>
        </div>
      )}
    </Card>
  );
}
