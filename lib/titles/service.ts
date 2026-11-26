import { createHash } from "node:crypto";
import {
  getProfile,
  getSettings,
  getTitleRefreshState,
  listScrapedJobs,
  replaceScrapedJobs,
  saveTitleRefreshState,
} from "@/lib/db";
import { fetchListingsFromSources } from "@/lib/jobs/sources";
import { buildSourceInfos, isSourceConfigured } from "@/lib/jobs/sourceInfo";
import { emptyProfile, flattenSkillGroups } from "@/lib/types";
import type { AppSettings, JobListing, TitleRefreshStatus, TitlesPayload } from "@/lib/types";
import { buildRecommendations, dedupeListings, scoreListings } from "./rank";
import { buildProfileSignals, type ProfileSignals } from "./signals";

const CACHE_MS = 24 * 60 * 60 * 1000;

const globalForTitles = globalThis as unknown as { __jssTitleRefresh?: Promise<TitlesPayload> };

async function currentProfile(settings: AppSettings) {
  return (await getProfile("active")) ?? (await getProfile("resume")) ?? (await getProfile("linkedin"));
}

async function profileForDiscovery(settings: AppSettings) {
  const stored = await currentProfile(settings);
  return stored?.profile ?? null;
}

function createFingerprint(signals: ProfileSignals, settings: AppSettings): string {
  const discovery = settings.jobDiscovery;
  const source = JSON.stringify({
    terms: signals.terms,
    titles: signals.titles,
    skillTerms: signals.skillTerms,
    targetRole: settings.targetRole,
    discovery: {
      enabledSources: discovery.enabledSources,
      greenhouseBoards: discovery.greenhouseBoards,
      leverBoards: discovery.leverBoards,
      locationTerms: discovery.locationTerms,
      maxJobsPerSource: discovery.maxJobsPerSource,
      adzunaCountry: discovery.adzunaCountry,
      hasAdzunaKey: Boolean(discovery.adzunaAppId && discovery.adzunaApiKey),
      hasUsaJobsKey: Boolean(discovery.usajobsApiKey),
    },
  });
  return createHash("sha256").update(source).digest("hex").slice(0, 16);
}

async function enrichStatus(
  stored: TitleRefreshStatus,
  settings: AppSettings,
  fingerprint: string,
  listingCount: number,
): Promise<TitleRefreshStatus> {
  const last = stored.lastRefreshedAt ? new Date(stored.lastRefreshedAt).getTime() : 0;
  const nextRefreshAt = last ? new Date(last + CACHE_MS).toISOString() : null;
  const hasProfile = Boolean(await profileForDiscovery(settings));
  let stale = true;
  let staleReason = "No job titles have been discovered yet.";

  if (last) {
    const expired = Date.now() - last >= CACHE_MS;
    const changed = Boolean(stored.profileFingerprint) && stored.profileFingerprint !== fingerprint;
    stale = expired || changed;
    if (changed) staleReason = "Your working profile changed since the last refresh.";
    else if (expired) staleReason = "Cached results are older than 24 hours.";
    else if (!listingCount) staleReason = "No matching listings in the current cache.";
    else stale = false;
  } else if (!hasProfile) {
    staleReason = "Import a resume first to generate job-title recommendations.";
  }

  return { ...stored, nextRefreshAt, stale, staleReason };
}

async function buildPayload(
  listings: JobListing[],
  settings: AppSettings,
  stored: TitleRefreshStatus,
  fingerprint: string,
): Promise<TitlesPayload> {
  return {
    generatedAt: new Date().toISOString(),
    recommendations: buildRecommendations(listings),
    listings,
    totalListings: listings.length,
    sources: buildSourceInfos(settings.jobDiscovery),
    status: await enrichStatus(stored, settings, fingerprint, listings.length),
  };
}

export async function getTitlesPayload(): Promise<TitlesPayload> {
  const settings = await getSettings();
  const profile = await profileForDiscovery(settings);
  const signals = buildProfileSignals(profile ?? emptyProfile(), settings.targetRole);
  const fingerprint = createFingerprint(signals, settings);
  const stored = await getTitleRefreshState();
  return buildPayload(await listScrapedJobs(), settings, stored, fingerprint);
}

async function runRefresh(): Promise<TitlesPayload> {
  const settings = await getSettings();
  const profile = await profileForDiscovery(settings);
  const previous = await getTitleRefreshState();
  const emptySignals = buildProfileSignals(emptyProfile(), settings.targetRole);

  if (!profile || !profile.name && !profile.experience.length && !flattenSkillGroups(profile.skills).length) {
    const state: TitleRefreshStatus = {
      ...previous,
      stale: true,
      staleReason: "Import a resume first to generate job-title recommendations.",
      state: "error",
      message: "No working profile is available.",
      sourceStatuses: [],
    };
    await saveTitleRefreshState(state);
    return buildPayload(await listScrapedJobs(), settings, state, createFingerprint(emptySignals, settings));
  }

  const signals = buildProfileSignals(profile, settings.targetRole);
  const fingerprint = createFingerprint(signals, settings);
  if (!signals.terms.length) {
    const state: TitleRefreshStatus = {
      ...previous,
      stale: true,
      staleReason: "Your profile does not contain usable job keywords yet.",
      state: "error",
      message: "Add a headline, experience, or skills to your working profile.",
      sourceStatuses: [],
    };
    await saveTitleRefreshState(state);
    return buildPayload(await listScrapedJobs(), settings, state, fingerprint);
  }

  const keywords = signals.terms.slice(0, 12).map((term) => term.term);
  const activeIds = buildSourceInfos(settings.jobDiscovery)
    .filter((source) => source.enabled)
    .map((source) => source.id);
  const configuredIds = activeIds.filter((id) => isSourceConfigured(id, settings.jobDiscovery));

  if (!activeIds.length || !configuredIds.length) {
    const state: TitleRefreshStatus = {
      ...previous,
      stale: true,
      staleReason: "No configured job sources are enabled.",
      state: "error",
      message: "Enable a source in Settings. Key-based sources need an API key first.",
      sourceStatuses: [],
    };
    await saveTitleRefreshState(state);
    return buildPayload(await listScrapedJobs(), settings, state, fingerprint);
  }

  const fetched = await fetchListingsFromSources(settings.jobDiscovery, keywords);
  const attempted = fetched.statuses.filter((status) => configuredIds.includes(status.source));
  const succeeded = attempted.filter((status) => status.ok);
  const allFailed = succeeded.length === 0;
  const scored = dedupeListings(scoreListings(fetched.listings, signals, settings.jobDiscovery));
  const listings = allFailed ? await listScrapedJobs() : scored;

  if (!allFailed) await replaceScrapedJobs(scored);

  const attemptedIds = new Set(attempted.map((status) => status.source));
  const partial = succeeded.length > 0 && attempted.some((status) => !status.ok);
  const message = allFailed
    ? "Every enabled source failed. Cached results were kept."
    : partial
      ? "Some sources could not be reached. Results include the sources that responded."
      : `Refreshed from ${succeeded.length} source${succeeded.length === 1 ? "" : "s"}.`;
  const state: TitleRefreshStatus = {
    lastRefreshedAt: allFailed ? previous.lastRefreshedAt : new Date().toISOString(),
    nextRefreshAt: null,
    stale: allFailed,
    staleReason: allFailed ? "The last refresh failed; showing cached results." : "",
    state: allFailed ? "error" : partial ? "partial" : "ok",
    message,
    profileFingerprint: allFailed ? previous.profileFingerprint : fingerprint,
    sourceStatuses: fetched.statuses.filter((status) => attemptedIds.has(status.source) || status.ok),
  };
  await saveTitleRefreshState(state);

  return buildPayload(listings, settings, state, fingerprint);
}

export function refreshTitles(): Promise<TitlesPayload> {
  if (globalForTitles.__jssTitleRefresh) return globalForTitles.__jssTitleRefresh;
  const task = runRefresh().finally(() => {
    delete globalForTitles.__jssTitleRefresh;
  });
  globalForTitles.__jssTitleRefresh = task;
  return task;
}
