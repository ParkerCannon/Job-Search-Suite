import { emptyProfile, makeCoreSkillGroup, uid, type Education, type Experience, type Profile } from "../types";

type SectionKey =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "awards"
  | "languages"
  | "publications";

// Headings must match the WHOLE line. Otherwise a sentence like
// "Certification A+, Certification B+..." is mistaken for a "Projects" heading.
const SECTION_PATTERNS: { key: SectionKey; pattern: RegExp }[] = [
  { key: "summary", pattern: /^(?:(?:professional|career)\s+)?(?:summary|profile|objective|about(?:\s+me)?)\s*:?$/i },
  { key: "experience", pattern: /^(?:(?:work|professional|relevant|employment)\s+)?(?:experience|history|employment|career|background)\s*:?$/i },
  { key: "education", pattern: /^(?:education|academic(?:\s+(?:background|qualifications))?|qualifications?)\s*:?$/i },
  { key: "skills", pattern: /^(?:(?:technical|core|key)\s+)?(?:skills?|competenc(?:y|ies)|technologies|tech\s+stack)\s*:?$/i },
  { key: "projects", pattern: /^(?:projects?|portfolio|selected\s+work)\s*:?$/i },
  { key: "certifications", pattern: /^(?:certifications?|licenses?|credentials|courses)\s*:?$/i },
  { key: "awards", pattern: /^(?:awards?|honou?rs|achievements)\s*:?$/i },
  { key: "languages", pattern: /^languages?\s*:?$/i },
  { key: "publications", pattern: /^(?:publications?|research)\s*:?$/i },
];

// Many PDFs render headings with character spacing: "P R O F E S S I O N A L S U M M A RY".
// Comparing letters-only lets us recognize those without confusing normal prose.
const NORMALIZED_HEADINGS: Record<string, SectionKey> = {
  professionalsummary: "summary",
  careerobjective: "summary",
  summary: "summary",
  profile: "summary",
  objective: "summary",
  aboutme: "summary",
  workexperience: "experience",
  workhistory: "experience",
  employmenthistory: "experience",
  professionalbackground: "experience",
  relevantexperience: "experience",
  experience: "experience",
  history: "experience",
  employment: "experience",
  career: "experience",
  background: "experience",
  education: "education",
  academicbackground: "education",
  academicqualifications: "education",
  qualification: "education",
  qualifications: "education",
  technicalskills: "skills",
  coreskills: "skills",
  keyskills: "skills",
  corecompetencies: "skills",
  competency: "skills",
  competencies: "skills",
  skills: "skills",
  skill: "skills",
  technologies: "skills",
  techstack: "skills",
  project: "projects",
  projects: "projects",
  portfolio: "projects",
  selectedwork: "projects",
  certification: "certifications",
  certifications: "certifications",
  license: "certifications",
  licenses: "certifications",
  credentials: "certifications",
  courses: "certifications",
  award: "awards",
  awards: "awards",
  honors: "awards",
  honours: "awards",
  achievements: "awards",
  language: "languages",
  languages: "languages",
  publication: "publications",
  publications: "publications",
  research: "publications",
};

const MONTH = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const DATE_TOKEN = new RegExp(
  `(?:\\b(?:${MONTH})\\.?\\s*\\d{0,4}\\b)|(?:\\b(?:19|20)\\d{2}\\b)|(?:\\bpresent\\b)|(?:\\bcurrent\\b)`,
  "i",
);
const DATE_RANGE = new RegExp(
  `(?:\\b(?:${MONTH})\\.?\\s*\\d{0,4}\\b|\\b(?:19|20)\\d{2}\\b)\\s*(?:-|–|—|\\bto\\b)\\s*(?:\\b(?:${MONTH})\\.?\\s*\\d{2,4}\\b|\\b(?:19|20)\\d{2}\\b|\\b(?:present|current|now)\\b|\\b(?:${MONTH})\\b)`,
  "i",
);
const DATE_ONLY = new RegExp(`^(?:(?:${MONTH})\\.?\\s*\\d{0,4}|(?:19|20)\\d{2})$`, "i");

function cleanLine(line: string): string {
  return line.replace(/\r/g, "").replace(/[\t\u00a0]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function normalizeHeadingText(line: string): string {
  return line.replace(/[^\p{L}]/gu, "").toLowerCase();
}

function sectionKey(line: string): SectionKey | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return null;
  const strict = SECTION_PATTERNS.find((def) => def.pattern.test(trimmed));
  if (strict) return strict.key;
  const normalized = normalizeHeadingText(trimmed);
  if (!normalized || normalized.length > 40) return null;
  return NORMALIZED_HEADINGS[normalized] ?? null;
}

function isHeading(line: string): boolean {
  return sectionKey(line) !== null;
}

function fromAllCaps(text: string): string {
  if (!text || !/[A-Z]/.test(text) || text !== text.toUpperCase()) return text;
  return text.split(/\s+/).map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(" ");
}

function splitRange(range: string): [string, string] {
  const parts = range.split(/\s*(?:-|–|—|\bto\b)\s*/i).filter(Boolean);
  return [parts[0] ?? "", parts[1] ?? ""];
}

function extractDates(text: string): [string, string] {
  const range = text.match(DATE_RANGE)?.[0];
  if (range) return splitRange(range);
  const tokens = text.match(new RegExp(DATE_TOKEN.source, "gi")) ?? [];
  if (tokens.length >= 2) return [tokens[0] ?? "", tokens[1] ?? ""];
  if (tokens.length === 1) return ["", tokens[0]];
  return ["", ""];
}

function stripDates(text: string): { text: string; dates: string[] } {
  const dates = text.match(DATE_RANGE) ?? [];
  let out = text;
  if (dates.length) out = out.replace(DATE_RANGE, "");
  out = out.replace(/[|•·—–]\s*$/, "").replace(/^\s*[|•·—–]/, "").replace(/\s{2,}/g, " ").trim();
  return { text: out, dates };
}

function extractContact(text: string): { email: string; phone: string; links: { label: string; url: string }[] } {
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
  const phone =
    text.match(/(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/)?.[0] ?? "";
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/(?<![\w@.])(?:https?:\/\/)?(?:www\.)?(linkedin\.com\/in\/[\w-]+|github\.com\/[\w-]+|[\w-]+\.(?:dev|io|com|net|org)(?:\/[\w/-]+)?)/gi)) {
    const raw = match[0];
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const label = url.includes("linkedin") ? "LinkedIn" : url.includes("github") ? "GitHub" : "Website";
    links.push({ label, url });
  }
  return { email, phone, links: links.slice(0, 6) };
}

function guessName(lines: string[], headings: Set<number>): string {
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    if (headings.has(i)) continue;
    const line = lines[i];
    if (!line || line.length > 48 || /@|\d|https?:|www\./i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 5 && words.every((w) => /^[\p{L}][\p{L}'.-]*$/u.test(w))) {
      return line;
    }
  }
  return "";
}

function splitCompanyLocation(line: string): { company: string; location: string } {
  const match = line.match(/^(.*?)\s+((?:[A-Z][a-z]+\s+){0,3}[A-Z][a-z]+,?\s*[A-Z]{2}|[A-Z][a-z]+,\s*[A-Za-z]+)$/);
  if (match?.[1]?.trim()) return { company: match[1].trim(), location: (match[2] ?? "").trim() };
  return { company: line, location: "" };
}

function looksLikeDateHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90) return false;
  return DATE_RANGE.test(trimmed) || (/[|]/.test(trimmed) && DATE_TOKEN.test(trimmed));
}

function parseExperienceBlocks(lines: string[]): Experience[] {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (looksLikeDateHeader(line) && current.length) {
      blocks.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);

  return blocks.slice(0, 20).map((block) => {
    const allDates = block.flatMap((line) => line.match(DATE_RANGE) ?? []);
    const [startDate, endDate] = extractDates(allDates[0] ?? "");

    const headerLines = block
      .filter((line) => !(DATE_RANGE.test(line) && !line.replace(DATE_RANGE, "").trim()))
      .map((line) => line.replace(DATE_RANGE, "").replace(/[|•·—–]\s*$/, "").trim())
      .filter(Boolean);

    let title = "";
    let company = "";
    let location = "";
    let descriptionStart = 0;

    const pipeIndex = headerLines.findIndex((line) => line.includes("|"));
    if (pipeIndex >= 0) {
      const pieces = headerLines[pipeIndex].split(/\s*[|]\s*/).filter(Boolean);
      if (pipeIndex === 0) {
        // "Title | Company | Location | Dates"
        title = pieces[0] ?? "";
        company = pieces[1] ?? "";
        location = pieces.slice(2).join(", ");
      } else {
        // "Title" on one line, then "Company | Location" from a PDF column.
        title = headerLines[0] ?? "";
        company = pieces[0] ?? "";
        location = pieces.slice(1).join(", ");
      }
      descriptionStart = pipeIndex + 1;
    } else {
      const atMatchIndex = headerLines.findIndex((line) => /^(.{3,60}?)\s+(?:at|@)\s+(.{2,60})$/i.test(line));
      if (atMatchIndex >= 0) {
        const match = headerLines[atMatchIndex].match(/^(.{3,60}?)\s+(?:at|@)\s+(.{2,60})$/i);
        title = match?.[1] ?? "";
        company = match?.[2] ?? "";
        descriptionStart = atMatchIndex + 1;
      } else {
        title = headerLines[0] ?? "";
        if (headerLines.length > 1) {
          const split = splitCompanyLocation(headerLines[1]);
          company = split.company;
          location = split.location;
        }
        descriptionStart = 2;
      }
    }

    return {
      id: uid(),
      title: title.slice(0, 120),
      company: company.slice(0, 120),
      location: location.slice(0, 160),
      startDate,
      endDate,
      current: /present|current|now/i.test(`${startDate} ${endDate}`),
      description: headerLines.slice(descriptionStart).join("\n"),
    };
  });
}

function parseEducationBlocks(lines: string[]): Education[] {
  const blocks: string[][] = [];
  let current: string[] = [];
  const isAnchor = (line: string) => DATE_RANGE.test(line) || (/[|]/.test(line) && DATE_TOKEN.test(line));

  for (const line of lines) {
    if (!line) continue;
    if (isAnchor(line) && current.length) {
      blocks.push([...current, line]);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);

  const degreeRe = /\b(?:bachelor|master|doctor|ph\.?d|mba|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|associate(?:s|d)?|diploma|certificate)\b/i;
  return blocks.slice(0, 12).map((block) => {
    const anchorIndex = block.findIndex((line) => isAnchor(line));
    const anchor = anchorIndex >= 0 ? block[anchorIndex] : "";
    const anchorPieces = anchor.split(/\s*[|]\s*/).map((part) => part.trim()).filter(Boolean);
    const schoolFromPipe = anchorPieces[0] ?? "";
    const dateSource = anchorPieces.slice(1).join(" ") || (anchor.match(DATE_RANGE)?.[0] ?? "");
    const [startDate, endDate] = extractDates(dateSource);

    const contentLines = block.filter((_, index) => index !== anchorIndex);
    const degreeLine =
      contentLines.find((line) => degreeRe.test(line) && line.includes(",")) ??
      contentLines.find((line) => degreeRe.test(line)) ??
      "";
    let degree = "";
    let field = "";
    if (degreeLine) {
      const [first, ...rest] = degreeLine.split(/\s*,\s*/);
      degree = first.trim();
      field = rest.join(", ").trim();
    }
    const school =
      schoolFromPipe ||
      contentLines.find((line) => /university|college|institute|school|academy/i.test(line)) ||
      "";
    const location = contentLines.find((line) => line !== degreeLine && line !== school) ?? "";
    const details = contentLines.filter((line) => line !== degreeLine && line !== school && line !== location).join("\n");

    return {
      id: uid(),
      school: school.slice(0, 160),
      degree: degree.slice(0, 120),
      field: field.slice(0, 160),
      startDate,
      endDate,
      details,
    };
  });
}

function parseSkills(lines: string[]): string[] {
  const joined = lines.join(" ").replace(/\b(?:technical|core|key)\s+skills?\b:?/gi, "");
  const parts = joined
    .split(/(?:,|;|\||•|·|\u2022|\n|\s{2,})+/)
    .map((s) => s.replace(/^[-\s]+/, "").trim())
    .filter((s) => s.length >= 2 && s.length <= 45 && !/^(?:and|with|including|etc\.?)$/i.test(s));
  const unique = [...new Set(parts)];
  return unique.slice(0, 80);
}

function parseCertifications(lines: string[]): { id: string; name: string; issuer: string; date: string }[] {
  const groups: { date: string; lines: string[] }[] = [];
  let current: { date: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (!line) continue;
    if (DATE_ONLY.test(line.trim())) {
      if (current) groups.push(current);
      current = { date: line.trim(), lines: [] };
    } else {
      if (!current) current = { date: "", lines: [] };
      current.lines.push(line);
    }
  }
  if (current) groups.push(current);

  return groups.slice(0, 20).map((group) => ({
    id: uid(),
    name: group.lines[0] ?? "",
    issuer: group.lines.slice(1).join(" "),
    date: group.date,
  }));
}

function parseSimpleBlocks(lines: string[]): { name: string; description: string }[] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (!current.length || /^[A-Z0-9][^.]{3,80}$/.test(line) && current.length > 1) {
      if (current.length) blocks.push(current);
      current = [line];
    } else current.push(line);
  }
  if (current.length) blocks.push(current);
  return blocks.map((b) => ({ name: b[0], description: b.slice(1).join("\n") }));
}

export function parseResumeText(raw: string): Profile {
  const profile = emptyProfile();
  const lines = raw.split(/\r?\n/).map(cleanLine);
  const headings = new Set<number>();
  const sections: Record<string, string[]> = {};
  let active: string | null = null;

  lines.forEach((line, i) => {
    const key = sectionKey(line);
    if (key) {
      headings.add(i);
      active = key;
      sections[key] = sections[key] ?? [];
      return;
    }
    if (active) sections[active].push(line);
  });

  profile.name = fromAllCaps(guessName(lines, headings));
  const contact = extractContact(raw);
  profile.email = contact.email;
  profile.phone = contact.phone;
  profile.links = contact.links;

  const headerLines = lines.slice(0, headings.size ? Math.min(...headings) : 6).filter(Boolean);
  const rawHeadline =
    headerLines.find(
      (l) => l !== profile.name && l !== guessName(lines, headings) && !l.includes("@") && !/linkedin\.com|github\.com/i.test(l) && !DATE_TOKEN.test(l),
    )?.slice(0, 140) ?? "";
  profile.headline = fromAllCaps(rawHeadline);

  const locationLine = headerLines
    .flatMap((l) => l.split("|").map((part) => part.trim()))
    .find((part) => /,\s*[A-Z]{2}\b/.test(part));
  profile.location =
    locationLine ?? headerLines.join(" ").match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/)?.[0] ?? "";

  profile.summary = (sections.summary ?? []).filter(Boolean).join(" ").slice(0, 3000);
  profile.experience = parseExperienceBlocks(sections.experience ?? []);
  profile.education = parseEducationBlocks(sections.education ?? []);
  profile.skills = [{ ...makeCoreSkillGroup(), items: parseSkills(sections.skills ?? []) }];
  profile.certifications = parseCertifications(sections.certifications ?? []);
  profile.projects = parseSimpleBlocks(sections.projects ?? []).map((b) => {
    const colon = b.name.indexOf(":");
    return {
      id: uid(),
      name: colon > 0 ? b.name.slice(0, colon) : b.name,
      description: colon > 0 ? [b.name.slice(colon + 1).trim(), b.description].filter(Boolean).join("\n") : b.description,
      link: b.description.match(/https?:\/\/\S+/)?.[0] ?? "",
    };
  });

  return profile;
}
