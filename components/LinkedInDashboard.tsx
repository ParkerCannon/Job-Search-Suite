"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Fingerprint,
  GraduationCap,
  Linkedin,
  Loader2,
  Network,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { AppSettings, LinkedInCsvTable, LinkedInExportSnapshot } from "@/lib/types";
import { Card, EmptyState } from "./ui";

type View = "overview" | "intent" | "profile" | "network" | "learning" | "applications" | "activity" | "data" | "privacy";

type Props = {
  linkedin: LinkedInExportSnapshot | null;
  settings: AppSettings;
  busy: string | null;
  onImport: (files: File[], text: string) => Promise<void>;
  onClear: () => Promise<void>;
  onApplyIntent: (settings: AppSettings) => Promise<void>;
  onNavigateProfile: () => void;
};

const VIEWS: { id: View; label: string; icon: typeof Database }[] = [
  { id: "overview", label: "Overview", icon: Database },
  { id: "intent", label: "Career intent", icon: Sparkles },
  { id: "profile", label: "Profile facts", icon: BriefcaseBusiness },
  { id: "network", label: "Network", icon: Network },
  { id: "learning", label: "Learning", icon: GraduationCap },
  { id: "applications", label: "Applications", icon: CheckCircle2 },
  { id: "activity", label: "Activity", icon: BarChart3 },
  { id: "data", label: "Data explorer", icon: FileSpreadsheet },
  { id: "privacy", label: "Privacy", icon: ShieldAlert },
];

const SENSITIVE_COLUMN = /email|phone|whatsapp|message|note|text|description|answer|summary|url|link/i;

function tableBy(snapshot: LinkedInExportSnapshot, fragment: string): LinkedInCsvTable | undefined {
  const key = fragment.toLowerCase().replace(/\.csv$/i, "").replace(/[^a-z0-9]/g, "");
  return snapshot.tables.find((table) => table.id.replace(/[^a-z0-9]/g, "").includes(key));
}

function rowsOf(snapshot: LinkedInExportSnapshot, fragment: string): Array<Record<string, string>> {
  return tableBy(snapshot, fragment)?.rows ?? [];
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) if (row[key]) return row[key];
  return "";
}

function displayValue(value: string, column: string, reveal: boolean): string {
  if (reveal || !value) return value;
  if (SENSITIVE_COLUMN.test(column)) return "••••••";
  return value.length > 140 ? `${value.slice(0, 140)}…` : value;
}

function topCompanyCounts(rows: Array<Record<string, string>>): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const company = pick(row, "Company", "Organization", "Company Name").trim();
    if (!company) continue;
    counts.set(company, (counts.get(company) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

export default function LinkedInDashboard({
  linkedin,
  settings,
  busy,
  onImport,
  onClear,
  onApplyIntent,
  onNavigateProfile,
}: Props) {
  const [view, setView] = useState<View>("overview");
  const [reveal, setReveal] = useState(false);
  const [showImport, setShowImport] = useState(!linkedin);
  const [importText, setImportText] = useState("");
  const [tableId, setTableId] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const insights = linkedin?.insights;
  useEffect(() => {
    setSelectedTerms((insights?.topTerms ?? []).slice(0, 12).map((term) => term.term));
  }, [insights]);

  const activeTable = useMemo(() => {
    if (!linkedin) return undefined;
    return linkedin.tables.find((table) => table.id === tableId) ?? linkedin.tables[0];
  }, [linkedin, tableId]);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    await onImport(files, importText);
    setShowImport(false);
  }

  async function applyIntent() {
    if (!insights) return;
    const merge = (current: string[], additions: string[]) =>
      [...new Set([...current, ...additions.filter(Boolean)])].slice(0, 30);
    await onApplyIntent({
      ...settings,
      targetRole: insights.suggestedTargetRole || settings.targetRole,
      jobDiscovery: {
        ...settings.jobDiscovery,
        locationTerms: merge(settings.jobDiscovery.locationTerms, insights.locationTerms),
        searchKeywords: merge(settings.jobDiscovery.searchKeywords, [
          ...selectedTerms,
          ...insights.alertKeywords,
        ]),
      },
    });
  }

  if (!linkedin) {
    return (
      <>
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">No LinkedIn export loaded</h2>
              <p className="muted mt-1.5 max-w-2xl text-xs">
                Upload the whole LinkedIn data export as a ZIP, choose the export folder, or select multiple CSV files.
                Everything is parsed locally. Sensitive rows are hidden by default in the dashboard.
              </p>
            </div>
            <button className="btn-ghost text-xs" onClick={() => setShowImport((value) => !value)}>
              {showImport ? "Hide import" : "Import export"}
            </button>
          </div>
          {showImport && <ImportControls fileRef={fileRef} folderRef={folderRef} importText={importText} setImportText={setImportText} onFiles={handleFiles} busy={busy} />}
        </Card>
        <div className="mt-6">
          <EmptyState
            icon={<Linkedin className="h-5 w-5" />}
            title="LinkedIn Dashboard is empty"
            description="Import your LinkedIn CSV bundle to see search intent, profile facts, network signals, learning history, and every raw CSV table in one local dashboard."
          />
        </div>
      </>
    );
  }

  const intentApplied =
    Boolean(insights?.suggestedTargetRole) &&
    settings.targetRole.trim().toLowerCase() === insights?.suggestedTargetRole.trim().toLowerCase();

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">
              LinkedIn export · {new Date(linkedin.importedAt).toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {linkedin.fileCount} files · {linkedin.tableCount} CSV tables · {linkedin.rowCount.toLocaleString()} rows · stored locally
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost text-xs" onClick={() => setShowImport((value) => !value)}>
              {showImport ? "Hide import" : "Re-import"}
            </button>
            <button
              className="btn-ghost text-xs text-rose-300"
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm("Delete the stored LinkedIn export from this workspace?")) void onClear();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear data
            </button>
          </div>
        </div>
        {showImport && (
          <div className="mt-5 border-t border-white/[0.06] pt-5">
            <ImportControls fileRef={fileRef} folderRef={folderRef} importText={importText} setImportText={setImportText} onFiles={handleFiles} busy={busy} />
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`btn border text-xs ${view === item.id ? "border-accent-500/40 bg-accent-500/10 text-accent-400" : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-white"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {view === "overview" && (
        <OverviewPanel snapshot={linkedin} onSelect={setView} onOpenProfile={onNavigateProfile} />
      )}
      {view === "intent" && insights && (
        <IntentPanel
          snapshot={linkedin}
          selectedTerms={selectedTerms}
          toggleTerm={(term) =>
            setSelectedTerms((current) =>
              current.includes(term) ? current.filter((item) => item !== term) : [...current, term],
            )
          }
          applied={intentApplied}
          applying={busy === "settings"}
          onApply={() => void applyIntent()}
        />
      )}
      {view === "profile" && <ProfilePanel snapshot={linkedin} reveal={reveal} />}
      {view === "network" && <NetworkPanel snapshot={linkedin} reveal={reveal} />}
      {view === "learning" && <LearningPanel snapshot={linkedin} reveal={reveal} />}
      {view === "applications" && <ApplicationsPanel snapshot={linkedin} reveal={reveal} />}
      {view === "activity" && <ActivityPanel snapshot={linkedin} reveal={reveal} />}
      {view === "data" && (
        <DataExplorer
          snapshot={linkedin}
          table={activeTable}
          tableId={activeTable?.id ?? ""}
          setTableId={(id) => {
            setTableId(id);
            setPage(0);
          }}
          query={query}
          setQuery={(value) => {
            setQuery(value);
            setPage(0);
          }}
          page={page}
          setPage={setPage}
          reveal={reveal}
          setReveal={setReveal}
        />
      )}
      {view === "privacy" && (
        <PrivacyPanel snapshot={linkedin} reveal={reveal} setReveal={setReveal} />
      )}
    </div>
  );
}

function ImportControls({
  fileRef,
  folderRef,
  importText,
  setImportText,
  onFiles,
  busy,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  folderRef: React.RefObject<HTMLInputElement | null>;
  importText: string;
  setImportText: (value: string) => void;
  onFiles: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  busy: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary text-xs" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
          {busy === "profile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Upload files or ZIP
        </button>
        <button className="btn-ghost text-xs" disabled={busy !== null} onClick={() => folderRef.current?.click()}>
          <Building2 className="h-4 w-4" /> Choose export folder
        </button>
      </div>
      <input ref={fileRef} type="file" multiple accept=".zip,.csv,.pdf,.docx,.txt,.md,.json" className="hidden" onChange={(event) => void onFiles(event)} />
      <input ref={folderRef} type="file" multiple className="hidden" {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(event) => void onFiles(event)} />
      <div>
        <label className="label">Optional pasted profile text</label>
        <textarea
          className="input min-h-24"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder="Paste a resume or profile summary if you do not have a file."
        />
      </div>
    </div>
  );
}

function OverviewPanel({
  snapshot,
  onSelect,
  onOpenProfile,
}: {
  snapshot: LinkedInExportSnapshot;
  onSelect: (view: View) => void;
  onOpenProfile: () => void;
}) {
  const categories = new Map<string, number>();
  for (const table of snapshot.tables) {
    categories.set(table.category, (categories.get(table.category) ?? 0) + table.rowCount);
  }
  const stats = [
    { label: "Search queries", value: snapshot.insights.queryCount, view: "intent" as View },
    { label: "Connections", value: rowsOf(snapshot, "connections").length, view: "network" as View },
    { label: "Courses", value: rowsOf(snapshot, "learning.csv").length, view: "learning" as View },
    { label: "Screening answers", value: rowsOf(snapshot, "screening").length, view: "applications" as View },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <button key={stat.label} onClick={() => onSelect(stat.view)} className="text-left">
            <Card className="h-full p-5 transition hover:border-accent-500/25">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-white">{stat.value.toLocaleString()}</p>
              <p className="mt-1 text-[11px] text-accent-400">Open panel →</p>
            </Card>
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-white">Data coverage</h3>
          <div className="mt-4 space-y-3">
            {[...categories.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => (
              <div key={category} className="flex items-center justify-between gap-4 text-xs">
                <span className="capitalize text-slate-300">{category}</span>
                <span className="tabular-nums text-slate-500">{count.toLocaleString()} rows</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-white">What was detected</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            {[
              ["Positions", rowsOf(snapshot, "positions").length],
              ["Education", rowsOf(snapshot, "education").length],
              ["Certifications", rowsOf(snapshot, "certifications").length],
              ["Skills", rowsOf(snapshot, "skills").length],
              ["Company follows", rowsOf(snapshot, "company follows").length],
              ["Saved alerts", rowsOf(snapshot, "savedjobalerts").length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-semibold text-white">{Number(value).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <button className="btn-ghost mt-5 text-xs" onClick={onOpenProfile}>
            Open working profile <Database className="h-3.5 w-3.5" />
          </button>
        </Card>
      </div>
      {snapshot.warnings.length > 0 && (
        <Card className="p-5">
          <p className="text-xs font-semibold text-amber-300">Import notes</p>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
            {snapshot.warnings.slice(0, 8).map((warning, index) => <li key={index}>• {warning}</li>)}
          </ul>
        </Card>
      )}
    </>
  );
}

function IntentPanel({
  snapshot,
  selectedTerms,
  toggleTerm,
  applied,
  applying,
  onApply,
}: {
  snapshot: LinkedInExportSnapshot;
  selectedTerms: string[];
  toggleTerm: (term: string) => void;
  applied: boolean;
  applying: boolean;
  onApply: () => void;
}) {
  const insights = snapshot.insights;
  const maxCount = Math.max(1, ...insights.topTerms.map((term) => term.count));
  return (
    <>
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Search intent</h3>
            <p className="muted mt-1 text-xs">
              {insights.queryCount.toLocaleString()} searches · {insights.distinctQueries.toLocaleString()} distinct · {insights.confidence} confidence
            </p>
          </div>
          <button className="btn-primary text-xs" disabled={applying} onClick={onApply}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {applied ? "Applied — update again" : "Apply to job search"}
          </button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="label">Suggested target role</p>
            <p className="mt-2 text-2xl font-semibold text-accent-400">{insights.suggestedTargetRole || "Not enough data"}</p>
          </div>
          <div>
            <p className="label">Signals</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {insights.workplaceTypes.map((type) => <span key={type} className="chip border-white/10 bg-white/[0.03] text-slate-300">{type}</span>)}
              {insights.locations.slice(0, 4).map((location) => <span key={location.label} className="chip border-sky-500/20 bg-sky-500/[0.08] text-sky-300">{location.label}</span>)}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent-400" />
            <h3 className="text-sm font-semibold text-white">Top search terms</h3>
          </div>
          <div className="space-y-3">
            {insights.topTerms.slice(0, 14).map((term) => (
              <button key={term.term} onClick={() => toggleTerm(term.term)} className="block w-full text-left">
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
                  <span className={selectedTerms.includes(term.term) ? "font-medium text-slate-100" : "text-slate-500"}>
                    {selectedTerms.includes(term.term) ? "✓ " : ""}{term.term}
                  </span>
                  <span className="tabular-nums text-slate-500">{term.count}{term.recentCount ? ` · ${term.recentCount} recent` : ""}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full bg-accent-500/70" style={{ width: `${(term.count / maxCount) * 100}%` }} />
                </div>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[10px] text-slate-500">Click a term to include or exclude it when applying.</p>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4 text-accent-400" />
            <h3 className="text-sm font-semibold text-white">Role families</h3>
          </div>
          {insights.roleFamilies.length === 0 ? (
            <p className="muted text-xs">No clear role families were detected.</p>
          ) : (
            <div className="space-y-3">
              {insights.roleFamilies.map((role) => (
                <div key={role.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-slate-100">{role.label}</p>
                    <span className="text-[10px] text-slate-500">{role.count} searches</span>
                  </div>
                  {role.evidence[0] && <p className="mt-1 truncate text-[10px] text-slate-500">“{role.evidence[0]}”</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-white">Alert keywords</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {insights.alertKeywords.length ? insights.alertKeywords.map((keyword) => (
            <span key={keyword} className="chip border-mint-500/20 bg-mint-500/[0.08] text-mint-300">{keyword}</span>
          )) : <p className="muted text-xs">No saved alerts were found.</p>}
        </div>
        <p className="mt-4 text-[10px] text-slate-500">Evidence: {insights.evidenceFiles.join(", ") || "none"}</p>
      </Card>
    </>
  );
}

function ProfilePanel({ snapshot, reveal }: { snapshot: LinkedInExportSnapshot; reveal: boolean }) {
  const sections = [
    { title: "Positions", fragment: "positions", columns: ["Title", "Company Name", "Location", "Started On", "Finished On", "Description"] },
    { title: "Education", fragment: "education", columns: ["School Name", "Degree Name", "Start Date", "End Date", "Notes"] },
    { title: "Certifications", fragment: "certifications", columns: ["Name", "Authority", "Started On", "Finished On", "License Number"] },
    { title: "Skills", fragment: "skills", columns: ["Name"] },
    { title: "Languages", fragment: "languages", columns: ["Name", "Proficiency"] },
    { title: "Organizations", fragment: "organizations", columns: ["Name", "Position", "Started On", "Finished On", "Description"] },
    { title: "Recommendations", fragment: "recommendations", columns: ["First Name", "Last Name", "Company", "Job Title", "Text"] },
    { title: "Endorsements", fragment: "endorsement", columns: ["Skill Name", "Endorser First Name", "Endorser Last Name", "Endorsement Date"] },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {sections.map((section) => (
        <Card key={section.title} className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{section.title}</h3>
          <MiniTable rows={rowsOf(snapshot, section.fragment)} columns={section.columns} reveal={reveal} empty="No rows imported." />
        </Card>
      ))}
    </div>
  );
}

function NetworkPanel({ snapshot, reveal }: { snapshot: LinkedInExportSnapshot; reveal: boolean }) {
  const connections = rowsOf(snapshot, "connections");
  const companies = topCompanyCounts(connections);
  const follows = rowsOf(snapshot, "company follows");
  const followedNames = new Set(follows.map((row) => pick(row, "Organization").trim().toLowerCase()).filter(Boolean));
  const overlaps = companies.filter((company) => followedNames.has(company.label.toLowerCase()));
  const max = Math.max(1, ...companies.map((item) => item.count));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-accent-400" />
          <h3 className="text-sm font-semibold text-white">Connections by company</h3>
        </div>
        <div className="space-y-3">
          {companies.map((company) => (
            <div key={company.label}>
              <div className="mb-1 flex justify-between gap-3 text-[11px]">
                <span className="truncate text-slate-300">{company.label}</span>
                <span className="tabular-nums text-slate-500">{company.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div className="h-full rounded-full bg-sky-500/70" style={{ width: `${(company.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-white">Warm intro shortlist</h3>
        <p className="muted mt-1 text-xs">Companies you follow where you already have a connection.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {overlaps.length ? overlaps.map((company) => (
            <span key={company.label} className="chip border-mint-500/20 bg-mint-500/[0.08] text-mint-300">{company.label} · {company.count} connection{company.count === 1 ? "" : "s"}</span>
          )) : <p className="muted text-xs">No overlap found between follows and connections.</p>}
        </div>
        <div className="mt-6">
          <h4 className="label">Company follows</h4>
          <MiniTable rows={follows} columns={["Organization", "Followed On"]} reveal={reveal} empty="No company follows imported." />
        </div>
      </Card>
      <Card className="p-6 xl:col-span-2">
        <h3 className="text-sm font-semibold text-white">Connections</h3>
        <MiniTable rows={connections} columns={["First Name", "Last Name", "Company", "Position", "Connected On"]} reveal={reveal} empty="No connections imported." />
      </Card>
    </div>
  );
}

function LearningPanel({ snapshot, reveal }: { snapshot: LinkedInExportSnapshot; reveal: boolean }) {
  const learning = rowsOf(snapshot, "learning.csv");
  const completed = learning.filter((row) => {
    const value = pick(row, "Content Completed At (if completed)");
    return Boolean(value) && !/^n\/a$/i.test(value);
  }).length;
  const types = new Map<string, number>();
  for (const row of learning) {
    const type = pick(row, "Content Type") || "Other";
    types.set(type, (types.get(type) ?? 0) + 1);
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-white">Learning progress</h3>
        <p className="mt-4 text-4xl font-semibold text-accent-400">{completed}</p>
        <p className="mt-1 text-xs text-slate-500">completed of {learning.length} items</p>
        <div className="mt-5 space-y-2">
          {[...types.entries()].map(([type, count]) => (
            <div key={type} className="flex justify-between text-[11px] text-slate-400">
              <span>{type}</span><span>{count}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-white">Completed courses</h3>
        <MiniTable rows={learning} columns={["Content Title", "Content Type", "Content Completed At (if completed)"]} reveal={reveal} empty="No learning items imported." />
      </Card>
    </div>
  );
}

function ApplicationsPanel({ snapshot, reveal }: { snapshot: LinkedInExportSnapshot; reveal: boolean }) {
  const answers = rowsOf(snapshot, "screening");
  const alerts = rowsOf(snapshot, "savedjobalerts");
  return (
    <div className="space-y-5">
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-white">Saved job alerts</h3>
        <MiniTable rows={alerts} columns={["ALERT_PARAMETERS", "QUERY_CONTEXT", "SAVED_SEARCH_ID"]} reveal={reveal} empty="No saved alerts imported." />
      </Card>
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-white">Screening answer bank</h3>
        <p className="muted mt-1 text-xs">Reusable answers stored locally from your LinkedIn application history.</p>
        <MiniTable rows={answers} columns={["Question", "Answer"]} reveal={reveal} empty="No screening answers imported." maxRows={30} />
      </Card>
    </div>
  );
}

function ActivityPanel({ snapshot, reveal }: { snapshot: LinkedInExportSnapshot; reveal: boolean }) {
  const sections = [
    { title: "Reactions", fragment: "reactions", columns: ["Date", "Type", "Link"] },
    { title: "Comments", fragment: "comments", columns: ["Date", "Message", "Link"] },
    { title: "Shares", fragment: "shares", columns: ["Date", "ShareCommentary", "SharedUrl"] },
    { title: "Votes", fragment: "votes", columns: ["Date", "OptionText", "Link"] },
    { title: "Invitations", fragment: "invitations", columns: ["From", "To", "Sent At", "Direction"] },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {sections.map((section) => (
        <Card key={section.title} className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{section.title}</h3>
          <MiniTable rows={rowsOf(snapshot, section.fragment)} columns={section.columns} reveal={reveal} empty="No rows imported." />
        </Card>
      ))}
    </div>
  );
}

function DataExplorer({
  snapshot,
  table,
  tableId,
  setTableId,
  query,
  setQuery,
  page,
  setPage,
  reveal,
  setReveal,
}: {
  snapshot: LinkedInExportSnapshot;
  table: LinkedInCsvTable | undefined;
  tableId: string;
  setTableId: (id: string) => void;
  query: string;
  setQuery: (value: string) => void;
  page: number;
  setPage: (value: number) => void;
  reveal: boolean;
  setReveal: (value: boolean) => void;
}) {
  const pageSize = 50;
  const filtered = useMemo(() => {
    if (!table) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return table.rows;
    return table.rows.filter((row) => Object.values(row).some((value) => value.toLowerCase().includes(needle)));
  }, [table, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label">CSV table</label>
          <select className="input" value={tableId} onChange={(event) => setTableId(event.target.value)}>
            {snapshot.tables.map((item) => (
              <option key={item.id} value={item.id}>{item.label} · {item.rowCount} rows</option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="label">Filter rows</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this table" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} />
          Reveal private values
        </label>
      </div>

      {table ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="chip border-white/10 bg-white/[0.03] text-slate-300">{table.category}</span>
            <span>{table.columns.length} columns</span>
            <span>·</span>
            <span>{filtered.length.toLocaleString()} matching rows</span>
            {table.warnings.map((warning, index) => <span key={index} className="text-amber-300">· {warning}</span>)}
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-400">
                <tr>{table.columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2.5">{column}</th>)}</tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={Math.max(1, table.columns.length)}>No matching rows.</td></tr>
                ) : visible.map((row, index) => (
                  <tr key={index} className="border-t border-white/[0.05] align-top">
                    {table.columns.map((column) => (
                      <td key={column} className="max-w-xs px-3 py-2 text-slate-300">
                        {displayValue(row[column] ?? "", column, reveal || table.category !== "private")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
            <button className="btn-ghost text-xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <span>Page {safePage + 1} of {pages}</span>
            <button className="btn-ghost text-xs" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        </>
      ) : (
        <p className="muted mt-5 text-xs">No CSV tables were imported.</p>
      )}
    </Card>
  );
}

function PrivacyPanel({
  snapshot,
  reveal,
  setReveal,
}: {
  snapshot: LinkedInExportSnapshot;
  reveal: boolean;
  setReveal: (value: boolean) => void;
}) {
  const privateTables = snapshot.tables.filter((table) => table.category === "private");
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Fingerprint className="h-4 w-4 text-amber-400" /> Sensitive data</h3>
          <p className="muted mt-1.5 max-w-2xl text-xs">
            These files are stored locally and shown in the Data Explorer, but they are never used for career insights,
            job-title ranking, or network suggestions. Private values are masked unless you reveal them.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} />
          Reveal private values
        </label>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {privateTables.map((table) => (
          <div key={table.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-xs font-medium text-slate-200">{table.label}</p>
            <p className="mt-1 text-[10px] text-slate-500">{table.rowCount.toLocaleString()} rows · masked {reveal ? "off" : "on"}</p>
          </div>
        ))}
        {privateTables.length === 0 && <p className="muted text-xs">No sensitive files were detected.</p>}
      </div>
    </Card>
  );
}

function MiniTable({
  rows,
  columns,
  reveal,
  empty,
  maxRows = 12,
}: {
  rows: Array<Record<string, string>>;
  columns: string[];
  reveal: boolean;
  empty: string;
  maxRows?: number;
}) {
  if (!rows.length) return <p className="muted text-xs">{empty}</p>;
  const keys = columns.filter((column) => rows.some((row) => column in row));
  const visibleKeys = keys.length ? keys : Object.keys(rows[0]).slice(0, 5);
  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-white/[0.06]">
      <table className="min-w-full text-left text-[11px]">
        <thead className="sticky top-0 bg-ink-850 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>{visibleKeys.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2">{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, maxRows).map((row, index) => (
            <tr key={index} className="border-t border-white/[0.05] align-top">
              {visibleKeys.map((column) => (
                <td key={column} className="max-w-xs px-3 py-2 text-slate-300">
                  {displayValue(row[column] ?? "", column, reveal)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && <p className="border-t border-white/[0.05] px-3 py-2 text-[10px] text-slate-500">Showing {maxRows} of {rows.length} rows. Use Data explorer for all rows.</p>}
    </div>
  );
}
