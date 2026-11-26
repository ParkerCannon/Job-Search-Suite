import { JOB_SOURCE_META, isSourceConfigured } from "@/lib/jobs/sourceInfo";
import {
  deriveSeniority,
  parseSalaryText,
  salaryFromBounds,
  type ParsedSalary,
} from "@/lib/jobs/metadata";
import type { JobDiscoverySettings, JobListing, JobSourceId, SourceStatus } from "@/lib/types";

export interface SourceFetchResult {
  listings: JobListing[];
  statuses: SourceStatus[];
}

type JsonRecord = Record<string, unknown>;

const MAX_RESPONSE_BYTES = 12_000_000;
const ADZUNA_COUNTRIES = new Set(["us", "gb", "ca", "au", "de", "fr", "in", "nl", "nz"]);

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeUrl(value: unknown, fallback: string): string {
  const url = asString(value) || fallback;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

function toIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function cleanTags(value: unknown): string[] {
  return asArray(value)
    .map((tag) => asString(tag))
    .filter(Boolean)
    .slice(0, 12);
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function usaJobsSalary(value: unknown): ParsedSalary {
  for (const entry of asArray(value)) {
    const remuneration = asRecord(entry);
    const min = positiveNumber(remuneration.MinimumRange);
    const max = positiveNumber(remuneration.MaximumRange);
    if (min !== null || max !== null) {
      return salaryFromBounds(min, max, remuneration.RateIntervalCode);
    }
  }
  return { min: null, max: null, period: "unknown", text: "" };
}

function makeListing(input: {
  source: JobSourceId;
  sourceJobId: unknown;
  title: unknown;
  company: unknown;
  location: unknown;
  url: unknown;
  publishedAt: unknown;
  tags?: unknown;
  seniority?: unknown;
  salary?: ParsedSalary | null;
}): JobListing | null {
  const title = asString(input.title).replace(/\s+/g, " ");
  if (!title || title.length > 160) return null;
  const sourceJobId = String(input.sourceJobId ?? "").trim();
  if (!sourceJobId) return null;
  const fallbackUrl = `${JOB_SOURCE_META[input.source].attributionUrl.replace(/\/$/, "")}/`;
  const tags = cleanTags(input.tags);
  const salary = input.salary ?? { min: null, max: null, period: "unknown", text: "" };
  const salaryText = salary.text.slice(0, 120);

  return {
    id: `${input.source}:${sourceJobId}`,
    source: input.source,
    sourceJobId,
    title,
    company: asString(input.company).slice(0, 120) || "Unknown company",
    location: asString(input.location).slice(0, 120),
    url: safeUrl(input.url, fallbackUrl),
    attributionUrl: JOB_SOURCE_META[input.source].attributionUrl,
    publishedAt: toIso(input.publishedAt),
    tags,
    seniority: deriveSeniority(title, input.seniority, tags),
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryPeriod: salary.period,
    salaryText,
    matchedTerms: [],
    matchScore: 0,
  };
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "JobSearchSuite/0.1 (local job-title discovery)");
  }
  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Feed response was too large");
  return JSON.parse(text) as unknown;
}

function cleanBoardToken(value: string): string | null {
  const token = value.trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(token) ? token : null;
}

async function fetchGreenhouse(tokens: string[], limit: number): Promise<JobListing[]> {
  const listings: JobListing[] = [];
  for (const raw of tokens) {
    const token = cleanBoardToken(raw);
    if (!token) continue;
    const data = asRecord(
      await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=false`),
    );
    for (const item of asArray(data.jobs)) {
      const job = asRecord(item);
      const location = asRecord(job.location);
      const listing = makeListing({
        source: "greenhouse",
        sourceJobId: asString(job.id) || asString(job.internal_job_id),
        title: job.title,
        company: asString(job.company_name) || token,
        location: location.name,
        url: job.absolute_url,
        publishedAt: job.first_published ?? job.updated_at,
      });
      if (listing) listings.push(listing);
      if (listings.length >= limit) return listings;
    }
  }
  return listings;
}

async function fetchLever(tokens: string[], limit: number): Promise<JobListing[]> {
  const listings: JobListing[] = [];
  for (const raw of tokens) {
    const token = cleanBoardToken(raw);
    if (!token) continue;
    const data = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
    for (const item of asArray(data)) {
      const job = asRecord(item);
      const categories = asRecord(job.categories);
      const urls = asRecord(job.urls);
      const listing = makeListing({
        source: "lever",
        sourceJobId: asString(job.id) || asString(job.text),
        title: job.text,
        company: token,
        location: categories.location ?? asArray(categories.allLocations)[0],
        url: asString(job.hostUrl) && urls.apply ? urls.apply : job.hostUrl,
        publishedAt: job.createdAt,
        tags: [categories.commitment, categories.team].filter(Boolean),
        seniority: categories.level ?? categories.seniority,
      });
      if (listing) listings.push(listing);
      if (listings.length >= limit) return listings;
    }
  }
  return listings;
}

async function fetchRemotive(limit: number): Promise<JobListing[]> {
  const data = asRecord(await fetchJson(`https://remotive.com/api/remote-jobs?limit=${limit}`));
  return asArray(data.jobs)
    .map((item) => {
      const job = asRecord(item);
      return makeListing({
        source: "remotive",
        sourceJobId: job.id ?? job.url,
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location || "Remote",
        url: job.url,
        publishedAt: job.publication_date,
        tags: job.tags,
        salary: parseSalaryText(job.salary),
      });
    })
    .filter((item): item is JobListing => Boolean(item))
    .slice(0, limit);
}

async function fetchRemoteOk(limit: number): Promise<JobListing[]> {
  const data = await fetchJson("https://remoteok.com/api");
  return asArray(data)
    .map((item) => {
      const job = asRecord(item);
      if (!asString(job.position)) return null;
      const slug = asString(job.slug) || asString(job.id);
      return makeListing({
        source: "remoteok",
        sourceJobId: job.id ?? slug,
        title: job.position,
        company: job.company,
        location: asString(job.location) || "Remote",
        url: job.url ?? (slug ? `https://remoteok.com/remote-jobs/${slug}` : ""),
        publishedAt: job.epoch ?? job.date,
        tags: job.tags,
        salary: salaryFromBounds(positiveNumber(job.salary_min), positiveNumber(job.salary_max)),
      });
    })
    .filter((item): item is JobListing => Boolean(item))
    .slice(0, limit);
}

async function fetchJobicy(limit: number): Promise<JobListing[]> {
  const data = asRecord(await fetchJson(`https://jobicy.com/api/v2/remote-jobs?count=${limit}`));
  return asArray(data.jobs)
    .map((item) => {
      const job = asRecord(item);
      return makeListing({
        source: "jobicy",
        sourceJobId: job.id ?? job.url,
        title: job.jobTitle,
        company: job.companyName,
        location: job.jobGeo || "Remote",
        url: job.url,
        publishedAt: job.pubDate,
        tags: asArray(job.jobIndustry).concat(asArray(job.jobType)),
        seniority: job.jobLevel,
      });
    })
    .filter((item): item is JobListing => Boolean(item))
    .slice(0, limit);
}

async function fetchAdzuna(settings: JobDiscoverySettings, keywords: string[]): Promise<JobListing[]> {
  const country = ADZUNA_COUNTRIES.has(settings.adzunaCountry) ? settings.adzunaCountry : "us";
  const params = new URLSearchParams({
    app_id: settings.adzunaAppId,
    app_key: settings.adzunaApiKey,
    results_per_page: String(settings.maxJobsPerSource),
    what: keywords.slice(0, 4).join(" "),
    "content-type": "application/json",
  });
  const data = asRecord(
    await fetchJson(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`),
  );
  return asArray(data.results)
    .map((item) => {
      const job = asRecord(item);
      const company = asRecord(job.company);
      const location = asRecord(job.location);
      return makeListing({
        source: "adzuna",
        sourceJobId: job.job_id ?? job.redirect_url,
        title: job.job_title,
        company: company.display_name,
        location: location.display_name,
        url: job.redirect_url,
        publishedAt: job.created,
        salary: salaryFromBounds(
          positiveNumber(job.salary_min),
          positiveNumber(job.salary_max),
          undefined,
          job.salary_is_predicted === true || asString(job.salary_is_predicted) === "1",
        ),
      });
    })
    .filter((item): item is JobListing => Boolean(item))
    .slice(0, settings.maxJobsPerSource);
}

async function fetchUsaJobs(settings: JobDiscoverySettings, keywords: string[]): Promise<JobListing[]> {
  const params = new URLSearchParams({
    Keyword: keywords.slice(0, 4).join(" "),
    ResultsPerPage: String(settings.maxJobsPerSource),
    SortBy: "PublicationStartDate",
  });
  const data = asRecord(
    await fetchJson(`https://api.usajobs.gov/api/Search?${params.toString()}`, {
      headers: {
        Authorization: settings.usajobsApiKey,
      },
    }),
  );
  const searchResult = asRecord(data.SearchResult);
  return asArray(searchResult.SearchResultItems)
    .map((item) => {
      const wrapper = asRecord(item);
      const job = asRecord(wrapper.MatchedObjectDescriptor);
      const locations = asArray(job.PositionLocationDisplay)
        .map((value) => asString(value))
        .filter(Boolean);
      return makeListing({
        source: "usajobs",
        sourceJobId: job.PositionID ?? job.DetailPageURL,
        title: job.PositionTitle,
        company: job.OrganizationName,
        location: locations[0] ?? "",
        url: job.DetailPageURL,
        publishedAt: job.PublicationStartDate,
        seniority: job.PositionSchedule ?? job.EmploymentType,
        salary: usaJobsSalary(job.PositionRemuneration),
      });
    })
    .filter((item): item is JobListing => Boolean(item))
    .slice(0, settings.maxJobsPerSource);
}

export async function fetchListingsFromSources(
  settings: JobDiscoverySettings,
  keywords: string[],
): Promise<SourceFetchResult> {
  const statuses: SourceStatus[] = [];
  const grouped: JobListing[] = [];

  for (const info of Object.keys(JOB_SOURCE_META) as JobSourceId[]) {
    const enabled = settings.enabledSources.includes(info);
    const configured = isSourceConfigured(info, settings);
    if (!enabled || !configured) {
      statuses.push({
        source: info,
        ok: false,
        count: 0,
        message: !enabled ? "Disabled." : JOB_SOURCE_META[info].configHint,
      });
      continue;
    }

    try {
      let listings: JobListing[] = [];
      switch (info) {
        case "greenhouse":
          listings = await fetchGreenhouse(settings.greenhouseBoards, settings.maxJobsPerSource);
          break;
        case "lever":
          listings = await fetchLever(settings.leverBoards, settings.maxJobsPerSource);
          break;
        case "remotive":
          listings = await fetchRemotive(settings.maxJobsPerSource);
          break;
        case "remoteok":
          listings = await fetchRemoteOk(settings.maxJobsPerSource);
          break;
        case "jobicy":
          listings = await fetchJobicy(settings.maxJobsPerSource);
          break;
        case "adzuna":
          listings = await fetchAdzuna(settings, keywords);
          break;
        case "usajobs":
          listings = await fetchUsaJobs(settings, keywords);
          break;
      }
      grouped.push(...listings);
      statuses.push({
        source: info,
        ok: true,
        count: listings.length,
        message: listings.length ? `${listings.length} listing${listings.length === 1 ? "" : "s"} read.` : "No matching listings returned.",
      });
    } catch (error) {
      statuses.push({
        source: info,
        ok: false,
        count: 0,
        message: error instanceof Error ? error.message : "Feed request failed.",
      });
    }
  }

  return { listings: grouped, statuses };
}
