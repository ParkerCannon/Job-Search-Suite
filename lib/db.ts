import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_JOB_DISCOVERY_SETTINGS, emptyProfile, normalizeProfile } from "./types";
import { normalizeJobDiscoverySettings } from "./jobs/sourceInfo";
import { normalizeSeniority } from "./jobs/metadata";
import type {
  AtsAnalysisRecord,
  AtsResult,
  AppSettings,
  JobDescription,
  JobListing,
  Profile,
  ProfileSource,
  StoredProfile,
  TitleRefreshStatus,
} from "./types";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "job-search-suite.db");

const globalForDb = globalThis as unknown as { __jssDb?: DatabaseSync };

const db = globalForDb.__jssDb ?? new DatabaseSync(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.__jssDb = db;

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS profiles (
    source TEXT PRIMARY KEY,
    profile TEXT NOT NULL,
    raw_text TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    raw_text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    job_title TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scraped_jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_job_id TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    attribution_url TEXT NOT NULL DEFAULT '',
    published_at TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    seniority TEXT NOT NULL DEFAULT 'unknown',
    salary_min REAL,
    salary_max REAL,
    salary_period TEXT NOT NULL DEFAULT 'unknown',
    salary_text TEXT NOT NULL DEFAULT '',
    matched_terms TEXT NOT NULL DEFAULT '[]',
    match_score REAL NOT NULL DEFAULT 0,
    refreshed_at TEXT NOT NULL,
    UNIQUE(source, source_job_id)
  );
  CREATE INDEX IF NOT EXISTS idx_scraped_jobs_score ON scraped_jobs(match_score DESC);
  CREATE TABLE IF NOT EXISTS title_refresh_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function addColumnIfMissing(name: string, definition: string): void {
  const columns = db.prepare("PRAGMA table_info(scraped_jobs)").all() as { name: string }[];
  if (!columns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE scraped_jobs ADD COLUMN ${name} ${definition}`);
  }
}

addColumnIfMissing("seniority", "TEXT NOT NULL DEFAULT 'unknown'");
addColumnIfMissing("salary_min", "REAL");
addColumnIfMissing("salary_max", "REAL");
addColumnIfMissing("salary_period", "TEXT NOT NULL DEFAULT 'unknown'");
addColumnIfMissing("salary_text", "TEXT NOT NULL DEFAULT ''");

const defaultSettings: AppSettings = {
  ai: { provider: "none", baseUrl: "http://localhost:11434", model: "llama3.1", apiKey: "" },
  weights: {
    keywords: 40,
    skills: 25,
    experience: 15,
    structure: 10,
    achievements: 10,
  },
  targetRole: "",
  jobDiscovery: { ...DEFAULT_JOB_DISCOVERY_SETTINGS },
  profileLinks: { linkedin: "", indeed: "" },
};

function defaultTitleRefreshState(): TitleRefreshStatus {
  return {
    lastRefreshedAt: null,
    nextRefreshAt: null,
    stale: true,
    staleReason: "No job titles have been discovered yet.",
    state: "empty",
    message: "",
    profileFingerprint: "",
    sourceStatuses: [],
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function saveProfile(
  source: ProfileSource,
  profile: Profile,
  rawText: string,
  filename: string,
): StoredProfile {
  const normalized = normalizeProfile(profile);
  const record: StoredProfile = {
    source,
    profile: normalized,
    rawText,
    filename,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO profiles (source, profile, raw_text, filename, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       profile = excluded.profile,
       raw_text = excluded.raw_text,
       filename = excluded.filename,
       updated_at = excluded.updated_at`,
  ).run(source, JSON.stringify(normalized), rawText, filename, record.updatedAt);
  return record;
}

export function getProfile(source: ProfileSource): StoredProfile | null {
  const row = db.prepare("SELECT * FROM profiles WHERE source = ?").get(source) as
    | Record<string, string>
    | undefined;
  if (!row) return null;
  return {
    source: row.source as ProfileSource,
    profile: normalizeProfile(parseJson<Profile>(row.profile, emptyProfile())),
    rawText: row.raw_text,
    filename: row.filename,
    updatedAt: row.updated_at,
  };
}

export function getAllProfiles(): Record<string, StoredProfile | null> {
  return {
    resume: getProfile("resume"),
    linkedin: getProfile("linkedin"),
    active: getProfile("active"),
  };
}

export function createJob(title: string, company: string, rawText: string): JobDescription {
  const job: JobDescription = {
    id: crypto.randomUUID(),
    title: title.trim() || "Untitled role",
    company: company.trim(),
    rawText,
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO jobs (id, title, company, raw_text, created_at) VALUES (?, ?, ?, ?, ?)").run(
    job.id,
    job.title,
    job.company,
    job.rawText,
    job.createdAt,
  );
  return job;
}

export function listJobs(): JobDescription[] {
  const rows = db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as Record<string, string>[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    company: row.company,
    rawText: row.raw_text,
    createdAt: row.created_at,
  }));
}

export function getJob(id: string): JobDescription | null {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, string> | undefined;
  if (!row) return null;
  return { id: row.id, title: row.title, company: row.company, rawText: row.raw_text, createdAt: row.created_at };
}

export function deleteJob(id: string): void {
  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  db.prepare("DELETE FROM analyses WHERE job_id = ?").run(id);
}

export function deleteAnalysis(id: string): void {
  db.prepare("DELETE FROM analyses WHERE id = ?").run(id);
}

export function clearJobs(): void {
  // Analyses belong to jobs, so remove them together.
  db.exec("DELETE FROM analyses; DELETE FROM jobs;");
}

export function clearAnalyses(): void {
  db.prepare("DELETE FROM analyses").run();
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function listScrapedJobs(): JobListing[] {
  const rows = db.prepare("SELECT * FROM scraped_jobs ORDER BY match_score DESC, published_at DESC").all() as Record<
    string,
    string | number | null
  >[];
  return rows.map((row) => ({
    id: String(row.id),
    source: row.source as JobListing["source"],
    sourceJobId: String(row.source_job_id),
    title: String(row.title),
    company: String(row.company ?? ""),
    location: String(row.location ?? ""),
    url: String(row.url ?? ""),
    attributionUrl: String(row.attribution_url ?? ""),
    publishedAt: row.published_at ? String(row.published_at) : null,
    tags: parseJson<string[]>(String(row.tags ?? "[]"), []),
    seniority: normalizeSeniority(row.seniority),
    salaryMin: nullableNumber(row.salary_min),
    salaryMax: nullableNumber(row.salary_max),
    salaryPeriod: String(row.salary_period ?? "unknown") as JobListing["salaryPeriod"],
    salaryText: String(row.salary_text ?? ""),
    matchedTerms: parseJson<string[]>(String(row.matched_terms ?? "[]"), []),
    matchScore: Number(row.match_score ?? 0),
  }));
}

export function replaceScrapedJobs(listings: JobListing[]): void {
  const refreshedAt = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO scraped_jobs (
       id, source, source_job_id, title, company, location, url, attribution_url,
       published_at, tags, seniority, salary_min, salary_max, salary_period,
       salary_text, matched_terms, match_score, refreshed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source = excluded.source,
       source_job_id = excluded.source_job_id,
       title = excluded.title,
       company = excluded.company,
       location = excluded.location,
       url = excluded.url,
       attribution_url = excluded.attribution_url,
       published_at = excluded.published_at,
       tags = excluded.tags,
       seniority = excluded.seniority,
       salary_min = excluded.salary_min,
       salary_max = excluded.salary_max,
       salary_period = excluded.salary_period,
       salary_text = excluded.salary_text,
       matched_terms = excluded.matched_terms,
       match_score = excluded.match_score,
       refreshed_at = excluded.refreshed_at`,
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM scraped_jobs").run();
    for (const listing of listings) {
      insert.run(
        listing.id,
        listing.source,
        listing.sourceJobId,
        listing.title,
        listing.company,
        listing.location,
        listing.url,
        listing.attributionUrl,
        listing.publishedAt,
        JSON.stringify(listing.tags),
        listing.seniority,
        listing.salaryMin,
        listing.salaryMax,
        listing.salaryPeriod,
        listing.salaryText,
        JSON.stringify(listing.matchedTerms),
        listing.matchScore,
        refreshedAt,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function clearScrapedJobs(): void {
  db.exec("DELETE FROM scraped_jobs; DELETE FROM title_refresh_state;");
}

export function getTitleRefreshState(): TitleRefreshStatus {
  const row = db.prepare("SELECT value FROM title_refresh_state WHERE key = 'titles'").get() as
    | { value: string }
    | undefined;
  if (!row) return defaultTitleRefreshState();
  const parsed = parseJson<Partial<TitleRefreshStatus>>(row.value, {});
  return { ...defaultTitleRefreshState(), ...parsed };
}

export function saveTitleRefreshState(state: TitleRefreshStatus): void {
  db.prepare(
    "INSERT INTO title_refresh_state (key, value) VALUES ('titles', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(state));
}

export function saveAnalysis(jobId: string, jobTitle: string, result: AtsResult): AtsAnalysisRecord {
  const record: AtsAnalysisRecord = {
    id: crypto.randomUUID(),
    jobId,
    jobTitle,
    result,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO analyses (id, job_id, job_title, result, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(record.id, jobId, jobTitle, JSON.stringify(result), record.createdAt);
  return record;
}

export function listAnalyses(jobId?: string): AtsAnalysisRecord[] {
  const rows = (jobId
    ? db.prepare("SELECT * FROM analyses WHERE job_id = ? ORDER BY created_at DESC").all(jobId)
    : db.prepare("SELECT * FROM analyses ORDER BY created_at DESC").all()) as Record<string, string>[];
  return rows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    result: parseJson<AtsResult>(row.result, {} as AtsResult),
    createdAt: row.created_at,
  }));
}

export function getSettings(): AppSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'app'").get() as { value: string } | undefined;
  if (!row) return defaultSettings;
  const parsed = parseJson<Partial<AppSettings>>(row.value, {});
  return {
    ai: { ...defaultSettings.ai, ...(parsed.ai ?? {}) },
    weights: { ...defaultSettings.weights, ...(parsed.weights ?? {}) },
    targetRole: parsed.targetRole ?? "",
    jobDiscovery: normalizeJobDiscoverySettings(parsed.jobDiscovery),
    profileLinks: {
      linkedin: typeof parsed.profileLinks?.linkedin === "string" ? parsed.profileLinks.linkedin.trim() : "",
      indeed: typeof parsed.profileLinks?.indeed === "string" ? parsed.profileLinks.indeed.trim() : "",
    },
  };
}

export function saveSettings(settings: AppSettings): AppSettings {
  const normalized: AppSettings = {
    ai: { ...defaultSettings.ai, ...(settings.ai ?? {}) },
    weights: { ...defaultSettings.weights, ...(settings.weights ?? {}) },
    targetRole: settings.targetRole ?? "",
    jobDiscovery: normalizeJobDiscoverySettings(settings.jobDiscovery),
    profileLinks: {
      linkedin: typeof settings.profileLinks?.linkedin === "string" ? settings.profileLinks.linkedin.trim() : "",
      indeed: typeof settings.profileLinks?.indeed === "string" ? settings.profileLinks.indeed.trim() : "",
    },
  };
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(JSON.stringify(normalized));
  return normalized;
}
