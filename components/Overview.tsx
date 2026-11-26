"use client";

import { useRef, useState } from "react";
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
import type { AppSettings, AtsAnalysisRecord, JobDescription, StoredProfile } from "@/lib/types";
import { Card, EmptyState, SectionHeader, Spinner, Stat } from "./ui";

type Props = {
  profiles: Record<string, StoredProfile | null>;
  jobs: JobDescription[];
  analyses: AtsAnalysisRecord[];
  settings: AppSettings | null;
  busy: string | null;
  onImport: (source: "resume" | "linkedin", file: File | null, text: string) => Promise<void>;
  onNavigate: (section: "overview" | "profile" | "jobs" | "titles" | "ats" | "settings") => void;
};

export default function Overview({ profiles, jobs, analyses, settings, busy, onImport, onNavigate }: Props) {
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
        description="Import your resume and LinkedIn profile, score them against a job description, and see exactly what an ATS would notice. Everything stays on this machine."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Resume" value={profiles.resume ? "Ready" : "Missing"} hint={profiles.resume?.filename} tone={profiles.resume ? "good" : "warn"} />
        <Stat label="LinkedIn" value={profiles.linkedin ? "Ready" : "Missing"} hint={profiles.linkedin?.filename} tone={profiles.linkedin ? "good" : "warn"} />
        <Stat label="Job descriptions" value={jobs.length} hint="Saved ATS targets" />
        <Stat label="Latest ATS score" value={latest ? `${latest.result.overall}` : "—"} hint={latest?.jobTitle ?? "No analysis yet"} tone={latest ? (latest.result.overall >= 70 ? "good" : "warn") : "default"} />
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <ImportCard
          kind="resume"
          title="Import your resume"
          description="PDF, DOCX, or plain text. We extract the text and split it into sections."
          icon={<FileText className="h-5 w-5" />}
          imported={profiles.resume}
          busy={busy === "resume"}
          onImport={onImport}
        />
        <ImportCard
          kind="linkedin"
          title="Import your LinkedIn profile"
          description="Download your data from LinkedIn and upload the JSON file, or paste your profile text."
          icon={<Linkedin className="h-5 w-5" />}
          imported={profiles.linkedin}
          busy={busy === "linkedin"}
          onImport={onImport}
        />
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

        <Card className="relative overflow-hidden p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-400">Next step</p>
            <h2 className="mt-3 text-lg font-semibold text-white">Run your first ATS check</h2>
            <p className="muted mt-2">
              {!profileReady
                ? "Import a resume to build your working profile first."
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
              <p className="flex items-center gap-2"><UploadCloud className="h-3.5 w-3.5 text-slate-500" /> Local SQLite storage — no account needed</p>
            </div>
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
  kind,
  title,
  description,
  icon,
  imported,
  busy,
  onImport,
}: {
  kind: "resume" | "linkedin";
  title: string;
  description: string;
  icon: React.ReactNode;
  imported: StoredProfile | null | undefined;
  busy: boolean;
  onImport: (source: "resume" | "linkedin", file: File | null, text: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"file" | "text">("file");
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | null) {
    if (file) await onImport(kind, file, "");
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-accent-400">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {imported && (
              <span className="chip border-mint-500/20 bg-mint-500/10 text-mint-400">Imported</span>
            )}
          </div>
          <p className="muted mt-1.5 text-[13px]">{description}</p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => setMode("file")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${mode === "file" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
        >
          Upload file
        </button>
        <button
          onClick={() => setMode("text")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${mode === "text" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
        >
          Paste text
        </button>
      </div>

      {mode === "file" ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFile(e.dataTransfer.files[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          className={`mt-3 cursor-pointer rounded-xl border border-dashed px-4 py-6 text-center transition ${
            dragging ? "border-accent-400 bg-accent-500/10" : "border-white/10 hover:border-accent-500/40 hover:bg-white/[0.02]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={kind === "resume" ? ".pdf,.docx,.txt,.md" : ".json,.txt,.html,.pdf,.docx"}
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          {busy ? (
            <Spinner label="Parsing…" />
          ) : (
            <>
              <UploadCloud className="mx-auto h-5 w-5 text-slate-500" />
              <p className="mt-2 text-xs text-slate-400">Drop a file here or click to browse</p>
              {imported && <p className="mt-1 truncate text-[11px] text-slate-500">{imported.filename}</p>}
            </>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="input resize-y font-mono text-xs"
            placeholder={kind === "resume" ? "Paste your full resume text here…" : "Paste your LinkedIn profile text here…"}
          />
          <button
            className="btn-ghost mt-3 w-full"
            disabled={busy || !text.trim()}
            onClick={() => void onImport(kind, null, text)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Parse pasted text
          </button>
        </div>
      )}
    </Card>
  );
}
