import type {
  AppSettings,
  AtsAnalysisRecord,
  JobDescription,
  KeywordAnalysis,
  Profile,
  ProfileSource,
  StoredProfile,
  TitlesPayload,
} from "@/lib/types";

export type AppSnapshot = {
  profiles: Record<string, StoredProfile | null>;
  jobs: JobDescription[];
  analyses: AtsAnalysisRecord[];
  settings: AppSettings;
  titles: TitlesPayload;
};

export interface AppStore {
  readonly mode: "server" | "local";
  loadAll(): Promise<AppSnapshot>;
  importProfile(source: "resume" | "linkedin", file: File | null, text: string): Promise<void>;
  saveActiveProfile(profile: Profile): Promise<void>;
  resetProfile(source: ProfileSource): Promise<void>;
  addJob(title: string, company: string, rawText: string): Promise<JobDescription>;
  removeJob(id: string): Promise<void>;
  clearJobs(): Promise<void>;
  removeAnalysis(id: string): Promise<void>;
  clearAnalyses(): Promise<void>;
  refreshTitles(): Promise<TitlesPayload>;
  clearTitles(): Promise<TitlesPayload>;
  runAnalysis(jobId: string, source: ProfileSource): Promise<AtsAnalysisRecord>;
  analyzeKeywords(rawText: string, source: ProfileSource): Promise<KeywordAnalysis>;
  saveSettings(next: AppSettings): Promise<AppSettings>;
  exportBackup?(): string;
  importBackup?(json: string): Promise<void>;
  clearLocalData?(): Promise<void>;
}
