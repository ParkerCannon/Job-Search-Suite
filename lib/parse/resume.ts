import {
  emptyProfile,
  makeCoreSkillGroup,
  uid,
  type Education,
  type Experience,
  type Profile,
  type SkillGroup,
} from "../types";

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
    const label = url.includes("linkedin")
      ? "LinkedIn"
      : url.includes("github")
        ? "GitHub"
        : /artstation|behance|dribbble|portfolio/i.test(url)
          ? "Portfolio"
          : "Website";
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

function isBulletLine(line: string): boolean {
  return /^[\u2022\u00b7\u25aa\u25e6*\-]\s+/.test(line.trimStart());
}

function looksLikeDateHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90 || isBulletLine(trimmed)) return false;
  return DATE_RANGE.test(trimmed) || DATE_ONLY.test(trimmed) || (/[|]/.test(trimmed) && DATE_TOKEN.test(trimmed));
}

function splitTitleCompany(line: string): { title: string; company: string } {
  const parts = line.split(/\s*[|]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return { title: parts[0], company: parts.slice(1).join(", ") };
  const at = line.match(/^(.{3,60}?)\s+(?:at|@)\s+(.{2,60})$/i);
  if (at) return { title: at[1].trim(), company: at[2].trim() };
  const comma = line.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (comma.length > 1) return { title: comma[0], company: comma.slice(1).join(", ") };
  return { title: line, company: "" };
}

function joinDescription(lines: string[]): string {
  const bullets: string[] = [];
  let previousWasBullet = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isBulletLine(line)) {
      bullets.push(line.replace(/^[\u2022\u00b7\u25aa\u25e6*\-]\s+/, "").trim());
      previousWasBullet = true;
    } else if (previousWasBullet && bullets.length) {
      // PDF bullets wrap onto a second line; keep each bullet in one field.
      bullets[bullets.length - 1] += " " + line;
    } else {
      bullets.push(line);
      previousWasBullet = false;
    }
  }
  return bullets.join("\n");
}

function parseExperienceBlocks(lines: string[]): Experience[] {
  const blocks: string[][] = [];
  let current: string[] = [];

  let sawBullet = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    if (isBulletLine(line)) {
      sawBullet = true;
      current.push(line);
      continue;
    }
    // A plain line is a new role only when a date line follows it. A wrapped
    // bullet continuation ("workflows on schedule.") has no date after it.
    const followedByDate = index + 1 < lines.length && looksLikeDateHeader(lines[index + 1]);
    if (sawBullet && current.length && followedByDate) {
      blocks.push(current);
      current = [];
      sawBullet = false;
    } else if (
      looksLikeDateHeader(line) &&
      current.length &&
      current.some((item) => looksLikeDateHeader(item))
    ) {
      // No-bullet format: a second date line starts a new role.
      blocks.push(current);
      current = [];
      sawBullet = false;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);

  return blocks.slice(0, 20).map((block) => {
    const allDates = block.flatMap((line) => line.match(DATE_RANGE) ?? []);
    const [startDate, endDate] = extractDates(allDates[0] ?? "");

    const firstBullet = block.findIndex((line) => isBulletLine(line));
    const headerRaw = firstBullet >= 0 ? block.slice(0, firstBullet) : block.slice(0, Math.min(3, block.length));
    const descriptionLines = firstBullet >= 0 ? block.slice(firstBullet) : block.slice(headerRaw.length);

    const dateLines = headerRaw.filter((line) => looksLikeDateHeader(line));
    const nameLines = headerRaw.filter((line) => !looksLikeDateHeader(line));
    const locationLine = nameLines.find((line) => /,\s*[A-Z]{2}\b/.test(line));
    const titleLines = nameLines.filter((line) => line !== locationLine);

    let title = "";
    let company = "";
    let location = locationLine ?? "";

    if (titleLines.length) {
      if (
        titleLines.length > 1 &&
        !/[|,@]/.test(titleLines[0]) &&
        !/\b(?:at|@)\b/i.test(titleLines[0])
      ) {
        title = titleLines[0];
        company = titleLines.slice(1).join(", ");
      } else {
        const parsed = splitTitleCompany(titleLines.join(" "));
        title = parsed.title;
        company = parsed.company;
      }
    }

    for (const line of dateLines) {
      const cleaned = line
        .replace(DATE_RANGE, "")
        .replace(/^[|•·—–]\s*/, "")
        .replace(/[|•·—–]\s*$/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      const pieces = cleaned.split(/\s*[|]\s*/).filter(Boolean);
      if (!pieces.length) continue;
      if (!titleLines.length) {
        title = title || pieces[0];
        company = company || pieces[1] || "";
        location = location || pieces.slice(2).join(", ");
      } else if (!company && pieces.length > 1 && !/,\s*[A-Z]{2}\b/.test(pieces[0])) {
        company = pieces[0];
        location = location || pieces.slice(1).join(", ");
      } else {
        location = location || pieces.join(", ");
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
      description: joinDescription(descriptionLines),
    };
  });
}

function parseEducationBlocks(lines: string[]): Education[] {
  const blocks: string[][] = [];
  let current: string[] = [];
  const isAnchor = (line: string) =>
    DATE_RANGE.test(line) || DATE_ONLY.test(line.trim()) || (/[|]/.test(line) && DATE_TOKEN.test(line));

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
  const schoolRe = /university|college|institute|school|academy/i;
  return blocks.slice(0, 12).map((block) => {
    const anchorIndex = block.findIndex((line) => isAnchor(line));
    const anchor = anchorIndex >= 0 ? block[anchorIndex] : "";
    const anchorPieces = anchor.split(/\s*[|]\s*/).map((part) => part.trim()).filter(Boolean);
    const dateSource =
      anchorPieces.slice(1).join(" ") ||
      anchor.match(DATE_RANGE)?.[0] ||
      (DATE_ONLY.test(anchor.trim()) ? anchor.trim() : "");
    const [startDate, endDate] = extractDates(dateSource);

    const contentLines = block.filter((_, index) => index !== anchorIndex);
    const degreeLine = contentLines.find((line) => degreeRe.test(line)) ?? "";
    let degree = "";
    let field = "";
    let school = "";

    if (degreeLine) {
      // "Degree, Field, School" is the common single-line education format.
      const parts = degreeLine.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
      degree = parts[0] ?? "";
      const schoolIndex = parts.findIndex((part, index) => index > 1 && schoolRe.test(part));
      if (schoolIndex > 1) {
        field = parts.slice(1, schoolIndex).join(", ");
        school = parts.slice(schoolIndex).join(", ");
      } else {
        field = parts.slice(1, -1).join(", ");
        school = parts[parts.length - 1] ?? "";
      }
    }

    const schoolLine = contentLines.find((line) => schoolRe.test(line) && line !== degreeLine);
    if (!school) school = schoolLine ?? anchorPieces.find((part) => part && !DATE_TOKEN.test(part)) ?? "";
    const location =
      contentLines.find((line) => line !== degreeLine && line !== schoolLine && /,\s*[A-Z]{2}\b/.test(line)) ?? "";
    const details = contentLines
      .filter((line) => line !== degreeLine && line !== schoolLine && line !== location)
      .join("\n");

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

const SKILL_GROUP_LABEL =
  /^(?:core|technical|technology|technologies|tools?|software|key|primary|soft|programming|languages?|frameworks?|databases?|cloud|platforms?|skills?|expertise|competencies|domains?|specialties|proficiencies)$/i;

function parseSkillGroups(lines: string[]): SkillGroup[] {
  type Draft = Omit<SkillGroup, "items"> & { raw: string };
  const groups: Draft[] = [];

  function makeDraft(label?: string): Draft {
    const core = makeCoreSkillGroup();
    if (label && !/^core$/i.test(label)) {
      return { id: uid(), group: fromAllCaps(label), locked: false, raw: "" };
    }
    return { id: core.id, group: core.group, locked: core.locked, raw: "" };
  }

  function append(group: Draft, text: string) {
    const next = text.trim();
    if (!next) return;
    if (!group.raw) {
      group.raw = next;
    } else {
      // A line that ends with a delimiter is a new item; otherwise it wrapped.
      group.raw += /[,;|•·]$/.test(group.raw.trim()) ? "\n" + next : " " + next;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const labeled = line.match(/^([A-Za-z][\w /&+-]{1,40}):\s*(.*)$/);
    if (labeled && SKILL_GROUP_LABEL.test(labeled[1].trim())) {
      const group = makeDraft(labeled[1].trim());
      groups.push(group);
      append(group, labeled[2]);
      continue;
    }
    if (!groups.length) groups.push(makeDraft());
    append(groups[groups.length - 1], line);
  }

  if (!groups.length) groups.push(makeDraft());
  return groups.slice(0, 12).map((group) => ({
    id: group.id,
    group: group.group,
    locked: group.locked,
    items: [...new Set(
      group.raw
        .split(/[,;|•·\n]+/)
        .map((item) => item.replace(/^[-\s]+/, "").trim())
        .filter((item) => item.length >= 2 && item.length <= 45 && !/^(?:and|with|including|etc\.?)$/i.test(item)),
    )].slice(0, 80),
  }));
}

function parseCertifications(lines: string[]): { id: string; name: string; issuer: string; date: string }[] {
  const certifications: { id: string; name: string; issuer: string; date: string }[] = [];
  let pending: { date: string; lines: string[] } | null = null;

  function flush() {
    const current = pending;
    pending = null;
    if (!current?.lines.length) return;
    certifications.push({
      id: uid(),
      name: current.lines[0],
      issuer: current.lines.slice(1).join(" "),
      date: current.date,
    });
  }

  for (const raw of lines) {
    const line = raw.replace(/^[\u2022\u00b7\u25aa\u25e6*\-]\s*/, "").trim();
    if (!line) continue;
    const pieces = line.split(/\s*[|]\s*/).map((part) => part.trim()).filter(Boolean);
    if (pieces.length > 1) {
      flush();
      const date = pieces.slice(1).find((part) => DATE_ONLY.test(part)) ?? "";
      certifications.push({
        id: uid(),
        name: pieces[0],
        issuer: pieces.slice(1).filter((part) => part !== date).join(", "),
        date,
      });
      continue;
    }
    if (DATE_ONLY.test(line)) {
      flush();
      pending = { date: line, lines: [] };
    } else {
      if (!pending) pending = { date: "", lines: [] };
      pending.lines.push(line);
    }
  }
  flush();
  return certifications.slice(0, 20);
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
  profile.skills = parseSkillGroups(sections.skills ?? []);
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
