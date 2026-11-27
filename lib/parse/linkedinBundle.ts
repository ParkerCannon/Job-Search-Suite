import JSZip from "jszip";
import { parseCsv } from "./csv";
import { analyzeLinkedInSignals, emptyInsights } from "./linkedinSignals";
import {
  emptyProfile,
  makeCoreSkillGroup,
  normalizeProfile,
  uid,
  type Experience,
  type LinkedInCsvTable,
  type LinkedInDataCategory,
  type LinkedInExportSnapshot,
  type LinkItem,
  type Profile,
  type ProfileImportPreview,
  type ProfileImportSummary,
} from "../types";
import { parseResumeText } from "./resume";

export type BundleFile = {
  name: string;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ReadFileText = (file: BundleFile) => Promise<string>;

function basename(name: string): string {
  return name.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? name;
}

function isZip(name: string): boolean {
  return /\.zip$/i.test(name);
}

export async function expandBundleFiles(files: File[]): Promise<BundleFile[]> {
  const expanded: BundleFile[] = [];
  for (const file of files) {
    if (!isZip(file.name)) {
      expanded.push(file);
      continue;
    }
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter(
      (entry) => !entry.dir && !/(^|\/)(__MACOSX|\.DS_Store)(\/|$)/i.test(entry.name),
    );
    for (const entry of entries) {
      const name = basename(entry.name);
      if (!name) continue;
      expanded.push({
        name,
        text: () => entry.async("string"),
        arrayBuffer: async () => (await entry.async("uint8array")).buffer as ArrayBuffer,
      });
    }
  }
  return expanded;
}

function categoryFor(name: string): LinkedInDataCategory {
  const key = name.toLowerCase();
  if (
    /email|phone|whatsapp|private_identity|inference|credibility|log|security|receipt|ad_targeting|ads clicked|lan ads|messages|notes|guide_messages|learning_coach|learning_role_play|registration/i.test(
      key,
    )
  ) {
    return "private";
  }
  if (/searchqueries|savedjobalerts|company follows|member_follows/i.test(key)) return "intent";
  if (/connections|invitations/i.test(key)) return "network";
  if (/positions|education|certifications|skills|languages|organizations|recommendations|endorsement|profile\.csv/i.test(key)) {
    return "career";
  }
  if (/learning\.csv|rich_media/i.test(key)) return "learning";
  if (/screening/i.test(key)) return "applications";
  if (/reactions|comments|shares|votes/i.test(key)) return "activity";
  return "private";
}

function labelFor(name: string): string {
  const stem = name.replace(/\.csv$/i, "").replace(/[_-]+/g, " ");
  return stem.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function tableId(name: string): string {
  return name.toLowerCase().replace(/\.csv$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function parseLinkedInBundle(files: File[]): Promise<LinkedInExportSnapshot> {
  const expanded = await expandBundleFiles(files);
  const csvFiles = expanded.filter((file) => /\.csv$/i.test(file.name));
  const tables: LinkedInCsvTable[] = [];
  const warnings: string[] = [];

  for (const file of csvFiles) {
    const parsed = parseCsv(await file.text());
    tables.push({
      id: tableId(file.name),
      name: basename(file.name),
      label: labelFor(basename(file.name)),
      category: categoryFor(file.name),
      rowCount: parsed.rows.length,
      columns: parsed.columns,
      rows: parsed.rows,
      warnings: parsed.warnings,
    });
  }

  tables.sort((a, b) => a.label.localeCompare(b.label));
  warnings.push(...tables.flatMap((table) => table.warnings.map((warning) => `${table.name}: ${warning}`)));

  return {
    id: uid(),
    importedAt: new Date().toISOString(),
    fileCount: expanded.length,
    tableCount: tables.length,
    rowCount: tables.reduce((total, table) => total + table.rowCount, 0),
    tables,
    insights: csvFiles.length ? analyzeLinkedInSignals(tables) : emptyInsights(),
    warnings,
  };
}

function findTable(snapshot: LinkedInExportSnapshot, fragment: string): LinkedInCsvTable | undefined {
  const key = fragment.toLowerCase().replace(/\.csv$/i, "").replace(/[^a-z0-9]/g, "");
  return snapshot.tables.find((table) => table.id.replace(/[^a-z0-9]/g, "").includes(key));
}

function cell(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

function monthYear(value: string): string {
  if (!value || /^(n\/a|none|present|current)$/i.test(value.trim())) return "";
  const parsed = new Date(value.trim().replace(/\s*UTC\s*$/i, "Z"));
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toLocaleString("en-US", { month: "short", year: "numeric" });
  }
  const named = value.match(/\b([A-Za-z]{3,9})\.?\s+(\d{4})\b/);
  if (named) return `${named[1].slice(0, 3)} ${named[2]}`;
  return value.trim().slice(0, 40);
}

function parseWebsites(value: string): LinkItem[] {
  const links: LinkItem[] = [];
  const bracketed = value.matchAll(/\[([^\]:]+):(https?:\/\/[^\]]+)\]/gi);
  for (const match of bracketed) {
    links.push({ label: match[1].trim(), url: match[2].trim() });
  }
  const rest = value.replace(/\[[^\]]+\]/g, "");
  for (const match of rest.matchAll(/https?:\/\/[^\s,;]+/gi)) {
    const url = match[0];
    if (!links.some((link) => link.url === url)) links.push({ label: "Website", url });
  }
  return links;
}

export function profileFromLinkedInBundle(snapshot: LinkedInExportSnapshot): Profile {
  const profile = emptyProfile();
  const profileTable = findTable(snapshot, "profile.csv");
  if (profileTable?.rows[0]) {
    const row = profileTable.rows[0];
    const first = cell(row, "First Name");
    const last = cell(row, "Last Name");
    profile.name = `${first} ${last}`.trim();
    profile.headline = cell(row, "Headline");
    profile.summary = cell(row, "Summary");
    profile.location = cell(row, "Geo Location", "Address");
    profile.links = parseWebsites(cell(row, "Websites", "Twitter Handles"));
  }

  const positions = findTable(snapshot, "positions");
  profile.experience = (positions?.rows ?? []).map<Experience>((row) => {
    const start = monthYear(cell(row, "Started On", "Start Date"));
    const end = monthYear(cell(row, "Finished On", "End Date"));
    return {
      id: uid(),
      title: cell(row, "Title", "Position"),
      company: cell(row, "Company Name", "Company"),
      location: cell(row, "Location"),
      startDate: start,
      endDate: end,
      current: !end,
      description: cell(row, "Description"),
    };
  });

  const education = findTable(snapshot, "education");
  profile.education = (education?.rows ?? []).map((row) => ({
    id: uid(),
    school: cell(row, "School Name", "School"),
    degree: cell(row, "Degree Name", "Degree"),
    field: "",
    startDate: monthYear(cell(row, "Start Date", "Started On")),
    endDate: monthYear(cell(row, "End Date", "Finished On")),
    details: [cell(row, "Notes"), cell(row, "Activities")].filter(Boolean).join(" · "),
  }));

  const certifications = findTable(snapshot, "certifications");
  profile.certifications = (certifications?.rows ?? []).map((row) => ({
    id: uid(),
    name: cell(row, "Name"),
    issuer: cell(row, "Authority"),
    date: monthYear(cell(row, "Finished On", "Started On")),
  }));

  const skills = findTable(snapshot, "skills");
  const skillGroup = makeCoreSkillGroup();
  skillGroup.items = (skills?.rows ?? [])
    .map((row) => cell(row, "Name", "Skill Name"))
    .filter(Boolean);
  if (skillGroup.items.length) profile.skills = [skillGroup];

  return normalizeProfile(profile);
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function mergeList<T>(
  primary: T[],
  secondary: T[],
  key: (item: T) => string,
  merge: (left: T, right: T) => T,
  onConflict?: (left: T, right: T) => void,
): T[] {
  const result = primary.map((item) => ({ ...item }));
  const used = new Set<number>();
  for (const incoming of secondary) {
    const incomingKey = key(incoming);
    const index = result.findIndex((item, i) => !used.has(i) && key(item) === incomingKey);
    if (index < 0) {
      result.push({ ...incoming });
      continue;
    }
    used.add(index);
    onConflict?.(result[index], incoming);
    result[index] = merge(result[index], incoming);
  }
  return result;
}

export function mergeProfileSources(resume: Profile, linkedin: Profile): { profile: Profile; conflicts: string[] } {
  const conflicts: string[] = [];
  if (resume.name && linkedin.name && !sameText(resume.name, linkedin.name)) {
    conflicts.push(`Name: resume “${resume.name}” vs LinkedIn “${linkedin.name}”. Kept resume.`);
  }
  if (resume.location && linkedin.location && !sameText(resume.location, linkedin.location)) {
    conflicts.push(`Location: resume “${resume.location}” vs LinkedIn “${linkedin.location}”. Kept resume.`);
  }
  if (resume.headline && linkedin.headline && !sameText(resume.headline, linkedin.headline)) {
    conflicts.push(`Headline differs. Kept the resume headline.`);
  }

  const experience = mergeList(
    resume.experience,
    linkedin.experience,
    (item) => `${item.title}|${item.company}`.toLowerCase(),
    (left, right) => ({
      ...left,
      startDate: left.startDate || right.startDate,
      endDate: left.endDate || right.endDate,
      current: left.current || right.current,
      location: left.location || right.location,
      description: left.description || right.description,
    }),
    (left, right) => {
      if ((left.startDate && right.startDate && !sameText(left.startDate, right.startDate)) ||
          (left.endDate && right.endDate && !sameText(left.endDate, right.endDate))) {
        conflicts.push(`Dates for ${left.title || right.title} at ${left.company || right.company} differ. Kept resume dates and filled blanks from LinkedIn.`);
      }
    },
  );

  const education = mergeList(
    resume.education,
    linkedin.education,
    (item) => item.school.toLowerCase(),
    (left, right) => ({
      ...left,
      startDate: left.startDate || right.startDate,
      endDate: left.endDate || right.endDate,
      degree: left.degree || right.degree,
      field: left.field || right.field,
      details: left.details || right.details,
    }),
    (left, right) => {
      if ((left.startDate && right.startDate && !sameText(left.startDate, right.startDate)) ||
          (left.endDate && right.endDate && !sameText(left.endDate, right.endDate))) {
        conflicts.push(`Dates for ${left.school || right.school} differ. Kept resume dates and filled blanks from LinkedIn.`);
      }
    },
  );

  const certifications = mergeList(
    resume.certifications,
    linkedin.certifications,
    (item) => item.name.toLowerCase(),
    (left, right) => ({ ...left, issuer: left.issuer || right.issuer, date: left.date || right.date }),
  );

  const skills = resume.skills.map((group) => ({ ...group, items: [...group.items] }));
  const linkedinSkills = linkedin.skills.flatMap((group) => group.items);
  const knownSkills = new Set(skills.flatMap((group) => group.items.map((item) => item.toLowerCase())));
  const additions = linkedinSkills.filter((skill) => !knownSkills.has(skill.toLowerCase()));
  if (additions.length) {
    const core = skills.find((group) => group.id === "core");
    if (core) core.items.push(...additions);
    else skills.unshift({ ...makeCoreSkillGroup(), items: additions });
  }

  const links = [...resume.links];
  for (const link of linkedin.links) {
    if (!links.some((item) => sameText(item.url, link.url))) links.push(link);
  }

  const profile = normalizeProfile({
    ...resume,
    name: resume.name || linkedin.name,
    headline: resume.headline || linkedin.headline,
    summary: resume.summary || linkedin.summary,
    location: resume.location || linkedin.location,
    links,
    experience,
    education,
    certifications,
    skills,
  });

  return { profile, conflicts };
}

export async function buildProfileImport(
  files: File[],
  text: string,
  readFileText?: ReadFileText,
): Promise<ProfileImportPreview> {
  const expanded = await expandBundleFiles(files);
  const linkedin = await parseLinkedInBundle(files);
  const csvCount = linkedin.tableCount;
  const resumeFile = expanded.find((file) => !/\.csv$/i.test(file.name) && !/\.zip$/i.test(file.name));
  if (!csvCount && !resumeFile && !text.trim()) {
    throw new Error("Choose a resume file, a LinkedIn export, or paste profile text.");
  }
  let rawText = text.trim();
  let resumeFilename = "Pasted profile text";
  if (resumeFile) {
    rawText = (await (readFileText ?? ((file) => file.text()))(resumeFile)).trim();
    resumeFilename = resumeFile.name;
  }

  const resumeProfile = rawText ? parseResumeText(rawText) : emptyProfile();
  const linkedinProfile = profileFromLinkedInBundle(linkedin);
  const pastedProfile = !rawText && text.trim() ? parseResumeText(text) : null;
  const { profile, conflicts } = mergeProfileSources(resumeProfile, pastedProfile ?? linkedinProfile);
  const importedSource = pastedProfile ?? (csvCount ? linkedinProfile : resumeProfile);
  const imported = normalizeProfile(importedSource);

  const count = (fragment: string) => findTable(linkedin, fragment)?.rowCount ?? 0;
  const detected: Record<string, number> = {
    positions: count("positions"),
    education: count("education"),
    certifications: count("certifications"),
    skills: count("skills"),
    languages: count("languages"),
    organizations: count("organizations"),
    recommendations: count("recommendations"),
    endorsements: count("endorsement"),
    learning: count("learning.csv"),
    searchQueries: count("searchqueries"),
    savedAlerts: count("savedjobalerts"),
    companyFollows: count("company follows"),
    memberFollows: count("member_follows"),
    connections: count("connections"),
    screeningAnswers: count("screening"),
  };

  const summary: ProfileImportSummary = {
    resumeFilename: rawText ? resumeFilename : "",
    linkedinFileCount: csvCount,
    detected,
    conflicts,
    warnings: linkedin.warnings,
  };

  return {
    profile,
    imported,
    summary,
    linkedin,
    rawText,
    filename: rawText ? resumeFilename : `LinkedIn export (${csvCount} CSV files)`,
  };
}
