export type ProfileSource = "resume" | "linkedin" | "active";

export interface LinkItem {
  label: string;
  url: string;
}

export interface Experience {
  id: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  details: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  link: string;
}

export const CORE_SKILL_GROUP_ID = "core";
export const CORE_SKILL_GROUP_NAME = "Core";

export interface SkillGroup {
  id: string;
  group: string;
  items: string[];
  locked?: boolean;
}

export function makeCoreSkillGroup(): SkillGroup {
  return {
    id: CORE_SKILL_GROUP_ID,
    group: CORE_SKILL_GROUP_NAME,
    items: [],
    locked: true,
  };
}

export function flattenSkillGroups(groups: SkillGroup[]): string[] {
  return groups.flatMap((group) => group.items).filter(Boolean);
}

export type ResumeSectionId =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "certifications"
  | "projects";

export const RESUME_SECTION_IDS: ResumeSectionId[] = [
  "summary",
  "experience",
  "education",
  "skills",
  "certifications",
  "projects",
];

export const DEFAULT_RESUME_SECTION_ORDER: ResumeSectionId[] = [...RESUME_SECTION_IDS];

export function normalizeResumeSectionOrder(value: unknown): ResumeSectionId[] {
  const result: ResumeSectionId[] = [];
  const seen = new Set<ResumeSectionId>();

  if (Array.isArray(value)) {
    for (const item of value) {
      if (RESUME_SECTION_IDS.includes(item as ResumeSectionId) && !seen.has(item as ResumeSectionId)) {
        result.push(item as ResumeSectionId);
        seen.add(item as ResumeSectionId);
      }
    }
  }

  for (const id of DEFAULT_RESUME_SECTION_ORDER) {
    if (!seen.has(id)) result.push(id);
  }

  return result;
}

export interface Profile {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: LinkItem[];
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: SkillGroup[];
  certifications: Certification[];
  projects: Project[];
  sectionOrder: ResumeSectionId[];
}

export interface StoredProfile {
  source: ProfileSource;
  profile: Profile;
  rawText: string;
  filename: string;
  updatedAt: string;
}

export interface JobDescription {
  id: string;
  title: string;
  company: string;
  rawText: string;
  createdAt: string;
}

export interface KeywordHit {
  term: string;
  importance: number;
  found: boolean;
  context: string;
}

export interface ScoreCategory {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface AtsFlag {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  fix: string;
}

export interface AtsView {
  wordCount: number;
  detectedSections: string[];
  missingSections: string[];
  contact: { email: boolean; phone: boolean; links: boolean; location: boolean };
  dateFormats: string[];
  bulletLines: number;
  numericAchievements: number;
  likelyColumnsOrTables: boolean;
  estimatedYears: number | null;
  extractedName: string;
}

export interface AtsResult {
  overall: number;
  categories: ScoreCategory[];
  matchedKeywords: KeywordHit[];
  missingKeywords: KeywordHit[];
  flags: AtsFlag[];
  atsView: AtsView;
  aiSummary: string | null;
  source: ProfileSource;
  jobTitle: string;
  weights: Record<string, number>;
  createdAt: string;
}

export interface AtsAnalysisRecord {
  id: string;
  jobId: string;
  jobTitle: string;
  result: AtsResult;
  createdAt: string;
}

export interface Recommendation {
  id: string;
  type: "keyword" | "skill" | "format" | "experience" | "achievement" | "headline" | "ai";
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  suggestion: string;
  location: string;
}

export interface KeywordAnalysis {
  result: AtsResult;
  recommendations: Recommendation[];
  jobTitle: string;
  source: ProfileSource;
}

export interface AiSettings {
  provider: "none" | "ollama" | "openai" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey: string;
}

export type JobSourceId =
  | "greenhouse"
  | "lever"
  | "remotive"
  | "remoteok"
  | "jobicy"
  | "adzuna"
  | "usajobs";

export interface JobDiscoverySettings {
  enabledSources: JobSourceId[];
  greenhouseBoards: string[];
  leverBoards: string[];
  locationTerms: string[];
  maxJobsPerSource: number;
  adzunaAppId: string;
  adzunaApiKey: string;
  adzunaCountry: string;
  usajobsApiKey: string;
}

export const DEFAULT_JOB_DISCOVERY_SETTINGS: JobDiscoverySettings = {
  enabledSources: ["remotive", "remoteok", "jobicy"],
  greenhouseBoards: [],
  leverBoards: [],
  locationTerms: [],
  maxJobsPerSource: 100,
  adzunaAppId: "",
  adzunaApiKey: "",
  adzunaCountry: "us",
  usajobsApiKey: "",
};

export interface ProfileLinksSettings {
  linkedin: string;
  indeed: string;
}

export const JOB_SOURCE_IDS: JobSourceId[] = [
  "greenhouse",
  "lever",
  "remotive",
  "remoteok",
  "jobicy",
  "adzuna",
  "usajobs",
];

export type PdfPageMode = "single" | "multiple";

export interface AppSettings {
  ai: AiSettings;
  weights: Record<string, number>;
  targetRole: string;
  jobDiscovery: JobDiscoverySettings;
  profileLinks: ProfileLinksSettings;
  pdfPageMode: PdfPageMode;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ai: { provider: "none", baseUrl: "http://localhost:11434", model: "llama3.1", apiKey: "" },
  weights: { keywords: 40, skills: 25, experience: 15, structure: 10, achievements: 10 },
  targetRole: "",
  jobDiscovery: { ...DEFAULT_JOB_DISCOVERY_SETTINGS },
  profileLinks: { linkedin: "", indeed: "" },
  pdfPageMode: "single",
};

export interface JobSourceInfo {
  id: JobSourceId;
  label: string;
  description: string;
  attributionUrl: string;
  requiresKey: boolean;
  enabled: boolean;
  configured: boolean;
  reason: string;
}

export type SeniorityLevel =
  | "unknown"
  | "internship"
  | "entry"
  | "mid"
  | "senior"
  | "lead"
  | "manager"
  | "director"
  | "executive";

export type SalaryPeriod = "unknown" | "year" | "month" | "week" | "day" | "hour";

export const SENIORITY_LEVELS: SeniorityLevel[] = [
  "unknown",
  "internship",
  "entry",
  "mid",
  "senior",
  "lead",
  "manager",
  "director",
  "executive",
];

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  unknown: "Unknown",
  internship: "Internship",
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead / Staff",
  manager: "Manager",
  director: "Director",
  executive: "Executive",
};

export interface JobListing {
  id: string;
  source: JobSourceId;
  sourceJobId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  attributionUrl: string;
  publishedAt: string | null;
  tags: string[];
  seniority: SeniorityLevel;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod;
  salaryText: string;
  matchedTerms: string[];
  matchScore: number;
}

export interface TitleFilters {
  location: string;
  seniority: SeniorityLevel | "all";
  minPay: number | null;
  maxPay: number | null;
  includeUnknownPay: boolean;
}

export const EMPTY_TITLE_FILTERS: TitleFilters = {
  location: "",
  seniority: "all",
  minPay: null,
  maxPay: null,
  includeUnknownPay: false,
};

export interface TitleRecommendation {
  title: string;
  normalizedTitle: string;
  score: number;
  reason: string;
  matchedTerms: string[];
  listingCount: number;
  sources: JobSourceId[];
  latestAt: string | null;
  samples: JobListing[];
}

export interface SourceStatus {
  source: JobSourceId;
  ok: boolean;
  count: number;
  message: string;
}

export interface TitleRefreshStatus {
  lastRefreshedAt: string | null;
  nextRefreshAt: string | null;
  stale: boolean;
  staleReason: string;
  state: "empty" | "ok" | "partial" | "error";
  message: string;
  profileFingerprint: string;
  sourceStatuses: SourceStatus[];
}

export interface TitlesPayload {
  generatedAt: string;
  recommendations: TitleRecommendation[];
  listings: JobListing[];
  totalListings: number;
  sources: JobSourceInfo[];
  status: TitleRefreshStatus;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeLink(value: unknown): LinkItem {
  const item = isObject(value) ? value : {};
  return { label: asText(item.label), url: asText(item.url) };
}

function normalizeExperience(value: unknown): Experience {
  const item = isObject(value) ? value : {};
  return {
    id: asText(item.id) || uid(),
    title: asText(item.title),
    company: asText(item.company),
    location: asText(item.location),
    startDate: asText(item.startDate),
    endDate: asText(item.endDate),
    current: item.current === true,
    description: asText(item.description),
  };
}

function normalizeEducation(value: unknown): Education {
  const item = isObject(value) ? value : {};
  return {
    id: asText(item.id) || uid(),
    school: asText(item.school),
    degree: asText(item.degree),
    field: asText(item.field),
    startDate: asText(item.startDate),
    endDate: asText(item.endDate),
    details: asText(item.details),
  };
}

function normalizeCertification(value: unknown): Certification {
  const item = isObject(value) ? value : {};
  return {
    id: asText(item.id) || uid(),
    name: asText(item.name),
    issuer: asText(item.issuer),
    date: asText(item.date),
  };
}

function normalizeProject(value: unknown): Project {
  const item = isObject(value) ? value : {};
  return {
    id: asText(item.id) || uid(),
    name: asText(item.name),
    description: asText(item.description),
    link: asText(item.link),
  };
}

/**
 * Normalizes both the legacy flat string list and the grouped format.
 * The Core group always exists, is always first, and absorbs any legacy or
 * reserved-name items so skill data is never lost during migration.
 */
function normalizeSkillGroups(value: unknown): SkillGroup[] {
  const core = makeCoreSkillGroup();
  const groups: SkillGroup[] = [];

  function addCoreItems(items: string[]) {
    core.items.push(...items.map((item) => item.trim()).filter(Boolean));
  }

  function addGroup(name: string, items: string[], id?: string) {
    const key = name.toLowerCase();
    const existing = groups.find((group) => group.group.toLowerCase() === key);
    if (existing) {
      existing.items.push(...items);
      return;
    }
    groups.push({
      id: id || uid(),
      group: name,
      items,
      locked: false,
    });
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string") {
        addCoreItems([entry]);
        continue;
      }
      if (!isObject(entry)) continue;
      const name = asText(entry.group ?? entry.name).trim();
      const items = asStringArray(entry.items).map((item) => item.trim()).filter(Boolean);
      if (!name || name.toLowerCase() === CORE_SKILL_GROUP_NAME.toLowerCase()) {
        addCoreItems(items);
        continue;
      }
      addGroup(name, items, asText(entry.id) || undefined);
    }
  }

  return [core, ...groups];
}

/** Ensures stored or imported profile data always has the fields the UI expects. */
export function normalizeProfile(value: unknown): Profile {
  const input = isObject(value) ? value : {};
  return {
    name: asText(input.name),
    headline: asText(input.headline),
    email: asText(input.email),
    phone: asText(input.phone),
    location: asText(input.location),
    links: Array.isArray(input.links) ? input.links.map(normalizeLink).filter((link) => link.label || link.url) : [],
    summary: asText(input.summary),
    experience: Array.isArray(input.experience) ? input.experience.map(normalizeExperience) : [],
    education: Array.isArray(input.education) ? input.education.map(normalizeEducation) : [],
    skills: normalizeSkillGroups(input.skills),
    certifications: Array.isArray(input.certifications) ? input.certifications.map(normalizeCertification) : [],
    projects: Array.isArray(input.projects) ? input.projects.map(normalizeProject) : [],
    sectionOrder: normalizeResumeSectionOrder(input.sectionOrder),
  };
}

export function emptyProfile(): Profile {
  return normalizeProfile(null);
}

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
