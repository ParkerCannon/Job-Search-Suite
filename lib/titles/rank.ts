import { normalize } from "@/lib/ats/keywords";
import { annualSalaryRange } from "@/lib/jobs/metadata";
import type {
  JobDiscoverySettings,
  JobListing,
  TitleFilters,
  TitleRecommendation,
} from "@/lib/types";
import type { ProfileSignals } from "./signals";

const MIN_LISTING_SCORE = 1.5;

const SENIORITY_PENALTIES: { pattern: RegExp; penalty: number }[] = [
  { pattern: /\b(chief|executive|vp|vice president)\b/, penalty: 7 },
  { pattern: /\b(director|head)\b/, penalty: 6 },
  { pattern: /\b(principal|staff)\b/, penalty: 4 },
  { pattern: /\b(lead|senior)\b/, penalty: 2.5 },
  { pattern: /\b(intern|internship)\b/, penalty: 5 },
];

const GROUP_NOISE = new Set([
  "remote",
  "hybrid",
  "onsite",
  "on site",
  "full time",
  "part time",
  "contract",
  "contractor",
  "temporary",
  "permanent",
]);

function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

export function titleKey(title: string): string {
  const cleaned = normalize(title)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ");
  const words = cleaned
    .split(/\s+/)
    .filter((word) => word && !GROUP_NOISE.has(word))
    .join(" ");
  return words.replace(/\s+/g, " ").trim();
}

function displayTitle(title: string): string {
  return title
    .replace(/\s*[([].*?[)\]]\s*/g, " ")
    .replace(/\s+[-–—]\s+(remote|hybrid|on.?site|full.?time|part.?time|contract).*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function locationAliases(term: string): string[] {
  const aliases: Record<string, string[]> = {
    usa: ["united states", "u s a", "u s", "us"],
    us: ["united states", "u s a", "u s", "usa"],
    uk: ["united kingdom", "great britain"],
    ny: ["new york"],
    ca: ["california", "canada"],
    dc: ["district of columbia", "washington"],
    sf: ["san francisco"],
    la: ["los angeles"],
    apac: ["asia pacific"],
    worldwide: ["anywhere", "global"],
  };
  return [term, ...(aliases[term] ?? [])];
}

function splitLocationTerms(value: string): string[] {
  return value
    .split(/[,;|]|\bor\b/i)
    .map((term) => term.trim())
    .filter(Boolean);
}

function matchesLocationTerms(listing: JobListing, terms: string[]): boolean {
  if (!terms.length) return true;
  const location = normalize(listing.location);
  const title = normalize(listing.title);
  return terms.some((raw) => {
    const term = normalize(raw);
    if (!term) return false;
    if (term === "remote") return true;
    return locationAliases(term).some(
      (alias) => alias.length >= 2 && (location.includes(alias) || title.includes(alias)),
    );
  });
}

export function passesLocationFilter(listing: JobListing, terms: string[]): boolean {
  return matchesLocationTerms(listing, terms);
}

export function matchesLocationQuery(listing: JobListing, query: string): boolean {
  return matchesLocationTerms(listing, splitLocationTerms(query));
}

export function hasActiveTitleFilters(filters: TitleFilters): boolean {
  return Boolean(
    filters.location.trim() ||
      filters.seniority !== "all" ||
      filters.minPay !== null ||
      filters.maxPay !== null,
  );
}

export function filterJobListings(listings: JobListing[], filters: TitleFilters): JobListing[] {
  const hasPayRange = filters.minPay !== null || filters.maxPay !== null;
  const low = Math.min(filters.minPay ?? Number.POSITIVE_INFINITY, filters.maxPay ?? Number.POSITIVE_INFINITY);
  const high = Math.max(filters.minPay ?? 0, filters.maxPay ?? Number.POSITIVE_INFINITY);

  return listings.filter((listing) => {
    if (!matchesLocationQuery(listing, filters.location)) return false;
    if (filters.seniority !== "all" && listing.seniority !== filters.seniority) return false;
    if (!hasPayRange) return true;

    const range = annualSalaryRange(listing);
    if (range.min === null && range.max === null) return filters.includeUnknownPay;
    const listingLow = range.min ?? range.max!;
    const listingHigh = range.max ?? range.min!;
    if (Number.isFinite(low) && listingHigh < low) return false;
    if (high > 0 && listingLow > high) return false;
    return true;
  });
}

function recencyBonus(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const ageDays = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < -1) return 0;
  if (ageDays <= 7) return 2.5;
  if (ageDays <= 30) return 1.2;
  if (ageDays <= 90) return 0.4;
  return 0;
}

export function scoreListings(
  listings: JobListing[],
  signals: ProfileSignals,
  settings: JobDiscoverySettings,
): JobListing[] {
  const signalTitles = signals.titles.map(titleKey).filter(Boolean);
  const profileIsSenior = signals.titles.some((title) =>
    /\b(senior|lead|principal|staff|director|head|chief|executive|vp)\b/i.test(title),
  );

  return listings
    .filter((listing) => passesLocationFilter(listing, settings.locationTerms))
    .map((listing) => {
      const title = normalize(listing.title);
      const tags = normalize(listing.tags.join(" "));
      const key = titleKey(listing.title);
      const matched: string[] = [];
      let score = 0;

      for (const signal of signals.terms) {
        const term = normalize(signal.term);
        if (!term) continue;
        if (containsPhrase(title, term)) {
          score += signal.weight * 1.6;
          matched.push(signal.term);
        } else if (containsPhrase(tags, term)) {
          score += signal.weight * 0.45;
          matched.push(signal.term);
        }
      }

      for (const skill of signals.skillTerms) {
        if (containsPhrase(title, normalize(skill))) {
          score += 2.5;
          matched.push(skill);
        }
      }

      for (const signalTitle of signalTitles) {
        if (!signalTitle || !key) continue;
        if (key === signalTitle) score += 9;
        else if (key.includes(signalTitle) || signalTitle.includes(key)) score += 3.5;
      }

      score += recencyBonus(listing.publishedAt);

      if (!profileIsSenior) {
        const penalty = SENIORITY_PENALTIES.find((entry) => entry.pattern.test(title))?.penalty ?? 0;
        score -= penalty;
      }

      return {
        ...listing,
        matchedTerms: [...new Set(matched)].slice(0, 8),
        matchScore: Math.round(score * 10) / 10,
      };
    })
    .filter((listing) => listing.matchScore >= MIN_LISTING_SCORE)
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function dedupeListings(listings: JobListing[]): JobListing[] {
  const best = new Map<string, JobListing>();
  for (const listing of listings) {
    const existing = best.get(listing.id);
    if (!existing || listing.matchScore > existing.matchScore) best.set(listing.id, listing);
  }
  return [...best.values()].sort((a, b) => b.matchScore - a.matchScore);
}

export function buildRecommendations(listings: JobListing[], limit = 12): TitleRecommendation[] {
  type Group = {
    samples: JobListing[];
    matched: Map<string, number>;
    sources: Set<JobListing["source"]>;
    latestAt: string | null;
    maxScore: number;
    count: number;
  };
  const groups = new Map<string, Group>();

  for (const listing of [...listings].sort((a, b) => b.matchScore - a.matchScore)) {
    const key = titleKey(listing.title);
    if (!key) continue;
    const group: Group = groups.get(key) ?? {
      samples: [],
      matched: new Map<string, number>(),
      sources: new Set<JobListing["source"]>(),
      latestAt: null,
      maxScore: 0,
      count: 0,
    };
    group.count += 1;
    if (group.samples.length < 4) group.samples.push(listing);
    for (const term of listing.matchedTerms) {
      group.matched.set(term, (group.matched.get(term) ?? 0) + listing.matchScore);
    }
    group.sources.add(listing.source);
    group.maxScore = Math.max(group.maxScore, listing.matchScore);
    if (listing.publishedAt && (!group.latestAt || listing.publishedAt > group.latestAt)) {
      group.latestAt = listing.publishedAt;
    }
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const titleCounts = new Map<string, number>();
      for (const sample of group.samples) {
        const label = displayTitle(sample.title) || sample.title;
        titleCounts.set(label, (titleCounts.get(label) ?? 0) + 1);
      }
      const title = [...titleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key;
      const matchedTerms = [...group.matched.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([term]) => term)
        .slice(0, 5);
      const score = group.maxScore + Math.log2(group.count + group.maxScore + 1) * 1.8 + group.sources.size * 0.5;
      const reason = matchedTerms.length
        ? `Matches your background in ${matchedTerms.join(", ")}.`
        : "Title is similar to roles on your profile.";

      return {
        title,
        normalizedTitle: key,
        score: Math.round(score * 10) / 10,
        reason,
        matchedTerms,
        listingCount: group.count,
        sources: [...group.sources],
        latestAt: group.latestAt,
        samples: group.samples,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
