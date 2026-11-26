import {
  DEFAULT_JOB_DISCOVERY_SETTINGS,
  JOB_SOURCE_IDS,
  type JobDiscoverySettings,
  type JobSourceId,
  type JobSourceInfo,
} from "@/lib/types";

type SourceMeta = {
  label: string;
  description: string;
  attributionUrl: string;
  requiresKey: boolean;
  configHint: string;
};

export const JOB_SOURCE_META: Record<JobSourceId, SourceMeta> = {
  greenhouse: {
    label: "Greenhouse",
    description: "Public job boards hosted by Greenhouse. Add one board token per company.",
    attributionUrl: "https://boards-api.greenhouse.io/",
    requiresKey: false,
    configHint: "Add at least one Greenhouse board token, e.g. stripe.",
  },
  lever: {
    label: "Lever",
    description: "Public postings from Lever-powered career pages. Add one board token per company.",
    attributionUrl: "https://api.lever.co/",
    requiresKey: false,
    configHint: "Add at least one Lever board token, e.g. netlify.",
  },
  remotive: {
    label: "Remotive",
    description: "Public remote-job feed. Listing links and source credit are shown in the UI.",
    attributionUrl: "https://remotive.com/remote-jobs",
    requiresKey: false,
    configHint: "Ready to use.",
  },
  remoteok: {
    label: "Remote OK",
    description: "Public remote-job feed. Listing links and source credit are shown in the UI.",
    attributionUrl: "https://remoteok.com/",
    requiresKey: false,
    configHint: "Ready to use.",
  },
  jobicy: {
    label: "Jobicy",
    description: "Public remote-job feed. Listing links and source credit are shown in the UI.",
    attributionUrl: "https://jobicy.com/",
    requiresKey: false,
    configHint: "Ready to use.",
  },
  adzuna: {
    label: "Adzuna",
    description: "Keyword-based job search. Only resume-derived search keywords are sent.",
    attributionUrl: "https://www.adzuna.com/",
    requiresKey: true,
    configHint: "Add an Adzuna application ID and API key.",
  },
  usajobs: {
    label: "USAJOBS",
    description: "U.S. federal job search. Only resume-derived search keywords are sent.",
    attributionUrl: "https://www.usajobs.gov/",
    requiresKey: true,
    configHint: "Add a USAJOBS API key.",
  },
};

const stringList = (value: unknown, limit = 30): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, limit)
    : [];

export function normalizeJobDiscoverySettings(value: unknown): JobDiscoverySettings {
  const source = (value ?? {}) as Partial<JobDiscoverySettings>;
  const enabledSources = stringList(source.enabledSources).filter((id): id is JobSourceId =>
    JOB_SOURCE_IDS.includes(id as JobSourceId),
  );
  const maxJobs = Number(source.maxJobsPerSource);
  const country = typeof source.adzunaCountry === "string" ? source.adzunaCountry.trim().toLowerCase() : "";

  return {
    enabledSources: enabledSources.length
      ? [...new Set(enabledSources)]
      : [...DEFAULT_JOB_DISCOVERY_SETTINGS.enabledSources],
    greenhouseBoards: stringList(source.greenhouseBoards),
    leverBoards: stringList(source.leverBoards),
    locationTerms: stringList(source.locationTerms, 15),
    maxJobsPerSource: Number.isFinite(maxJobs)
      ? Math.min(200, Math.max(20, Math.round(maxJobs)))
      : DEFAULT_JOB_DISCOVERY_SETTINGS.maxJobsPerSource,
    adzunaAppId: typeof source.adzunaAppId === "string" ? source.adzunaAppId.trim() : "",
    adzunaApiKey: typeof source.adzunaApiKey === "string" ? source.adzunaApiKey.trim() : "",
    adzunaCountry: /^[a-z]{2}$/.test(country) ? country : DEFAULT_JOB_DISCOVERY_SETTINGS.adzunaCountry,
    usajobsApiKey: typeof source.usajobsApiKey === "string" ? source.usajobsApiKey.trim() : "",
  };
}

export function isSourceConfigured(id: JobSourceId, settings: JobDiscoverySettings): boolean {
  switch (id) {
    case "greenhouse":
      return settings.greenhouseBoards.length > 0;
    case "lever":
      return settings.leverBoards.length > 0;
    case "adzuna":
      return Boolean(settings.adzunaAppId && settings.adzunaApiKey);
    case "usajobs":
      return Boolean(settings.usajobsApiKey);
    default:
      return true;
  }
}

export function buildSourceInfos(settings: JobDiscoverySettings): JobSourceInfo[] {
  return JOB_SOURCE_IDS.map((id) => {
    const meta = JOB_SOURCE_META[id];
    const enabled = settings.enabledSources.includes(id);
    const configured = isSourceConfigured(id, settings);
    let reason = meta.configHint;
    if (!enabled) reason = "Disabled in Settings.";
    else if (!configured) reason = meta.configHint;
    else if (meta.requiresKey) reason = "Ready to use with the configured key.";
    else if (id === "greenhouse" || id === "lever") reason = `Ready with ${settings[id === "greenhouse" ? "greenhouseBoards" : "leverBoards"].length} board token(s).`;
    else reason = "Ready to use.";

    return {
      id,
      label: meta.label,
      description: meta.description,
      attributionUrl: meta.attributionUrl,
      requiresKey: meta.requiresKey,
      enabled,
      configured,
      reason,
    };
  });
}
