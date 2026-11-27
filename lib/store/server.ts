import type {
  AppSettings,
  AtsAnalysisRecord,
  JobDescription,
  KeywordAnalysis,
  LinkedInExportSnapshot,
  Profile,
  ProfileImportPreview,
  ProfileSource,
  TitlesPayload,
} from "@/lib/types";
import type { AppSnapshot, AppStore } from "./contract";

async function readJson<T>(pending: Promise<Response> | Response): Promise<T> {
  const response = await pending;
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

export const serverStore: AppStore = {
  mode: "server",

  async loadAll(): Promise<AppSnapshot> {
    const [profiles, jobs, analyses, settings, titles, linkedin] = await Promise.all([
      fetch("/api/profile").then((r) => r.json()),
      fetch("/api/jobs").then((r) => r.json()),
      fetch("/api/analyses").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/titles").then((r) => r.json()),
      fetch("/api/linkedin").then((r) => r.json()),
    ]);
    return {
      profiles,
      jobs: jobs.jobs ?? [],
      analyses: analyses.analyses ?? [],
      settings: settings.settings,
      titles: titles as TitlesPayload,
      linkedin: (linkedin.linkedin as LinkedInExportSnapshot | null) ?? null,
    };
  },

  async importProfile(files, text): Promise<ProfileImportPreview> {
    const form = new FormData();
    for (const file of files) form.append("file", file);
    if (text.trim()) form.append("text", text);
    const data = await readJson<{ preview: ProfileImportPreview }>(
      fetch("/api/parse/profile", { method: "POST", body: form }),
    );
    return data.preview;
  },

  async saveActiveProfile(profile) {
    await readJson(
      fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      }),
    );
  },

  async resetProfile(source) {
    await readJson(
      fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetFrom: source }),
      }),
    );
  },

  async clearLinkedInExport() {
    await fetch("/api/linkedin", { method: "DELETE" });
  },

  async addJob(title, company, rawText) {
    const data = await readJson<{ job: JobDescription }>(
      fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, company, rawText }),
      }),
    );
    return data.job;
  },

  async removeJob(id) {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
  },

  async clearJobs() {
    await fetch("/api/jobs", { method: "DELETE" });
  },

  async removeAnalysis(id) {
    await fetch(`/api/analyses/${id}`, { method: "DELETE" });
  },

  async clearAnalyses() {
    await fetch("/api/analyses", { method: "DELETE" });
  },

  async refreshTitles() {
    return readJson<TitlesPayload>(fetch("/api/titles/refresh", { method: "POST" }));
  },

  async clearTitles() {
    const data = await readJson<{ data: TitlesPayload }>(fetch("/api/titles", { method: "DELETE" }));
    return data.data;
  },

  async runAnalysis(jobId, source): Promise<AtsAnalysisRecord> {
    const data = await readJson<{ record: AtsAnalysisRecord }>(
      fetch("/api/ats/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, source }),
      }),
    );
    return data.record;
  },

  async analyzeKeywords(rawText: string, source: ProfileSource): Promise<KeywordAnalysis> {
    return readJson<KeywordAnalysis>(
      fetch("/api/analysis/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, source }),
      }),
    );
  },

  async saveSettings(next: AppSettings): Promise<AppSettings> {
    const data = await readJson<{ settings: AppSettings }>(
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }),
    );
    return data.settings;
  },
};
