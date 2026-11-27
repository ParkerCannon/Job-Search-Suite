"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Download,
  FileText,
  Link2,
  Loader2,
  Save,
  ScanSearch,
  Search,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { type JobDescription, type KeywordAnalysis, type PdfPageMode, type Profile, type ProfileSource, type Recommendation, type StoredProfile } from "@/lib/types";
import { exportProfilePdf } from "@/lib/export/pdf";
import ProfileDocument from "./ProfileDocument";
import ResumeEditor from "./ResumeEditor";
import { Card, EmptyState, SectionHeader } from "./ui";
import { useProfileDraft } from "./useProfileDraft";

type Props = {
  jobs: JobDescription[];
  profiles: Record<string, StoredProfile | null>;
  busy: string | null;
  onAdd: (title: string, company: string, rawText: string) => Promise<JobDescription | null>;
  onDelete: (id: string) => Promise<void>;
  onClearJobs: () => Promise<void>;
  onSaveProfile: (profile: Profile) => Promise<void>;
  onAnalyzeKeywords: (rawText: string, source: ProfileSource) => Promise<KeywordAnalysis>;
  onAnalyze: (jobId: string) => void;
  onNavigateTitles: () => void;
  pdfPageMode: PdfPageMode;
  onPdfPageModeChange: (mode: PdfPageMode) => void;
};

const SOURCE_LABELS: Record<ProfileSource, string> = {
  active: "Working profile",
  imported: "Imported snapshot",
  resume: "Legacy resume",
  linkedin: "Legacy LinkedIn",
};

export default function JobManager({ jobs, profiles, busy, onAdd, onDelete, onClearJobs, onSaveProfile, onAnalyzeKeywords, onAnalyze, onNavigateTitles, pdfPageMode, onPdfPageModeChange }: Props) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rawText, setRawText] = useState("");
  const [savedOpen, setSavedOpen] = useState(false);
  const [resumeSource, setResumeSource] = useState<ProfileSource>(() =>
    profiles.active ? "active" : profiles.imported ? "imported" : "active",
  );
  const [analysis, setAnalysis] = useState<KeywordAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [draft, setDraft] = useProfileDraft(profiles.active);
  const requestId = useRef(0);

  const availableSources = useMemo(
    () => (["active", "imported"] as ProfileSource[]).filter((s) => Boolean(profiles[s])),
    [profiles],
  );

  const analyze = useCallback(async (text: string, source: ProfileSource) => {
    if (text.trim().length < 40) {
      setAnalysis(null);
      setAnalysisError("");
      return;
    }
    const id = ++requestId.current;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const data = await onAnalyzeKeywords(text, source);
      if (id === requestId.current) setAnalysis(data);
    } catch (error) {
      if (id === requestId.current) {
        setAnalysis(null);
        setAnalysisError(error instanceof Error ? error.message : "Analysis failed.");
      }
    } finally {
      if (id === requestId.current) setAnalyzing(false);
    }
  }, [onAnalyzeKeywords]);

  // Re-run as the user types, with a short debounce so pasting is instant.
  useEffect(() => {
    const timer = setTimeout(() => void analyze(rawText, resumeSource), 650);
    return () => clearTimeout(timer);
  }, [rawText, resumeSource, analyze]);

  const profile = profiles[resumeSource];
  const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length;

  async function submit() {
    const job = await onAdd(title, company, rawText);
    if (job) {
      setTitle("");
      setCompany("");
    }
  }

  function loadJob(job: JobDescription) {
    setTitle(job.title);
    setCompany(job.company);
    setRawText(job.rawText);
    setSavedOpen(false);
    void analyze(job.rawText, resumeSource);
  }

  async function copySuggestion(rec: Recommendation) {
    try {
      await navigator.clipboard.writeText(rec.suggestion);
      setCopiedId(rec.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(null);
    }
  }

  async function saveResume() {
    await onSaveProfile(draft);
    if (resumeSource === "active") void analyze(rawText, "active");
  }

  async function exportResume() {
    await onSaveProfile(draft);
    if (resumeSource === "active") void analyze(rawText, "active");
    await exportProfilePdf(draft, { pageMode: pdfPageMode });
  }

  return (
    <>
      <SectionHeader
        eyebrow="Job descriptions"
        title="Paste a role. See the gaps."
        description="Paste a job description and get a live keyword breakdown with specific resume recommendations, while your resume stays open beside you."
      />

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileText className="h-4 w-4 text-accent-400" /> Job description
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost text-xs" onClick={onNavigateTitles} title="Discover titles from current public job feeds">
              <Search className="h-3.5 w-3.5 text-accent-400" /> Find job titles
            </button>
            {jobs.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  className="btn-ghost text-[11px] text-rose-300/80 hover:text-rose-300"
                  onClick={() => {
                    if (window.confirm(`Delete all ${jobs.length} saved job descriptions and their ATS checks? This cannot be undone.`)) {
                      void onClearJobs();
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete all
                </button>
                <button
                  className="btn-ghost text-xs"
                  onClick={() => setSavedOpen((open) => !open)}
                >
                  <BookmarkPlus className="h-3.5 w-3.5" /> Saved ({jobs.length})
                  <ChevronDown className={`h-3.5 w-3.5 transition ${savedOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
            )}
          </div>
        </div>

        {savedOpen && (
          <div className="mt-4 space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                <button onClick={() => loadJob(job)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-xs font-medium text-slate-200">{job.title}</p>
                  <p className="truncate text-[11px] text-slate-500">{job.company || "No company"} · {new Date(job.createdAt).toLocaleDateString()}</p>
                </button>
                <button className="btn-ghost px-2.5 py-1.5 text-[11px]" onClick={() => loadJob(job)}>Load</button>
                <button
                  className="btn-ghost px-2.5 py-1.5 text-[11px]"
                  onClick={() => onAnalyze(job.id)}
                  title="Open the full ATS report"
                >
                  <ScanSearch className="h-3.5 w-3.5" /> Full report
                </button>
                <button className="px-1.5 text-slate-500 hover:text-rose-400" onClick={() => void onDelete(job.id)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Job title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" />
          </div>
          <div>
            <label className="label">Company (optional)</label>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" />
          </div>
        </div>

        <div className="mt-4">
          <label className="label">Full description</label>
          <textarea
            className="input min-h-[190px] resize-y font-mono text-xs leading-6"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"Paste the full job posting here…\n\nRequirements:\n- 5+ years of experience with React and TypeScript\n- Experience with AWS and Docker\n- Strong SQL skills"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            {wordCount} words · {rawText.trim().length >= 40 ? "analysis updates as you type" : "paste at least a sentence to analyze"}
          </p>
          <div className="flex gap-2">
            <button
              className="btn-ghost text-xs"
              disabled={rawText.trim().length < 40 || analyzing || availableSources.length === 0}
              onClick={() => void analyze(rawText, resumeSource)}
            >
              {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Analyze keywords
            </button>
            <button className="btn-primary text-xs" disabled={busy === "job" || !rawText.trim()} onClick={() => void submit()}>
              {busy === "job" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
              Save description
            </button>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Your resume</h2>
            <div className="flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-slate-500" />
              <select
                className="input w-auto py-1.5 text-xs"
                value={resumeSource}
                onChange={(e) => setResumeSource(e.target.value as ProfileSource)}
              >
                {availableSources.map((source) => (
                  <option key={source} value={source}>{SOURCE_LABELS[source]}</option>
                ))}
              </select>
            </div>
          </div>
          {profile?.profile && (profile.profile.name || profile.profile.experience.length) ? (
            <ProfileDocument profile={profile.profile} compact />
          ) : (
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No resume to show"
              description="Import your resume from the Overview page to compare it against job descriptions here."
            />
          )}
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Keyword analysis & recommendations</h2>
            {analyzing && <Loader2 className="h-4 w-4 animate-spin text-accent-400" />}
          </div>
          <AnalysisPanel analysis={analysis} error={analysisError} copiedId={copiedId} onCopy={(rec) => void copySuggestion(rec)} />
        </div>
      </div>

      <div className="mt-10 border-t border-white/[0.06] pt-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Edit working resume</h2>
            <p className="muted mt-1 max-w-2xl text-xs">
              Changes here update the working profile used by the analysis above. Export downloads a new PDF of this version.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.02] p-1" role="group" aria-label="PDF length">
              <button
                type="button"
                title="Fit to one page. Long roles may have lower-value bullets removed."
                onClick={() => onPdfPageModeChange("single")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  pdfPageMode === "single" ? "bg-accent-500/15 text-accent-400" : "text-slate-400 hover:text-white"
                }`}
              >
                1 page
              </button>
              <button
                type="button"
                title="Keep every bullet and let the PDF continue onto more pages."
                onClick={() => onPdfPageModeChange("multiple")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  pdfPageMode === "multiple" ? "bg-accent-500/15 text-accent-400" : "text-slate-400 hover:text-white"
                }`}
              >
                Multi-page
              </button>
            </div>
            <button className="btn-ghost text-xs" disabled={busy === "profile" || !draft.name.trim()} onClick={() => void saveResume()}>
              {busy === "profile" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save changes
            </button>
            <button className="btn-primary text-xs" disabled={busy === "profile" || !draft.name.trim()} onClick={() => void exportResume()}>
              <Download className="h-4 w-4" /> Export as PDF
            </button>
          </div>
        </div>
        <ResumeEditor profile={draft} onChange={setDraft} />
      </div>
    </>
  );
}

function AnalysisPanel({
  analysis,
  error,
  copiedId,
  onCopy,
}: {
  analysis: KeywordAnalysis | null;
  error: string;
  copiedId: string | null;
  onCopy: (rec: Recommendation) => void;
}) {
  if (error) {
    return (
      <Card className="p-6">
        <p className="text-sm text-rose-300">{error}</p>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <EmptyState
        icon={<ScanSearch className="h-5 w-5" />}
        title="Waiting for a job description"
        description="Paste a posting above. Keyword gaps and resume recommendations will appear here automatically."
      />
    );
  }

  const { result, recommendations } = analysis;
  const color = result.overall >= 70 ? "#34d399" : result.overall >= 50 ? "#fbbf24" : "#fb7185";

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div
            className="score-ring flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
            style={{ "--score": result.overall, "--score-color": color } as React.CSSProperties}
          >
            <div className="flex h-[68px] w-[68px] flex-col items-center justify-center rounded-full bg-ink-850">
              <span className="text-2xl font-semibold text-white">{result.overall}</span>
              <span className="text-[9px] text-slate-500">/ 100</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Keyword match</p>
            <p className="mt-1 text-sm text-slate-200">
              {result.matchedKeywords.length} found · <span className="text-rose-300">{result.missingKeywords.length} gaps</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Scored against {SOURCE_LABELS[analysis.source].toLowerCase()}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4">
          <MiniStat label="Job skills found" value={result.categories[1]?.score ?? 0} suffix="%" />
          <MiniStat label="Formatting" value={result.categories[3]?.score ?? 0} suffix="%" />
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-mint-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Keywords in this posting</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {result.matchedKeywords.slice(0, 18).map((k) => (
            <span key={k.term} className="chip border-mint-500/20 bg-mint-500/[0.08] text-mint-300" title={`Importance ${k.importance}`}>
              {k.term}
            </span>
          ))}
          {!result.matchedKeywords.length && <p className="muted text-xs">No matches detected yet.</p>}
        </div>

        <div className="mb-3 mt-5 flex items-center gap-2">
          <XCircle className="h-4 w-4 text-rose-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Missing keywords</h3>
          <span className="ml-auto text-[11px] text-slate-500">highest impact first</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {result.missingKeywords.slice(0, 18).map((k) => (
            <span key={k.term} className="chip border-rose-500/20 bg-rose-500/[0.08] text-rose-200" title={`Importance ${k.importance}`}>
              {k.term}
              <span className="opacity-50">{k.importance}</span>
            </span>
          ))}
          {!result.missingKeywords.length && <p className="muted text-xs">Every detected keyword is covered.</p>}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Recommended changes</h3>
          <span className="ml-auto text-[11px] text-slate-500">{recommendations.length}</span>
        </div>
        {recommendations.length === 0 ? (
          <p className="muted text-xs">Nothing to flag for this description.</p>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div key={rec.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      rec.priority === "high"
                        ? "bg-rose-500/15 text-rose-300"
                        : rec.priority === "medium"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-sky-500/15 text-sky-300"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{rec.title}</p>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">{rec.location}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{rec.detail}</p>
                    <div className="mt-3 rounded-lg border border-accent-500/15 bg-accent-500/[0.04] p-3">
                      <p className="text-xs leading-relaxed text-accent-100/90">{rec.suggestion}</p>
                      <div className="mt-2 flex justify-end">
                        <button
                          className="flex items-center gap-1.5 text-[10px] font-medium text-accent-400 hover:text-accent-300"
                          onClick={() => onCopy(rec)}
                        >
                          {copiedId === rec.id ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                          {copiedId === rec.id ? "Copied" : "Copy suggestion"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {analysis.result.flags.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Parser flags</h3>
          </div>
          <ul className="space-y-2">
            {analysis.result.flags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-400">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${flag.severity === "high" ? "bg-rose-400" : flag.severity === "medium" ? "bg-amber-400" : "bg-sky-400"}`} />
                {flag.title}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-slate-500">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Add only skills and keywords you genuinely have. These are suggestions for wording, not permission to invent experience.
      </p>
    </div>
  );
}

function MiniStat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-100">{value}{suffix}</p>
    </div>
  );
}
