import { buildRecommendations, dedupeListings, scoreListings } from "@/lib/titles/rank";
import { buildProfileSignals } from "@/lib/titles/signals";
import {
  DEFAULT_APP_SETTINGS,
  emptyProfile,
  type AppSettings,
  type JobDescription,
  type JobListing,
  type JobSourceId,
  type JobSourceInfo,
  type Profile,
  type TitleRefreshStatus,
  type TitlesPayload,
} from "@/lib/types";

const LOCAL_SOURCE_ID = "local" as JobSourceId;

const LOCAL_SOURCE: JobSourceInfo = {
  id: LOCAL_SOURCE_ID,
  label: "Saved in this browser",
  description: "Suggestions are derived only from job descriptions you saved locally. No job feed is contacted.",
  attributionUrl: "",
  requiresKey: false,
  enabled: true,
  configured: true,
  reason: "Local-only mode",
};

function titleOf(job: JobDescription): string {
  const fromFirstLine = job.rawText.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  const title = job.title.trim() && job.title.trim() !== "Untitled role" ? job.title.trim() : fromFirstLine;
  return title.slice(0, 140) || "Pasted job description";
}

function toListing(job: JobDescription): JobListing {
  return {
    id: `local:${job.id}`,
    source: LOCAL_SOURCE_ID,
    sourceJobId: job.id,
    title: titleOf(job),
    company: job.company.trim() || "Pasted job",
    location: "",
    url: "",
    attributionUrl: "",
    publishedAt: job.createdAt || null,
    tags: [],
    seniority: "unknown",
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: "unknown",
    salaryText: "",
    matchedTerms: [],
    matchScore: 0,
  };
}

/** Static builds never call a job feed. Suggestions come from saved job text and local profile signals. */
export function buildLocalTitles(
  jobs: JobDescription[],
  profile: Profile | null,
  settings: AppSettings = DEFAULT_APP_SETTINGS,
  lastRefreshedAt: string | null = null,
): TitlesPayload {
  const signals = buildProfileSignals(profile ?? emptyProfile(), settings.targetRole, settings.jobDiscovery.searchKeywords);
  const listings = dedupeListings(scoreListings(jobs.map(toListing), signals, settings.jobDiscovery));
  const hasProfile = Boolean(
    profile?.name || profile?.experience.length || profile?.skills.some((group) => group.items.length),
  );
  const status: TitleRefreshStatus = {
    lastRefreshedAt,
    nextRefreshAt: null,
    stale: false,
    staleReason: jobs.length
      ? ""
      : "Save a job description to see title suggestions in this browser-only build.",
    state: jobs.length ? (hasProfile ? "ok" : "partial") : "empty",
    message: jobs.length
      ? `Derived from ${jobs.length} saved job description${jobs.length === 1 ? "" : "s"}. Live feeds are disabled in this build.`
      : "Nothing to rank yet. Paste a job description and save it, then refresh titles.",
    profileFingerprint: "local",
    sourceStatuses: [{ source: LOCAL_SOURCE_ID, ok: true, count: listings.length, message: "Local only" }],
  };

  return {
    generatedAt: new Date().toISOString(),
    recommendations: buildRecommendations(listings),
    listings,
    totalListings: listings.length,
    sources: [LOCAL_SOURCE],
    status,
  };
}
