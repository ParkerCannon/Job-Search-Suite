import { aiRecommendations } from "@/lib/ai";
import { analyzeResume, profileToText } from "@/lib/ats/analyze";
import { buildRecommendations as buildAtsRecommendations } from "@/lib/ats/recommend";
import { normalizeJobDiscoverySettings } from "@/lib/jobs/sourceInfo";
import { extractTextFromFileBrowser } from "./files.browser";
import { buildLocalTitles } from "./localTitles";
import {
  DEFAULT_APP_SETTINGS,
  emptyProfile,
  normalizeProfile,
  uid,
  type AiSettings,
  type AppSettings,
  type AtsAnalysisRecord,
  type AtsResult,
  type JobDescription,
  type KeywordAnalysis,
  type Profile,
  type ProfileSource,
  type StoredProfile,
} from "@/lib/types";
import type { AppSnapshot, AppStore } from "./contract";

const STORAGE_KEY = "job-search-suite:v1";
const PROFILE_SOURCES: ProfileSource[] = ["resume", "linkedin", "active"];

type LocalState = {
  profiles: Record<string, StoredProfile | null>;
  jobs: JobDescription[];
  analyses: AtsAnalysisRecord[];
  settings: AppSettings;
  titleRefreshedAt: string | null;
};

type RuntimeSecrets = {
  apiKey: string;
  adzunaApiKey: string;
  usajobsApiKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function emptyState(): LocalState {
  return {
    profiles: { resume: null, linkedin: null, active: null },
    jobs: [],
    analyses: [],
    settings: DEFAULT_APP_SETTINGS,
    titleRefreshedAt: null,
  };
}

function readSettings(value: unknown): AppSettings {
  const input = isRecord(value) ? value : {};
  const ai = isRecord(input.ai) ? input.ai : {};
  const weights = isRecord(input.weights) ? input.weights : {};
  const links = isRecord(input.profileLinks) ? input.profileLinks : {};
  const normalizedWeights: Record<string, number> = { ...DEFAULT_APP_SETTINGS.weights };
  for (const key of Object.keys(normalizedWeights)) {
    const numeric = Number(weights[key]);
    if (Number.isFinite(numeric)) normalizedWeights[key] = numeric;
  }
  return {
    ai: {
      provider: (["none", "ollama", "openai", "anthropic"] as AiSettings["provider"][]).includes(
        ai.provider as AiSettings["provider"],
      )
        ? (ai.provider as AiSettings["provider"])
        : "none",
      baseUrl: asText(ai.baseUrl) || DEFAULT_APP_SETTINGS.ai.baseUrl,
      model: asText(ai.model) || DEFAULT_APP_SETTINGS.ai.model,
      apiKey: asText(ai.apiKey),
    },
    weights: normalizedWeights,
    targetRole: asText(input.targetRole),
    jobDiscovery: normalizeJobDiscoverySettings(input.jobDiscovery),
    profileLinks: { linkedin: asText(links.linkedin), indeed: asText(links.indeed) },
  };
}

function withoutSecrets(settings: AppSettings): AppSettings {
  return {
    ...settings,
    ai: { ...settings.ai, apiKey: "" },
    jobDiscovery: { ...settings.jobDiscovery, adzunaApiKey: "", usajobsApiKey: "" },
  };
}

function withSecrets(settings: AppSettings, secrets: RuntimeSecrets): AppSettings {
  return {
    ...settings,
    ai: { ...settings.ai, apiKey: secrets.apiKey },
    jobDiscovery: {
      ...settings.jobDiscovery,
      adzunaApiKey: secrets.adzunaApiKey,
      usajobsApiKey: secrets.usajobsApiKey,
    },
  };
}

function readSecrets(settings: AppSettings): RuntimeSecrets {
  return {
    apiKey: settings.ai.apiKey,
    adzunaApiKey: settings.jobDiscovery.adzunaApiKey,
    usajobsApiKey: settings.jobDiscovery.usajobsApiKey,
  };
}

function readStoredProfile(value: unknown, source: ProfileSource): StoredProfile | null {
  if (!isRecord(value)) return null;
  return {
    source,
    profile: normalizeProfile(value.profile),
    rawText: asText(value.rawText),
    filename: asText(value.filename),
    updatedAt: asText(value.updatedAt) || new Date().toISOString(),
  };
}

function normalizeState(value: unknown): LocalState {
  const input = isRecord(value) ? value : {};
  const profiles: Record<string, StoredProfile | null> = {};
  const rawProfiles = isRecord(input.profiles) ? input.profiles : {};
  for (const source of PROFILE_SOURCES) {
    profiles[source] = readStoredProfile(rawProfiles[source], source);
  }
  const jobs = (Array.isArray(input.jobs) ? input.jobs : [])
    .filter(isRecord)
    .map((job) => ({
      id: asText(job.id) || uid(),
      title: asText(job.title) || "Untitled role",
      company: asText(job.company),
      rawText: asText(job.rawText),
      createdAt: asText(job.createdAt) || new Date().toISOString(),
    }))
    .filter((job) => job.rawText.trim());
  const analyses = (Array.isArray(input.analyses) ? input.analyses : [])
    .filter(isRecord)
    .map((record) => ({
      id: asText(record.id) || uid(),
      jobId: asText(record.jobId),
      jobTitle: asText(record.jobTitle),
      result: isRecord(record.result) ? (record.result as unknown as AtsResult) : ({} as AtsResult),
      createdAt: asText(record.createdAt) || new Date().toISOString(),
    }))
    .filter((record) => record.jobId && record.result);
  return {
    profiles,
    jobs,
    analyses,
    settings: withoutSecrets(readSettings(input.settings)),
    titleRefreshedAt: typeof input.titleRefreshedAt === "string" ? input.titleRefreshedAt : null,
  };
}

class LocalStore implements AppStore {
  readonly mode = "local" as const;
  private state: LocalState | null = null;
  private secrets: RuntimeSecrets = readSecrets(DEFAULT_APP_SETTINGS);

  private load(): LocalState {
    if (this.state) return this.state;
    let stored: unknown = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = null;
    }
    this.state = normalizeState(stored);
    return this.state;
  }

  private persist(): void {
    const state = this.load();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private settings(): AppSettings {
    return withSecrets(this.load().settings, this.secrets);
  }

  private profile(source: ProfileSource): StoredProfile | null {
    const state = this.load();
    return state.profiles[source] ?? null;
  }

  private currentProfile(): Profile | null {
    return (
      this.profile("active")?.profile ??
      this.profile("resume")?.profile ??
      this.profile("linkedin")?.profile ??
      null
    );
  }

  private titles() {
    const state = this.load();
    return buildLocalTitles(state.jobs, this.currentProfile(), this.settings(), state.titleRefreshedAt);
  }

  async loadAll(): Promise<AppSnapshot> {
    const state = this.load();
    return {
      profiles: state.profiles,
      jobs: state.jobs,
      analyses: state.analyses,
      settings: this.settings(),
      titles: this.titles(),
    };
  }

  async importProfile(source: "resume" | "linkedin", file: File | null, text: string): Promise<void> {
    let rawText = text.trim();
    let filename = source === "resume" ? "Pasted resume" : "Pasted LinkedIn profile";
    if (file && file.size > 0) {
      rawText = await extractTextFromFileBrowser(file);
      filename = file.name;
    }
    if (!rawText.trim()) throw new Error("No text was provided.");

    const { parseResumeText } = await import("@/lib/parse/resume");
    const { parseLinkedInText } = await import("@/lib/parse/linkedin");
    const profile = source === "resume" ? parseResumeText(rawText) : parseLinkedInText(rawText);
    const record: StoredProfile = {
      source,
      profile: normalizeProfile(profile),
      rawText,
      filename,
      updatedAt: new Date().toISOString(),
    };
    const state = this.load();
    state.profiles[source] = record;
    if (!state.profiles.active) {
      state.profiles.active = { ...record, source: "active" };
    }
    state.titleRefreshedAt = null;
    this.persist();
  }

  async saveActiveProfile(profile: Profile): Promise<void> {
    const state = this.load();
    state.profiles.active = {
      source: "active",
      profile: normalizeProfile(profile),
      rawText: "",
      filename: "Edited in app",
      updatedAt: new Date().toISOString(),
    };
    state.titleRefreshedAt = null;
    this.persist();
  }

  async resetProfile(source: ProfileSource): Promise<void> {
    if (source === "active") throw new Error("Choose a source to reset from.");
    const stored = this.profile(source);
    if (!stored) throw new Error(`No ${source} data imported yet.`);
    const state = this.load();
    state.profiles.active = { ...stored, source: "active" };
    state.titleRefreshedAt = null;
    this.persist();
  }

  async addJob(title: string, company: string, rawText: string): Promise<JobDescription> {
    if (!rawText.trim()) throw new Error("Paste a job description first.");
    const job: JobDescription = {
      id: uid(),
      title: title.trim() || "Untitled role",
      company: company.trim(),
      rawText: rawText.trim(),
      createdAt: new Date().toISOString(),
    };
    const state = this.load();
    state.jobs.unshift(job);
    this.persist();
    return job;
  }

  async removeJob(id: string): Promise<void> {
    const state = this.load();
    state.jobs = state.jobs.filter((job) => job.id !== id);
    state.analyses = state.analyses.filter((record) => record.jobId !== id);
    this.persist();
  }

  async clearJobs(): Promise<void> {
    const state = this.load();
    state.jobs = [];
    state.analyses = [];
    state.titleRefreshedAt = null;
    this.persist();
  }

  async removeAnalysis(id: string): Promise<void> {
    const state = this.load();
    state.analyses = state.analyses.filter((record) => record.id !== id);
    this.persist();
  }

  async clearAnalyses(): Promise<void> {
    this.load().analyses = [];
    this.persist();
  }

  async refreshTitles() {
    const state = this.load();
    state.titleRefreshedAt = new Date().toISOString();
    this.persist();
    return this.titles();
  }

  async clearTitles() {
    this.load().titleRefreshedAt = null;
    this.persist();
    return this.titles();
  }

  private storedForAnalysis(source: ProfileSource): StoredProfile {
    const stored = this.profile(source);
    if (!stored || !stored.profile.name && !stored.profile.summary && !stored.profile.experience.length) {
      throw new Error(`No ${source} profile data found. Import a resume or LinkedIn profile first.`);
    }
    return stored;
  }

  private resumeTextFor(source: ProfileSource, stored: StoredProfile): string {
    return source === "resume" && stored.rawText ? stored.rawText : profileToText(stored.profile);
  }

  async runAnalysis(jobId: string, source: ProfileSource): Promise<AtsAnalysisRecord> {
    const state = this.load();
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) throw new Error("Job description not found.");
    const stored = this.storedForAnalysis(source);
    const result = await analyzeResume({
      job,
      profile: stored.profile,
      source,
      rawText: this.resumeTextFor(source, stored),
      settings: this.settings(),
    });
    const record: AtsAnalysisRecord = {
      id: uid(),
      jobId: job.id,
      jobTitle: job.title,
      result,
      createdAt: new Date().toISOString(),
    };
    state.analyses.unshift(record);
    this.persist();
    return record;
  }

  async analyzeKeywords(rawText: string, source: ProfileSource): Promise<KeywordAnalysis> {
    if (!rawText.trim()) throw new Error("Paste a job description first.");
    const stored = this.storedForAnalysis(source);
    const settings = this.settings();
    const profileText = this.resumeTextFor(source, stored);
    const result = await analyzeResume({
      job: { title: "Pasted job description", rawText: rawText.trim() },
      profile: stored.profile,
      source,
      rawText: profileText,
      settings: { ...settings, ai: { ...settings.ai, provider: "none" } },
    });
    const recommendations = buildAtsRecommendations(result, stored.profile, profileText, rawText);
    const aiRecs = await aiRecommendations(settings.ai, {
      jobText: rawText,
      profileText,
      score: result.overall,
      missing: result.missingKeywords.map((item) => item.term),
    });
    return {
      result,
      recommendations: [...recommendations, ...aiRecs],
      jobTitle: "Pasted job description",
      source,
    };
  }

  async saveSettings(next: AppSettings): Promise<AppSettings> {
    const normalized = readSettings(next);
    this.secrets = readSecrets(normalized);
    this.load().settings = withoutSecrets(normalized);
    this.persist();
    return this.settings();
  }

  exportBackup(): string {
    const state = this.load();
    return JSON.stringify(
      {
        format: "job-search-suite-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        note: "Private data. API keys are never included; enter them again after restoring.",
        ...state,
        settings: withoutSecrets(state.settings),
      },
      null,
      2,
    );
  }

  async importBackup(json: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("The selected file is not valid JSON.");
    }
    if (!isRecord(parsed) || (!("format" in parsed) && !("profiles" in parsed))) {
      throw new Error("This is not a Job Search Suite backup file.");
    }
    this.secrets = readSecrets(readSettings(parsed.settings));
    this.state = normalizeState(parsed);
    this.persist();
  }

  async clearLocalData(): Promise<void> {
    window.localStorage.removeItem(STORAGE_KEY);
    this.state = emptyState();
    this.secrets = readSecrets(DEFAULT_APP_SETTINGS);
  }
}

export const localStore = new LocalStore();
