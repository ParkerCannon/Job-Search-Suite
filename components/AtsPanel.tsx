"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Eye,
  FileSearch,
  Info,
  Linkedin,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  AppSettings,
  AtsAnalysisRecord,
  AtsResult,
  JobDescription,
  LinkedInExportSnapshot,
  ProfileSource,
  StoredProfile,
} from "@/lib/types";
import { Card, EmptyState, SectionHeader } from "./ui";
import LinkedInDashboard from "./LinkedInDashboard";

type Props = {
  jobs: JobDescription[];
  analyses: AtsAnalysisRecord[];
  profiles: Record<string, StoredProfile | null>;
  settings: AppSettings;
  linkedin: LinkedInExportSnapshot | null;
  busy: string | null;
  onAnalyze: (jobId: string, source: ProfileSource) => Promise<void>;
  onDeleteAnalysis: (id: string) => Promise<void>;
  onClearAnalyses: () => Promise<void>;
  onNavigateJobs: () => void;
  onNavigateProfile: () => void;
  onImportProfile: (files: File[], text: string) => Promise<void>;
  onClearLinkedIn: () => Promise<void>;
  onApplyIntent: (settings: AppSettings) => Promise<void>;
};

export default function AtsPanel(props: Props) {
  const [view, setView] = useState<"analysis" | "linkedin">("analysis");
  const isDashboard = view === "linkedin";

  return (
    <>
      <SectionHeader
        eyebrow="ATS check"
        title={isDashboard ? "LinkedIn Dashboard" : "See what the parser sees"}
        description={isDashboard
          ? "Explore every CSV in your LinkedIn export, with local-only insights for job search intent, network, learning, and profile evidence."
          : "A transparent, explainable diagnostic: keyword coverage, hard skills, experience alignment, structure, and quantified impact."}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setView("analysis")}
          className={`btn border text-xs ${!isDashboard ? "border-accent-500/40 bg-accent-500/10 text-accent-400" : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-white"}`}
        >
          <FileSearch className="h-3.5 w-3.5" /> Score & keywords
        </button>
        <button
          onClick={() => setView("linkedin")}
          className={`btn border text-xs ${isDashboard ? "border-accent-500/40 bg-accent-500/10 text-accent-400" : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-white"}`}
        >
          <Linkedin className="h-3.5 w-3.5" /> LinkedIn Dashboard
        </button>
      </div>
      {isDashboard ? (
        <LinkedInDashboard
          linkedin={props.linkedin}
          settings={props.settings}
          busy={props.busy}
          onImport={props.onImportProfile}
          onClear={props.onClearLinkedIn}
          onApplyIntent={props.onApplyIntent}
          onNavigateProfile={props.onNavigateProfile}
        />
      ) : (
        <AnalysisView {...props} />
      )}
    </>
  );
}

function AnalysisView({ jobs, analyses, profiles, busy, onAnalyze, onDeleteAnalysis, onClearAnalyses, onNavigateJobs }: Props) {
  const [jobId, setJobId] = useState("");
  const [source, setSource] = useState<ProfileSource>(() => (profiles.active ? "active" : "imported"));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => analyses.find((a) => a.id === selectedId) ?? analyses[0] ?? null,
    [analyses, selectedId],
  );

  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={<FileSearch className="h-5 w-5" />}
        title="Add a job description first"
        description="ATS scoring needs a target role so it can identify keywords, skills, and experience gaps. Open the LinkedIn Dashboard tab to explore your exported data without a job description."
        action={<button className="btn-primary" onClick={onNavigateJobs}>Add a job description</button>}
      />
    );
  }

  return (
    <>
      <Card className="mb-6 flex flex-wrap items-end gap-4 p-5">
        <div className="min-w-[220px] flex-1">
          <label className="label">Job description</label>
          <select className="input" value={jobId || selected?.jobId || jobs[0].id} onChange={(e) => setJobId(e.target.value)}>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>{job.title}{job.company ? ` · ${job.company}` : ""}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="label">Profile to check</label>
          <select className="input" value={source} onChange={(e) => setSource(e.target.value as ProfileSource)}>
            <option value="active" disabled={!profiles.active}>Working profile</option>
            <option value="imported" disabled={!profiles.imported}>Imported snapshot</option>
          </select>
        </div>
        <button
          className="btn-primary"
          disabled={busy === "ats"}
          onClick={() => void onAnalyze(jobId || selected?.jobId || jobs[0].id, source)}
        >
          {busy === "ats" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run ATS check
        </button>
      </Card>

      {!selected ? (
        <EmptyState
          icon={<FileSearch className="h-5 w-5" />}
          title="No analysis yet"
          description="Choose a job description and profile above, then run your first ATS check."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
          <div className="space-y-5">
            <ScoreCard result={selected.result} />
            <SourceCard result={selected.result} />
            {analyses.length > 0 && (
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">History ({analyses.length})</h3>
                  <button
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-300"
                    onClick={() => {
                      if (window.confirm(`Delete all ${analyses.length} saved ATS checks? This cannot be undone.`)) {
                        void onClearAnalyses();
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" /> Clear all
                  </button>
                </div>
                <div className="space-y-1.5">
                  {analyses.slice(0, 8).map((a) => (
                    <div key={a.id} className={`flex items-center rounded-lg ${a.id === selected.id ? "bg-accent-500/10 text-accent-400" : "text-slate-400 hover:bg-white/[0.04]"}`}>
                      <button
                        onClick={() => setSelectedId(a.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-xs"
                      >
                        <span className="font-semibold">{a.result.overall}</span>
                        <span className="min-w-0 flex-1 truncate">{a.jobTitle}</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      <button
                        className="px-2 py-2 text-slate-500 hover:text-rose-400"
                        onClick={() => void onDeleteAnalysis(a.id)}
                        title="Delete this check"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {analyses.length > 8 && (
                  <p className="mt-2 text-[10px] text-slate-500">Showing the 8 most recent. Use Clear all to free space.</p>
                )}
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card className="p-6">
              <h3 className="mb-5 text-sm font-semibold text-white">Score breakdown</h3>
              <div className="space-y-5">
                {selected.result.categories.map((cat) => (
                  <div key={cat.key}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-200">{cat.label}</span>
                      <span className="tabular-nums text-slate-400">{cat.score}<span className="text-slate-600"> / 100 · weight {cat.weight}%</span></span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${cat.score >= 70 ? "bg-mint-500" : cat.score >= 45 ? "bg-amber-400" : "bg-rose-400"}`}
                        style={{ width: `${cat.score}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">{cat.detail}</p>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-mint-400" />
                  <h3 className="text-sm font-semibold text-white">Keywords found</h3>
                  <span className="ml-auto text-xs text-slate-500">{selected.result.matchedKeywords.length}</span>
                </div>
                <KeywordList items={selected.result.matchedKeywords} found />
              </Card>
              <Card className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-rose-400" />
                  <h3 className="text-sm font-semibold text-white">Keyword gaps</h3>
                  <span className="ml-auto text-xs text-slate-500">{selected.result.missingKeywords.length}</span>
                </div>
                <KeywordList items={selected.result.missingKeywords} found={false} />
              </Card>
            </div>

            <Card className="p-6">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Flags & fixes</h3>
                <span className="ml-auto text-xs text-slate-500">{selected.result.flags.length}</span>
              </div>
              {selected.result.flags.length === 0 ? (
                <p className="muted text-xs">No structural issues detected.</p>
              ) : (
                <div className="space-y-3">
                  {selected.result.flags.map((flag, i) => (
                    <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${flag.severity === "high" ? "bg-rose-400" : flag.severity === "medium" ? "bg-amber-400" : "bg-sky-400"}`} />
                        <div>
                          <p className="text-sm font-medium text-slate-100">{flag.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-400">{flag.detail}</p>
                          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-accent-400">
                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0" /> {flag.fix}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="mb-4 flex items-center gap-2">
                <Eye className="h-4 w-4 text-accent-400" />
                <h3 className="text-sm font-semibold text-white">What the ATS sees</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MiniStat label="Words extracted" value={selected.result.atsView.wordCount} />
                <MiniStat label="Sections found" value={selected.result.atsView.detectedSections.length || "0"} sub={selected.result.atsView.detectedSections.join(", ") || "None"} />
                <MiniStat label="Bullet lines" value={selected.result.atsView.bulletLines} sub={`${selected.result.atsView.numericAchievements} quantified`} />
                <MiniStat label="Est. years" value={selected.result.atsView.estimatedYears ?? "—"} sub={selected.result.atsView.dateFormats.join(" · ") || "No date format"} />
              </div>
              <div className="mt-5 grid gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
                <div>
                  <p className="label">Contact detected</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(selected.result.atsView.contact).map(([key, ok]) => (
                      <span key={key} className={`chip ${ok ? "border-mint-500/20 bg-mint-500/10 text-mint-400" : "border-white/10 bg-white/[0.03] text-slate-500"}`}>
                        {ok ? <CheckCircle2 className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}{key}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="label">Missing standard sections</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.result.atsView.missingSections.length ? selected.result.atsView.missingSections.map((s) => (
                      <span key={s} className="chip border-rose-500/20 bg-rose-500/10 text-rose-300">{s}</span>
                    )) : <span className="chip border-mint-500/20 bg-mint-500/10 text-mint-400">None — all present</span>}
                  </div>
                </div>
              </div>
            </Card>

            {selected.result.aiSummary && (
              <Card className="border-accent-500/20 bg-accent-500/[0.04] p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent-400" />
                  <h3 className="text-sm font-semibold text-white">AI assessment</h3>
                </div>
                <p className="text-sm leading-7 text-slate-300">{selected.result.aiSummary}</p>
              </Card>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This is an explainable simulation of common ATS behavior, not a score from any specific employer's system. Weights are configurable in Settings.
      </p>
    </>
  );
}

function ScoreCard({ result }: { result: AtsResult }) {
  const color = result.overall >= 70 ? "#34d399" : result.overall >= 50 ? "#fbbf24" : "#fb7185";
  return (
    <Card className="p-6 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Overall match</p>
      <div
        className="score-ring mx-auto mt-5 flex h-40 w-40 items-center justify-center rounded-full"
        style={{ "--score": result.overall, "--score-color": color } as React.CSSProperties}
      >
        <div className="flex h-[138px] w-[138px] flex-col items-center justify-center rounded-full bg-ink-850">
          <span className="text-5xl font-semibold tracking-tight text-white">{result.overall}</span>
          <span className="mt-0.5 text-xs text-slate-500">out of 100</span>
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-200">{result.jobTitle}</p>
      <div className="mt-4 flex justify-center gap-2">
        <span className="chip border-white/10 bg-white/[0.03] text-slate-300">{result.matchedKeywords.length} found</span>
        <span className="chip border-rose-500/20 bg-rose-500/10 text-rose-300">{result.missingKeywords.length} gaps</span>
      </div>
    </Card>
  );
}

function SourceCard({ result }: { result: AtsResult }) {
  const labels: Record<ProfileSource, string> = {
    active: "Working profile",
    imported: "Imported snapshot",
    resume: "Legacy resume",
    linkedin: "Legacy LinkedIn",
  };
  return (
    <Card className="p-5">
      <p className="label">Analyzed profile</p>
      <p className="mt-1.5 text-sm font-medium text-slate-100">{labels[result.source]}</p>
      <p className="mt-1 text-[11px] text-slate-500">{new Date(result.createdAt).toLocaleString()}</p>
    </Card>
  );
}

function KeywordList({ items, found }: { items: AtsResult["matchedKeywords"]; found: boolean }) {
  if (!items.length) return <p className="muted text-xs">None detected.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.slice(0, 24).map((item) => (
        <span
          key={item.term}
          title={`${item.context} · importance ${item.importance}`}
          className={`chip ${found ? "border-mint-500/20 bg-mint-500/[0.08] text-mint-300" : "border-white/10 bg-white/[0.03] text-slate-300"}`}
        >
          {item.term}
          <span className="opacity-50">{item.importance}</span>
        </span>
      ))}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-1 text-[10px] leading-snug text-slate-500">{sub}</p>}
    </div>
  );
}
