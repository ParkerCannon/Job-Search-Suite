import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { DEFAULT_APP_SETTINGS, emptyProfile, normalizeProfile } from "./types";
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
const dbPath = path.join(dataDir, "job-search-suite.db");

const SCHEMA = `
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
`;

const globalForDb = globalThis as unknown as { __jssDbPromise?: Promise<Database> };

let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const wasmPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
    sqlPromise = initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) as unknown as ArrayBuffer });
  }
  return sqlPromise;
}

function persist(db: Database): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmpPath = `${dbPath}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(db.export()));
  fs.renameSync(tmpPath, dbPath);
}

async function createDb(): Promise<Database> {
  const SQL = await getSql();
  fs.mkdirSync(dataDir, { recursive: true });

  const db =
    fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0
      ? new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
      : new SQL.Database();

  db.run(SCHEMA);

  const columns = allRows(db, "PRAGMA table_info(scraped_jobs)");
  const addColumnIfMissing = (name: string, definition: string) => {
    if (!columns.some((column) => column.name === name)) {
      db.run(`ALTER TABLE scraped_jobs ADD COLUMN ${name} ${definition}`);
    }
  };
  addColumnIfMissing("seniority", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing("salary_min", "REAL");
  addColumnIfMissing("salary_max", "REAL");
  addColumnIfMissing("salary_period", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing("salary_text", "TEXT NOT NULL DEFAULT ''");

  persist(db);
  return db;
}

function getDb(): Promise<Database> {
  if (!globalForDb.__jssDbPromise) globalForDb.__jssDbPromise = createDb();
  return globalForDb.__jssDbPromise;
}

function allRows(db: Database, sql: string, params: unknown[] = []): Record<string, any>[] {
  const statement = db.prepare(sql);
  try {
    statement.bind(params as any[]);
    const rows: Record<string, any>[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as Record<string, any>);
    return rows;
  } finally {
    statement.free();
  }
}

function oneRow(db: Database, sql: string, params: unknown[] = []): Record<string, any> | undefined {
  return allRows(db, sql, params)[0];
}

function runSql(db: Database, sql: string, params: unknown[] = []): void {
  db.run(sql, params as any[]);
  persist(db);
}

const defaultSettings: AppSettings = DEFAULT_APP_SETTINGS;

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

function text(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

export async function saveProfile(
  source: ProfileSource,
  profile: Profile,
  rawText: string,
  filename: string,
): Promise<StoredProfile> {
  const db = await getDb();
  const normalized = normalizeProfile(profile);
  const record: StoredProfile = {
    source,
    profile: normalized,
    rawText,
    filename,
    updatedAt: new Date().toISOString(),
  };
  runSql(
    db,
    `INSERT INTO profiles (source, profile, raw_text, filename, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       profile = excluded.profile,
       raw_text = excluded.raw_text,
       filename = excluded.filename,
       updated_at = excluded.updated_at`,
    [source, JSON.stringify(normalized), rawText, filename, record.updatedAt],
  );
  return record;
}

export async function getProfile(source: ProfileSource): Promise<StoredProfile | null> {
  const db = await getDb();
  const row = oneRow(db, "SELECT * FROM profiles WHERE source = ?", [source]);
  if (!row) return null;
  return {
    source: row.source as ProfileSource,
    profile: normalizeProfile(parseJson<Profile>(text(row.profile, "{}"), emptyProfile())),
    rawText: text(row.raw_text),
    filename: text(row.filename),
    updatedAt: text(row.updated_at),
  };
}

export async function getAllProfiles(): Promise<Record<string, StoredProfile | null>> {
  return {
    resume: await getProfile("resume"),
    linkedin: await getProfile("linkedin"),
    active: await getProfile("active"),
  };
}

export async function createJob(title: string, company: string, rawText: string): Promise<JobDescription> {
  const db = await getDb();
  const job: JobDescription = {
    id: randomUUID(),
    title: title.trim() || "Untitled role",
    company: company.trim(),
    rawText,
    createdAt: new Date().toISOString(),
  };
  runSql(db, "INSERT INTO jobs (id, title, company, raw_text, created_at) VALUES (?, ?, ?, ?, ?)", [
    job.id,
    job.title,
    job.company,
    job.rawText,
    job.createdAt,
  ]);
  return job;
}

export async function listJobs(): Promise<JobDescription[]> {
  const db = await getDb();
  return allRows(db, "SELECT * FROM jobs ORDER BY created_at DESC").map((row) => ({
    id: text(row.id),
    title: text(row.title),
    company: text(row.company),
    rawText: text(row.raw_text),
    createdAt: text(row.created_at),
  }));
}

export async function getJob(id: string): Promise<JobDescription | null> {
  const db = await getDb();
  const row = oneRow(db, "SELECT * FROM jobs WHERE id = ?", [id]);
  if (!row) return null;
  return {
    id: text(row.id),
    title: text(row.title),
    company: text(row.company),
    rawText: text(row.raw_text),
    createdAt: text(row.created_at),
  };
}

export async function deleteJob(id: string): Promise<void> {
  const db = await getDb();
  runSql(db, "DELETE FROM jobs WHERE id = ?", [id]);
  runSql(db, "DELETE FROM analyses WHERE job_id = ?", [id]);
}

export async function deleteAnalysis(id: string): Promise<void> {
  const db = await getDb();
  runSql(db, "DELETE FROM analyses WHERE id = ?", [id]);
}

export async function clearJobs(): Promise<void> {
  const db = await getDb();
  runSql(db, "DELETE FROM analyses; DELETE FROM jobs;");
}

export async function clearAnalyses(): Promise<void> {
  const db = await getDb();
  runSql(db, "DELETE FROM analyses");
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listScrapedJobs(): Promise<JobListing[]> {
  const db = await getDb();
  const rows = allRows(db, "SELECT * FROM scraped_jobs ORDER BY match_score DESC, published_at DESC");
  return rows.map((row) => ({
    id: text(row.id),
    source: row.source as JobListing["source"],
    sourceJobId: text(row.source_job_id),
    title: text(row.title),
    company: text(row.company),
    location: text(row.location),
    url: text(row.url),
    attributionUrl: text(row.attribution_url),
    publishedAt: row.published_at ? text(row.published_at) : null,
    tags: parseJson<string[]>(text(row.tags, "[]"), []),
    seniority: normalizeSeniority(row.seniority),
    salaryMin: nullableNumber(row.salary_min),
    salaryMax: nullableNumber(row.salary_max),
    salaryPeriod: text(row.salary_period, "unknown") as JobListing["salaryPeriod"],
    salaryText: text(row.salary_text),
    matchedTerms: parseJson<string[]>(text(row.matched_terms, "[]"), []),
    matchScore: Number(row.match_score ?? 0),
  }));
}

export async function replaceScrapedJobs(listings: JobListing[]): Promise<void> {
  const db = await getDb();
  const refreshedAt = new Date().toISOString();
  const insertSql = `
    INSERT INTO scraped_jobs (
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
      refreshed_at = excluded.refreshed_at`;

  db.run("BEGIN");
  try {
    db.run("DELETE FROM scraped_jobs");
    for (const listing of listings) {
      db.run(insertSql, [
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
      ] as any[]);
    }
    db.run("COMMIT");
    persist(db);
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

export async function clearScrapedJobs(): Promise<void> {
  const db = await getDb();
  runSql(db, "DELETE FROM scraped_jobs; DELETE FROM title_refresh_state;");
}

export async function getTitleRefreshState(): Promise<TitleRefreshStatus> {
  const db = await getDb();
  const row = oneRow(db, "SELECT value FROM title_refresh_state WHERE key = 'titles'");
  if (!row) return defaultTitleRefreshState();
  const parsed = parseJson<Partial<TitleRefreshStatus>>(text(row.value, "{}"), {});
  return { ...defaultTitleRefreshState(), ...parsed };
}

export async function saveTitleRefreshState(state: TitleRefreshStatus): Promise<void> {
  const db = await getDb();
  runSql(
    db,
    "INSERT INTO title_refresh_state (key, value) VALUES ('titles', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(state)],
  );
}

export async function saveAnalysis(
  jobId: string,
  jobTitle: string,
  result: AtsResult,
): Promise<AtsAnalysisRecord> {
  const db = await getDb();
  const record: AtsAnalysisRecord = {
    id: randomUUID(),
    jobId,
    jobTitle,
    result,
    createdAt: new Date().toISOString(),
  };
  runSql(db, "INSERT INTO analyses (id, job_id, job_title, result, created_at) VALUES (?, ?, ?, ?, ?)", [
    record.id,
    jobId,
    jobTitle,
    JSON.stringify(result),
    record.createdAt,
  ]);
  return record;
}

export async function listAnalyses(jobId?: string): Promise<AtsAnalysisRecord[]> {
  const db = await getDb();
  const rows = jobId
    ? allRows(db, "SELECT * FROM analyses WHERE job_id = ? ORDER BY created_at DESC", [jobId])
    : allRows(db, "SELECT * FROM analyses ORDER BY created_at DESC");
  return rows.map((row) => ({
    id: text(row.id),
    jobId: text(row.job_id),
    jobTitle: text(row.job_title),
    result: parseJson<AtsResult>(text(row.result, "{}"), {} as AtsResult),
    createdAt: text(row.created_at),
  }));
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const row = oneRow(db, "SELECT value FROM settings WHERE key = 'app'");
  if (!row) return defaultSettings;
  const parsed = parseJson<Partial<AppSettings>>(text(row.value, "{}"), {});
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

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const db = await getDb();
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
  runSql(db, "INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    JSON.stringify(normalized),
  ]);
  return normalized;
}
