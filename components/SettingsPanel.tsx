"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  Download,
  KeyRound,
  Link2,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { JOB_SOURCE_META } from "@/lib/jobs/sourceInfo";
import { DEFAULT_JOB_DISCOVERY_SETTINGS, JOB_SOURCE_IDS } from "@/lib/types";
import type { AiSettings, AppSettings, JobDiscoverySettings, JobSourceId } from "@/lib/types";
import { Card, SectionHeader } from "./ui";

type Props = {
  settings: AppSettings;
  busy: string | null;
  onSave: (settings: AppSettings) => Promise<void>;
  staticMode?: boolean;
  onExportBackup?: () => Promise<void>;
  onImportBackup?: (json: string) => Promise<void>;
  onClearLocalData?: () => Promise<void>;
};

const WEIGHT_LABELS: { key: string; label: string; description: string }[] = [
  { key: "keywords", label: "Keyword coverage", description: "Terms from the job description found in your resume" },
  { key: "skills", label: "Hard-skill match", description: "Recognized tools, technologies, and domain skills" },
  { key: "experience", label: "Experience alignment", description: "Years of experience vs what the role asks for" },
  { key: "structure", label: "ATS structure", description: "Sections, contact details, and parse-friendly layout" },
  { key: "achievements", label: "Quantified impact", description: "Numbers, percentages, and action verbs in bullets" },
];

const parseList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export default function SettingsPanel({ settings, busy, onSave, staticMode = false, onExportBackup, onImportBackup, onClearLocalData }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const total = Object.values(draft.weights).reduce((a, b) => a + b, 0);
  const discovery = draft.jobDiscovery ?? DEFAULT_JOB_DISCOVERY_SETTINGS;

  const setAi = (patch: Partial<AiSettings>) => setDraft((d) => ({ ...d, ai: { ...d.ai, ...patch } }));
  const setDiscovery = (patch: Partial<JobDiscoverySettings>) =>
    setDraft((d) => ({ ...d, jobDiscovery: { ...(d.jobDiscovery ?? DEFAULT_JOB_DISCOVERY_SETTINGS), ...patch } }));
  const setProfileLink = (key: "linkedin" | "indeed", value: string) =>
    setDraft((d) => ({
      ...d,
      profileLinks: { ...(d.profileLinks ?? { linkedin: "", indeed: "" }), [key]: value.trim() },
    }));
  const toggleSource = (id: JobSourceId) =>
    setDraft((d) => {
      const current = d.jobDiscovery ?? DEFAULT_JOB_DISCOVERY_SETTINGS;
      const enabled = current.enabledSources.includes(id)
        ? current.enabledSources.filter((source) => source !== id)
        : [...current.enabledSources, id];
      return { ...d, jobDiscovery: { ...current, enabledSources: enabled } };
    });

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !onImportBackup) return;
    setBackupBusy(true);
    setBackupMessage("");
    try {
      await onImportBackup(await file.text());
      setBackupMessage("Backup restored. Your settings have been refreshed.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Could not restore this backup.");
    } finally {
      event.target.value = "";
      setBackupBusy(false);
    }
  }

  return (
    <>
      <SectionHeader
        eyebrow="Preferences"
        title="Settings"
        description={staticMode
          ? "Browser-only mode: settings and workspace data live in this browser. API keys stay in memory for this session and are never written to a backup."
          : "Configure optional AI assistance, tune the ATS score, and choose public job feeds for title discovery. Settings are stored locally."}
        action={
          <button className="btn-primary" disabled={busy === "settings"} onClick={() => void onSave(draft)}>
            {busy === "settings" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-fit p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-accent-400" /> AI assistance (optional)</h2>
          <p className="muted mt-1.5 text-xs">Scoring works fully offline. AI only adds a short, tailored assessment after the deterministic score is computed.</p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="label">Provider</label>
              <select className="input" value={draft.ai.provider} onChange={(e) => setAi({ provider: e.target.value as AiSettings["provider"] })}>
                <option value="none">None — deterministic scoring only</option>
                <option value="ollama">Ollama (local, private)</option>
                <option value="openai">OpenAI-compatible API</option>
                <option value="anthropic">Anthropic API</option>
              </select>
            </div>

            {draft.ai.provider !== "none" && (
              <>
                <div>
                  <label className="label">Base URL</label>
                  <input className="input" value={draft.ai.baseUrl} onChange={(e) => setAi({ baseUrl: e.target.value })} placeholder={draft.ai.provider === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1"} />
                  <p className="mt-1 text-[11px] text-slate-500">For OpenAI-compatible services, point this at any compatible endpoint.</p>
                </div>
                <div>
                  <label className="label">Model</label>
                  <input className="input" value={draft.ai.model} onChange={(e) => setAi({ model: e.target.value })} placeholder={draft.ai.provider === "ollama" ? "llama3.1" : "gpt-4o-mini"} />
                </div>
                {draft.ai.provider !== "ollama" && (
                  <div>
                    <label className="label">API key</label>
                    <input type="password" className="input" value={draft.ai.apiKey} onChange={(e) => setAi({ apiKey: e.target.value })} placeholder="sk-…" />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-5 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-[11px] leading-relaxed text-amber-100/70">
              With a cloud provider selected, job descriptions and resume text are sent to that service when you run an analysis. Ollama keeps everything on this machine.
            </p>
          </div>
          {staticMode && (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              AI is off by default. In this browser-only build, any key you enter is used for the current session only; close the page and it is gone.
            </p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><SlidersHorizontal className="h-4 w-4 text-accent-400" /> Score weights</h2>
          <p className="muted mt-1.5 text-xs">Weights are normalized automatically, so they do not need to total 100.</p>

          <div className="mt-5 space-y-5">
            {WEIGHT_LABELS.map((w) => (
              <div key={w.key}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-200">{w.label}</p>
                    <p className="text-[11px] text-slate-500">{w.description}</p>
                  </div>
                  <span className="w-10 text-right text-sm font-semibold tabular-nums text-accent-400">{draft.weights[w.key]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={70}
                  value={draft.weights[w.key] ?? 0}
                  onChange={(e) => setDraft((d) => ({ ...d, weights: { ...d.weights, [w.key]: Number(e.target.value) } }))}
                  className="mt-2 w-full accent-sky-400"
                />
              </div>
            ))}
          </div>

          <div className={`mt-5 flex items-center gap-2 rounded-xl border p-3.5 text-xs ${total === 100 ? "border-mint-500/20 bg-mint-500/[0.06] text-mint-400" : "border-white/10 bg-white/[0.02] text-slate-400"}`}>
            {total === 100 ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            Total weight: {total} {total === 100 ? "— clean 100%" : "— normalized at scoring time"}
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Link2 className="h-4 w-4 text-accent-400" /> Profile shortcuts</h2>
        <p className="muted mt-1.5 text-xs">Add your profile URLs to show direct links on the Overview tab. They are saved locally and opened in a new tab.</p>
        <div className="mt-5 max-w-xl">
          <label className="label">Target role for title discovery (optional)</label>
          <input
            className="input"
            value={draft.targetRole}
            onChange={(e) => setDraft((d) => ({ ...d, targetRole: e.target.value }))}
            placeholder="Target role"
          />
          <p className="mt-1 text-[11px] text-slate-500">A target role gives the title ranking a strong signal, even if your resume uses different wording.</p>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <label className="label">LinkedIn profile URL</label>
            <input
              className="input"
              type="url"
              value={draft.profileLinks?.linkedin ?? ""}
              onChange={(e) => setProfileLink("linkedin", e.target.value)}
              placeholder="https://www.linkedin.com/in/your-name/"
            />
          </div>
          <div>
            <label className="label">Indeed profile URL</label>
            <input
              className="input"
              type="url"
              value={draft.profileLinks?.indeed ?? ""}
              onChange={(e) => setProfileLink("indeed", e.target.value)}
              placeholder="https://www.indeed.com/profile/…"
            />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">If no LinkedIn URL is entered here, the app uses one found in an imported LinkedIn profile when available.</p>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Search className="h-4 w-4 text-accent-400" /> Job title discovery</h2>
        <p className="muted mt-1.5 text-xs">
          {staticMode
            ? "Public feeds are unavailable in the browser-only build. These settings are kept for a future server build; the Job titles tab derives suggestions from your saved descriptions instead."
            : <>Enable public feeds, then use the <span className="text-slate-200">Job titles</span> tab to refresh. Fetches are manual and cached for 24 hours. Only compact listing metadata is stored.</>}
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {JOB_SOURCE_IDS.map((id) => {
            const meta = JOB_SOURCE_META[id];
            const enabled = discovery.enabledSources.includes(id);
            return (
              <label
                key={id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                  enabled ? "border-accent-500/25 bg-accent-500/[0.05]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
                }`}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleSource(id)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-sky-400"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-100">
                    {meta.label}
                    {meta.requiresKey && <KeyRound className="h-3 w-3 text-amber-400" />}
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{meta.description}</span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div>
            <label className="label">Greenhouse board tokens</label>
            <input
              className="input"
              value={discovery.greenhouseBoards.join(", ")}
              onChange={(e) => setDiscovery({ greenhouseBoards: parseList(e.target.value) })}
              placeholder="stripe, figma"
            />
            <p className="mt-1 text-[11px] text-slate-500">The subdomain in a Greenhouse careers URL.</p>
          </div>
          <div>
            <label className="label">Lever board tokens</label>
            <input
              className="input"
              value={discovery.leverBoards.join(", ")}
              onChange={(e) => setDiscovery({ leverBoards: parseList(e.target.value) })}
              placeholder="company-name"
            />
            <p className="mt-1 text-[11px] text-slate-500">The company slug in a Lever careers URL.</p>
          </div>
          <div>
            <label className="label">Location terms (optional)</label>
            <input
              className="input"
              value={discovery.locationTerms.join(", ")}
              onChange={(e) => setDiscovery({ locationTerms: parseList(e.target.value) })}
              placeholder="remote, new york, us"
            />
            <p className="mt-1 text-[11px] text-slate-500">Only listings matching these terms are ranked.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-4">
          <div>
            <label className="label">Max listings per source</label>
            <input
              className="input"
              type="number"
              min={20}
              max={200}
              value={discovery.maxJobsPerSource}
              onChange={(e) => setDiscovery({ maxJobsPerSource: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Adzuna app ID</label>
            <input className="input" value={discovery.adzunaAppId} onChange={(e) => setDiscovery({ adzunaAppId: e.target.value })} placeholder="optional" />
          </div>
          <div>
            <label className="label">Adzuna API key</label>
            <input type="password" className="input" value={discovery.adzunaApiKey} onChange={(e) => setDiscovery({ adzunaApiKey: e.target.value })} placeholder="optional" />
          </div>
          <div>
            <label className="label">Adzuna country</label>
            <input className="input uppercase" maxLength={2} value={discovery.adzunaCountry} onChange={(e) => setDiscovery({ adzunaCountry: e.target.value })} placeholder="us" />
          </div>
        </div>

        <div className="mt-5 max-w-xl">
          <label className="label">USAJOBS API key</label>
          <input type="password" className="input" value={discovery.usajobsApiKey} onChange={(e) => setDiscovery({ usajobsApiKey: e.target.value })} placeholder="optional" />
        </div>

        <div className="mt-5 flex gap-3 rounded-xl border border-mint-500/20 bg-mint-500/[0.05] p-3.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mint-400" />
          <p className="text-[11px] leading-relaxed text-mint-100/70">
            Your name, email, phone, and full resume text are never sent to job sources. Key-based APIs receive only short resume-derived search keywords (for example, “role keyword tool keyword”). Public feeds receive no profile data at all.
          </p>
        </div>
      </Card>

      {staticMode && (onExportBackup || onImportBackup || onClearLocalData) && (
        <Card className="mt-6 p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Download className="h-4 w-4 text-accent-400" /> Local workspace backup</h2>
          <p className="muted mt-1.5 text-xs">
            Export profiles, jobs, ATS checks, and settings as JSON. The file contains private resume text, so store it somewhere safe. API keys are never included.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {onExportBackup && (
              <button
                className="btn-primary text-xs"
                disabled={backupBusy}
                onClick={async () => {
                  setBackupBusy(true);
                  try { await onExportBackup(); setBackupMessage("Backup downloaded."); }
                  catch (error) { setBackupMessage(error instanceof Error ? error.message : "Could not export backup."); }
                  finally { setBackupBusy(false); }
                }}
              >
                <Download className="h-4 w-4" /> Export JSON
              </button>
            )}
            {onImportBackup && (
              <>
                <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(event) => void restoreBackup(event)} />
                <button className="btn-ghost text-xs" disabled={backupBusy} onClick={() => fileInput.current?.click()}>
                  {backupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Restore JSON
                </button>
              </>
            )}
            {onClearLocalData && (
              <button
                className="btn-ghost text-xs text-rose-300/80 hover:text-rose-300"
                disabled={backupBusy}
                onClick={() => {
                  if (window.confirm("Delete all data stored in this browser? Export a backup first if you want to keep it.")) {
                    void onClearLocalData().then(() => setBackupMessage("Local data deleted."));
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete local data
              </button>
            )}
          </div>
          {backupMessage && <p className="mt-3 text-[11px] text-slate-400">{backupMessage}</p>}
        </Card>
      )}
    </>
  );
}
