import type {
  LinkedInCsvTable,
  LinkedInLocationSignal,
  LinkedInRoleSignal,
  LinkedInWeightedTerm,
  SearchIntentInsights,
} from "@/lib/types";

const STOPWORDS = new Set(
  `about after again against also and any are around at because been before being between both but by can could did do does doing for from get had has have having how i if in into is it its job jobs just like made make many may me my new no not now of on or our out over part people project role roles search seen she should so some such than that the their them then there these they this those through time to up us use user very was we were what when where which while who why will with work would you your remote hybrid onsite fulltime parttime contract temporary entry senior junior near me hiring today week month year days day`.split(
    /\s+/,
  ),
);

const ROLE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Production Coordinator", pattern: /production.{0,30}coordinator|coordinator.{0,30}production/i },
  { label: "Production Operator", pattern: /production.{0,30}operator|operator.{0,30}production/i },
  { label: "Print Operator", pattern: /print(?:ing)?.{0,30}operator|operator.{0,30}print(?:ing)?/i },
  { label: "Project Coordinator", pattern: /project.{0,30}coordinator|coordinator.{0,30}project/i },
  { label: "Information Technology Technician", pattern: /information technology.{0,20}technician|it.{0,20}technician|technology.{0,20}technician/i },
  { label: "Sales Specialist", pattern: /sales.{0,30}specialist|specialist.{0,30}sales/i },
  { label: "Marketing Coordinator", pattern: /marketing.{0,30}coordinator|coordinator.{0,30}marketing/i },
  { label: "Production Manager", pattern: /production.{0,30}manager|manager.{0,30}production/i },
  { label: "Graphics Specialist", pattern: /graphic(?:s)?.{0,30}(?:specialist|technician|operator)/i },
  { label: "Administrative Assistant", pattern: /administrative.{0,20}assistant|admin.{0,20}assistant/i },
];

const LOCATION_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Salt Lake City, UT", pattern: /salt\s*lake|saltlake/i },
  { label: "Utah", pattern: /\butah\b|\but\b/i },
  { label: "Remote", pattern: /\bremote\b/i },
  { label: "Hybrid", pattern: /\bhybrid\b/i },
  { label: "Provo, UT", pattern: /\bprovo\b/i },
  { label: "Orem, UT", pattern: /\borem\b/i },
  { label: "Bountiful, UT", pattern: /\bbountiful\b/i },
  { label: "South Jordan, UT", pattern: /south\s*jordan/i },
  { label: "Denver, CO", pattern: /\bdenver\b/i },
  { label: "Phoenix, AZ", pattern: /\bphoenix\b/i },
  { label: "Dallas, TX", pattern: /\bdallas\b/i },
  { label: "Chicago, IL", pattern: /\bchicago\b/i },
];

const WORKPLACE_LABELS: Record<string, string> = {
  "1": "Remote",
  "2": "Hybrid",
  "3": "On-site",
};

export function emptyInsights(generatedAt = new Date().toISOString()): SearchIntentInsights {
  return {
    generatedAt,
    queryCount: 0,
    distinctQueries: 0,
    topTerms: [],
    roleFamilies: [],
    locations: [],
    workplaceTypes: [],
    alertKeywords: [],
    suggestedTargetRole: "",
    searchKeywords: [],
    locationTerms: [],
    confidence: "low",
    evidenceFiles: [],
  };
}

function findTable(tables: LinkedInCsvTable[], fragment: string): LinkedInCsvTable | undefined {
  const key = fragment.toLowerCase().replace(/\.csv$/i, "").replace(/[^a-z0-9]/g, "");
  return tables.find((table) => table.id.replace(/[^a-z0-9]/g, "").includes(key));
}

function cell(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value) return value;
  }
  return "";
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.replace(/^[.#]+|[.#]+$/g, ""))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function parseDate(value: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value.replace(/\s*UTC\s*$/i, "Z"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function extractKeywords(context: string): string[] {
  const match = context.match(/keywords=([^,}]+)/i);
  if (!match) return [];
  return match[1]
    .split(/\s+and\s+|\s*\|\s*|\s*;\s*/i)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function analyzeLinkedInSignals(tables: LinkedInCsvTable[]): SearchIntentInsights {
  const insights = emptyInsights();
  const queryTable = findTable(tables, "SearchQueries");
  const alertTable = findTable(tables, "SavedJobAlerts");
  const evidenceFiles: string[] = [];

  if (!queryTable) return insights;
  evidenceFiles.push(queryTable.name);

  const queryRows = queryTable.rows
    .map((row) => ({ query: cell(row, "Search Query"), time: parseDate(cell(row, "Time", "Date")) }))
    .filter((row) => row.query.trim());
  const latest = Math.max(0, ...queryRows.map((row) => row.time));
  const recentCutoff = latest ? latest - 90 * 24 * 60 * 60 * 1000 : 0;

  const termCounts = new Map<string, LinkedInWeightedTerm>();
  const distinct = new Set<string>();
  const roles = new Map<string, LinkedInRoleSignal>();
  const locations = new Map<string, LinkedInLocationSignal>();

  for (const row of queryRows) {
    const normalizedQuery = row.query.trim().toLowerCase();
    distinct.add(normalizedQuery);
    const recent = row.time > 0 && row.time >= recentCutoff;

    for (const token of tokenize(row.query)) {
      const entry = termCounts.get(token) ?? { term: token, count: 0, recentCount: 0, weight: 0 };
      entry.count += 1;
      if (recent) entry.recentCount += 1;
      entry.weight = entry.count + entry.recentCount * 0.5;
      termCounts.set(token, entry);
    }

    for (const role of ROLE_PATTERNS) {
      if (!role.pattern.test(row.query)) continue;
      const entry = roles.get(role.label) ?? { label: role.label, count: 0, evidence: [] };
      entry.count += 1;
      if (entry.evidence.length < 3) entry.evidence.push(row.query.trim());
      roles.set(role.label, entry);
    }

    for (const location of LOCATION_PATTERNS) {
      if (!location.pattern.test(row.query)) continue;
      const entry = locations.get(location.label) ?? { label: location.label, count: 0 };
      entry.count += 1;
      locations.set(location.label, entry);
    }
  }

  const alertKeywords: string[] = [];
  const workplaceTypes = new Set<string>();
  if (alertTable) {
    evidenceFiles.push(alertTable.name);
    for (const row of alertTable.rows) {
      const context = cell(row, "QUERY_CONTEXT", "Query Context");
      alertKeywords.push(...extractKeywords(context));
      const workplaceMatch = context.match(/workplaceTypes=\{(?:selectedValues=)?\[([^\]]+)\]/i);
      if (workplaceMatch) {
        for (const raw of workplaceMatch[1].split(",")) {
          const id = raw.trim().match(/workplaceType:(\d+)/)?.[1];
          if (id) workplaceTypes.add(WORKPLACE_LABELS[id] ?? `Workplace type ${id}`);
        }
      }
    }
  }

  const topTerms = [...termCounts.values()]
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
    .slice(0, 24);
  const roleFamilies = [...roles.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  const sortedLocations = [...locations.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  const suggestedTargetRole =
    roleFamilies[0]?.label ??
    (topTerms.length > 1 ? titleCase(`${topTerms[0].term} ${topTerms[1].term}`) : topTerms[0]?.term ?? "");

  return {
    generatedAt: new Date().toISOString(),
    queryCount: queryRows.length,
    distinctQueries: distinct.size,
    topTerms,
    roleFamilies,
    locations: sortedLocations,
    workplaceTypes: [...workplaceTypes],
    alertKeywords: [...new Set(alertKeywords)].slice(0, 12),
    suggestedTargetRole,
    searchKeywords: [...new Set([...topTerms.map((term) => term.term), ...alertKeywords])].slice(0, 24),
    locationTerms: sortedLocations.map((location) => location.label).slice(0, 6),
    confidence: queryRows.length >= 100 ? "high" : queryRows.length >= 20 ? "medium" : "low",
    evidenceFiles,
  };
}
