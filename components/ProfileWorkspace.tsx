"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  FileText,
  Linkedin,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { type Profile, type ProfileSource, type StoredProfile } from "@/lib/types";
import { Card, EmptyState, SectionHeader } from "./ui";
import ProfileDocument from "./ProfileDocument";
import ResumeEditor from "./ResumeEditor";
import { useProfileDraft } from "./useProfileDraft";

type Mode = "working" | "resume" | "linkedin" | "compare";

type Props = {
  profiles: Record<string, StoredProfile | null>;
  busy: string | null;
  onSave: (profile: Profile) => Promise<void>;
  onReset: (source: ProfileSource) => Promise<void>;
  onImport: (source: "resume" | "linkedin", file: File | null, text: string) => Promise<void>;
};

export default function ProfileWorkspace({ profiles, busy, onSave, onReset, onImport }: Props) {
  const [mode, setMode] = useState<Mode>("working");
  const [draft, setDraft] = useProfileDraft(profiles.active);

  const hasAny = Boolean(profiles.resume || profiles.linkedin || profiles.active);

  if (!hasAny) {
    return (
      <>
        <SectionHeader eyebrow="Profile" title="Nothing to show yet" description="Import a resume or LinkedIn export to get started." />
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No profile data"
          description="Head back to the overview and upload your resume or LinkedIn data export."
        />
      </>
    );
  }

  const modes: { id: Mode; label: string; icon: typeof FileText }[] = [
    { id: "working", label: "Working profile", icon: Sparkles },
    { id: "resume", label: "Resume", icon: FileText },
    { id: "linkedin", label: "LinkedIn", icon: Linkedin },
    { id: "compare", label: "Compare", icon: ArrowLeftRight },
  ];

  return (
    <>
      <SectionHeader
        eyebrow="Profile workspace"
        title="One profile, two sources"
        description="Your resume and LinkedIn profile are parsed into the same structure. Switch between them, compare the wording, and build a working profile you can edit."
        action={
          mode === "working" ? (
            <button
              className="btn-primary"
              disabled={busy === "profile"}
              onClick={() => void onSave(draft)}
            >
              {busy === "profile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </button>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {modes.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`btn border text-xs ${mode === m.id ? "border-accent-500/40 bg-accent-500/10 text-accent-400" : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-white"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "compare" ? (
        <CompareView profiles={profiles} working={draft} onPick={(path, value) => setDraft((d) => setAtPath(d, path, value))} onSave={() => void onSave(draft)} saving={busy === "profile"} />
      ) : mode === "working" ? (
        <ResumeEditor profile={draft} onChange={setDraft} onReset={onReset} profiles={profiles} busy={busy} />
      ) : (
        <SourceView
          source={mode}
          stored={profiles[mode]}
          onReset={() => void onReset(mode)}
          onImport={onImport}
          busy={busy}
        />
      )}
    </>
  );
}

type Path = string;

function getAtPath(profile: Profile, path: Path): string {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, profile);
  if (Array.isArray(value)) return value.length ? `${value.length} entries` : "—";
  return typeof value === "string" && value ? value : "—";
}

function setAtPath(profile: Profile, path: Path, value: string): Profile {
  const next = structuredClone(profile);
  const keys = path.split(".");
  let target: Record<string, unknown> = next as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    if (target[key] && typeof target[key] === "object") target = target[key] as Record<string, unknown>;
  }
  target[keys.at(-1)!] = value;
  return next;
}

const COMPARE_FIELDS: { label: string; path: Path }[] = [
  { label: "Name", path: "name" },
  { label: "Headline", path: "headline" },
  { label: "Summary", path: "summary" },
  { label: "Experience", path: "experience" },
  { label: "Education", path: "education" },
  { label: "Skills", path: "skills" },
  { label: "Certifications", path: "certifications" },
  { label: "Projects", path: "projects" },
  { label: "Email", path: "email" },
  { label: "Phone", path: "phone" },
  { label: "Location", path: "location" },
];

function CompareView({
  profiles,
  working,
  onPick,
  onSave,
  saving,
}: {
  profiles: Record<string, StoredProfile | null>;
  working: Profile;
  onPick: (path: Path, value: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-slate-400">
        <ArrowLeftRight className="h-4 w-4 text-accent-400" />
        Pick a value from either source to copy it into your working profile, then save.
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[130px_1fr_1fr] border-b border-white/[0.07] bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <div className="p-4">Field</div>
          <div className="border-l border-white/[0.07] p-4">Resume</div>
          <div className="border-l border-white/[0.07] p-4">LinkedIn</div>
        </div>
        {COMPARE_FIELDS.map((field) => {
          const resume = profiles.resume?.profile ? getAtPath(profiles.resume.profile, field.path) : "—";
          const linkedin = profiles.linkedin?.profile ? getAtPath(profiles.linkedin.profile, field.path) : "—";
          const current = getAtPath(working, field.path);
          return (
            <div key={field.path} className="grid grid-cols-[130px_1fr_1fr] border-b border-white/[0.05] last:border-0">
              <div className="p-4 text-xs font-medium text-slate-400">{field.label}</div>
              {[
                { value: resume, available: Boolean(profiles.resume) },
                { value: linkedin, available: Boolean(profiles.linkedin) },
              ].map((cell, i) => {
                const selectable = cell.available && cell.value !== "—" && cell.value !== current;
                return (
                  <div key={i} className="border-l border-white/[0.05] p-3">
                    <div className="flex items-start gap-2">
                      <p className={`min-w-0 flex-1 text-xs leading-relaxed ${cell.value === "—" ? "text-slate-600" : "text-slate-200"}`}>
                        {cell.value.length > 220 ? `${cell.value.slice(0, 220)}…` : cell.value}
                      </p>
                      {selectable && (
                        <button
                          onClick={() => onPick(field.path, cell.value)}
                          className="shrink-0 rounded-md bg-accent-500/10 px-2 py-1 text-[10px] font-semibold text-accent-400 hover:bg-accent-500/20"
                          title="Copy into working profile"
                        >
                          Use
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </Card>
      <div className="mt-5 flex justify-end">
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save working profile
        </button>
      </div>
    </div>
  );
}

function SourceView({
  source,
  stored,
  onReset,
  onImport,
  busy,
}: {
  source: "resume" | "linkedin";
  stored: StoredProfile | null | undefined;
  onReset: () => void;
  onImport: (source: "resume" | "linkedin", file: File | null, text: string) => Promise<void>;
  busy: string | null;
}) {
  if (!stored) {
    return (
      <EmptyState
        icon={source === "resume" ? <FileText className="h-5 w-5" /> : <Linkedin className="h-5 w-5" />}
        title={`No ${source === "resume" ? "resume" : "LinkedIn"} imported`}
        description="Upload the file on the overview page to see it here."
      />
    );
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <p className="text-xs text-slate-400">
          Showing <span className="font-medium text-slate-200">{stored.filename}</span> · parsed {new Date(stored.updatedAt).toLocaleString()}
        </p>
        <button className="btn-ghost text-xs" onClick={onReset} disabled={busy === "reset"}>
          <RotateCcw className="h-3.5 w-3.5" /> Use as working profile
        </button>
      </div>
      <ProfileDocument profile={stored.profile} />
    </div>
  );
}


