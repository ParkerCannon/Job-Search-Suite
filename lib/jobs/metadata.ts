import type { JobListing, SalaryPeriod, SeniorityLevel } from "@/lib/types";

export interface ParsedSalary {
  min: number | null;
  max: number | null;
  period: SalaryPeriod;
  text: string;
}

const EMPTY_SALARY: ParsedSalary = { min: null, max: null, period: "unknown", text: "" };

const SENIORITY_PATTERNS: { level: SeniorityLevel; pattern: RegExp }[] = [
  { level: "executive", pattern: /\b(chief|executive|ceo|cto|cfo|coo|vp|vice president)\b/ },
  { level: "director", pattern: /\b(director|head)\b/ },
  { level: "lead", pattern: /\b(lead|principal|staff)\b/ },
  { level: "manager", pattern: /\b(manager|management)\b/ },
  { level: "senior", pattern: /\b(senior|sr\.?|tier\s+iii)\b/ },
  { level: "mid", pattern: /\b(mid[- ]?level|intermediate|ii)\b/ },
  { level: "internship", pattern: /\b(intern|internship|trainee|apprentice)\b/ },
  { level: "entry", pattern: /\b(entry[- ]?level|junior|jr\.?|graduate|associate)\b/ },
];

function words(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[._]+/g, " ").replace(/\s+/g, " ").trim() : "";
}

export function normalizeSeniority(value: unknown): SeniorityLevel {
  const text = words(value);
  if (!text || /\b(any|all|unspecified|unknown)\b/.test(text)) return "unknown";
  for (const entry of SENIORITY_PATTERNS) {
    if (entry.pattern.test(text)) return entry.level;
  }
  return "unknown";
}

export function deriveSeniority(title: unknown, explicit?: unknown, tags: unknown[] = []): SeniorityLevel {
  const fromSource = normalizeSeniority(explicit);
  if (fromSource !== "unknown") return fromSource;
  const tagText = tags.map(words).filter(Boolean).join(" ");
  return normalizeSeniority(`${words(title)} ${tagText}`);
}

function periodFromText(text: string, hint?: unknown): SalaryPeriod {
  const combined = `${words(hint)} ${text.toLowerCase()}`;
  if (/\b(hour|hourly|hr|per hour|\/hour)\b/.test(combined)) return "hour";
  if (/\b(month|monthly|per month|\/month)\b/.test(combined)) return "month";
  if (/\b(week|weekly|per week|\/week)\b/.test(combined)) return "week";
  if (/\b(day|daily|per day|\/day)\b/.test(combined)) return "day";
  if (/\b(year|yearly|annual|annually|per year|\/year|p\.?a\.?)\b/.test(combined)) return "year";
  if (/\d\s*[km]\b/.test(combined) || /\b\d{2,},\d{3}\b/.test(combined)) return "year";
  return "unknown";
}

function parseAmount(token: string, suffix: string | undefined): number | null {
  let normalized = token;
  if (/,\d{3}$/.test(token) && !token.includes(".")) {
    normalized = token.replace(/,/g, "");
  } else {
    normalized = token.replace(",", ".");
  }
  const base = Number(normalized);
  if (!Number.isFinite(base) || base <= 0) return null;
  const multiplier = suffix?.toLowerCase() === "k" ? 1_000 : suffix?.toLowerCase() === "m" ? 1_000_000 : 1;
  const value = base * multiplier;
  return value > 0 && value <= 10_000_000 ? value : null;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function parseSalaryText(value: unknown, periodHint?: unknown): ParsedSalary {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return EMPTY_SALARY;

  const period = periodFromText(text, periodHint);
  const amounts: number[] = [];
  const pattern = /\b(\d+(?:[.,]\d+)?)\s*([km])?\b/gi;
  let match = pattern.exec(text);
  while (match) {
    const amount = parseAmount(match[1], match[2]);
    if (amount !== null) amounts.push(amount);
    match = pattern.exec(text);
  }
  if (!amounts.length) return { ...EMPTY_SALARY, text };

  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return { min, max, period, text };
}

export function salaryFromBounds(
  minValue: unknown,
  maxValue: unknown,
  periodHint?: unknown,
  estimated = false,
): ParsedSalary {
  const min = typeof minValue === "number" && Number.isFinite(minValue) && minValue > 0 ? minValue : null;
  const max = typeof maxValue === "number" && Number.isFinite(maxValue) && maxValue > 0 ? maxValue : null;
  if (min === null && max === null) return EMPTY_SALARY;

  const period = periodFromText("", periodHint) === "unknown" ? "year" : periodFromText("", periodHint);
  const low = min ?? max!;
  const high = max ?? min!;
  const suffix = period === "year" ? "" : ` / ${period}`;
  const text = `${estimated ? "≈ " : ""}${low === high ? money(low) : `${money(low)} - ${money(high)}`}${suffix}`;
  return { min: low, max: high, period, text };
}

export function annualizeSalary(amount: number, period: SalaryPeriod): number {
  const multiplier =
    period === "hour" ? 2_080 : period === "day" ? 260 : period === "week" ? 52 : period === "month" ? 12 : 1;
  return Math.round(amount * multiplier);
}

export function annualSalaryRange(listing: JobListing): { min: number | null; max: number | null } {
  if (listing.salaryMin === null && listing.salaryMax === null) return { min: null, max: null };
  const low = listing.salaryMin ?? listing.salaryMax!;
  const high = listing.salaryMax ?? listing.salaryMin!;
  return {
    min: annualizeSalary(Math.min(low, high), listing.salaryPeriod),
    max: annualizeSalary(Math.max(low, high), listing.salaryPeriod),
  };
}
