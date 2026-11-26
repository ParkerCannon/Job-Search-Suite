import { flattenSkillGroups, type Profile } from "../types";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const BASE_MARGIN_X = 54; // 0.75in
const BASE_MARGIN_Y = 43.2; // 0.6in
const TIGHT_MARGIN = 36; // 0.5in
const BASE_BODY_SIZE = 10;
const MIN_BODY_SIZE = 9.5;
const BULLET_TEXT_INDENT = 14;
const BULLET_GLYPH_INDENT = 3;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ACTION_VERBS = new Set(
  `achieved built coordinated created delivered designed developed directed drove established executed generated
   implemented improved increased led managed maintained operated optimized organized oversaw prepared produced
   reduced resolved supported trained verified wrote`
    .split(/\s+/)
    .filter(Boolean),
);

type Rgb = [number, number, number];
type JsPdf = InstanceType<(typeof import("jspdf"))["jsPDF"]>;
type JsPdfConstructor = (typeof import("jspdf"))["jsPDF"];
type Margins = { x: number; y: number };
type RenderOptions = { margins: Margins; bodySize: number };

const ACCENT: Rgb = [31, 58, 95]; // #1F3A5F
const BODY: Rgb = [17, 17, 17]; // #111111
const MUTED: Rgb = [68, 68, 68]; // #444444

/** Keeps real text intact, including `ü`, `•`, and `+`, while removing control characters. */
function cleanText(value: string): string {
  return (value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\t/g, " ")
    .trim();
}

function safeFilename(name: string): string {
  const base = cleanText(name)
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "resume"}-resume.pdf`;
}

function displayUrl(value: string): string {
  return cleanText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function normalizeMonthYear(value: string): string {
  const text = cleanText(value).replace(/\s+/g, " ");
  if (!text) return "";
  if (/^(present|current|now)$/i.test(text)) return "Present";

  const named = text.match(/^([A-Za-z]{3,})\.?\s+((?:19|20)\d{2})$/);
  if (named) {
    const month = MONTHS.find((candidate) => candidate.toLowerCase() === named[1].slice(0, 3).toLowerCase());
    if (month) return `${month} ${named[2]}`;
  }

  const numeric = text.match(/^(\d{1,2})\s*\/\s*((?:19|20)\d{2})$/);
  if (numeric) {
    const monthIndex = Number(numeric[1]) - 1;
    if (monthIndex >= 0 && monthIndex < MONTHS.length) return `${MONTHS[monthIndex]} ${numeric[2]}`;
  }

  return "";
}

function dateRange(start: string, end: string, current: boolean): string {
  const startDate = normalizeMonthYear(start);
  const endDate = current ? "Present" : normalizeMonthYear(end);
  return [startDate, endDate].filter(Boolean).join(" - ");
}

function splitBullets(description: string): string[] {
  return cleanText(description)
    .split(/\n/)
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
}

function bulletScore(text: string): number {
  const value = cleanText(text);
  const firstWord = value.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "").toLowerCase() ?? "";
  let score = 0;
  if (/\d/.test(value)) score += 4;
  if (ACTION_VERBS.has(firstWord)) score += 3;
  if (/\b(responsible for|helped|worked|assisted with|tasked with)\b/i.test(value)) score -= 3;
  if (value.length > 45) score += 1;
  return score;
}

/** Non-destructive one-page helper: drops the weakest bullets only from long roles. */
function trimLowValueBullets(profile: Profile): Profile {
  const experience = profile.experience.map((role) => {
    const bullets = splitBullets(role.description);
    if (bullets.length <= 3) return role;
    const ranked = bullets
      .map((text, index) => ({ text, index, score: bulletScore(text) }))
      .sort((a, b) => a.score - b.score || b.index - a.index);
    const drop = new Set(ranked.slice(0, bullets.length - 3).map((item) => item.index));
    return {
      ...role,
      description: bullets.filter((_, index) => !drop.has(index)).join("\n"),
    };
  });
  return { ...profile, experience };
}

function renderCandidate(jsPDF: JsPdfConstructor, profile: Profile, options: RenderOptions): JsPdf {
  const doc: JsPdf = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const { x: marginX, y: marginY } = options.margins;
  const contentWidth = PAGE_WIDTH - marginX * 2;
  const top = marginY + 20;
  const bottom = PAGE_HEIGHT - marginY;
  const leading = options.bodySize + 3;
  const metaSize = Math.min(9.5, options.bodySize);
  let y = top;

  doc.setProperties({
    title: `${cleanText(profile.name) || "Resume"} - Resume`,
    author: cleanText(profile.name) || "Resume",
    subject: "Resume",
    creator: "Job Search Suite",
  });

  function ensureSpace(height: number) {
    if (y + height > bottom) {
      doc.addPage();
      y = top;
    }
  }

  function write(
    text: string,
    width: number,
    size: number,
    lineHeight: number,
    style: "normal" | "bold" = "normal",
    color: Rgb = BODY,
    startX: number = marginX,
  ) {
    const value = cleanText(text);
    if (!value) return;
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(value, width) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, startX, y);
      y += lineHeight;
    }
  }

  function writeCentered(
    text: string,
    width: number,
    size: number,
    lineHeight: number,
    style: "normal" | "bold" = "normal",
    color: Rgb = BODY,
  ) {
    const value = cleanText(text);
    if (!value) return;
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(value, width) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, PAGE_WIDTH / 2, y, { align: "center" });
      y += lineHeight;
    }
  }

  function section(title: string) {
    ensureSpace(38);
    y += 9;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(title, marginX, y);
    y += 5;
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, PAGE_WIDTH - marginX, y);
    y += 14;
  }

  function writeBullet(text: string) {
    const value = cleanText(text);
    if (!value) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(options.bodySize);
    const lines = doc.splitTextToSize(value, contentWidth - BULLET_TEXT_INDENT - 3) as string[];
    ensureSpace(lines.length * leading + 1);
    y += 1;
    doc.setTextColor(BODY[0], BODY[1], BODY[2]);
    doc.text("•", marginX + BULLET_GLYPH_INDENT, y);
    doc.text(lines[0] ?? "", marginX + BULLET_TEXT_INDENT, y);
    y += leading;
    for (const line of lines.slice(1)) {
      ensureSpace(leading);
      doc.text(line, marginX + BULLET_TEXT_INDENT, y);
      y += leading;
    }
  }

  function writeSkillGroup(label: string, items: string[]) {
    const values = items.filter(Boolean).join(", ");
    if (!label.trim() || !values) return;
    const heading = `${cleanText(label).trim()}:`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(options.bodySize);
    const labelWidth = doc.getTextWidth(`${heading} `);
    const lines = doc.splitTextToSize(values, Math.max(80, contentWidth - labelWidth)) as string[];
    ensureSpace(lines.length * leading + 2);
    y += 2;
    doc.setTextColor(BODY[0], BODY[1], BODY[2]);
    doc.setFont("helvetica", "bold");
    doc.text(heading, marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text(lines[0] ?? "", marginX + labelWidth, y);
    y += leading;
    for (const line of lines.slice(1)) {
      ensureSpace(leading);
      doc.text(line, marginX, y);
      y += leading;
    }
  }

  function writeEntry(title: string, meta: string, bullets: string[]) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(options.bodySize);
    const firstBulletLines = bullets.length
      ? (doc.splitTextToSize(cleanText(bullets[0]), contentWidth - BULLET_TEXT_INDENT - 3) as string[]).length
      : 0;
    ensureSpace(leading * (2 + Math.min(firstBulletLines, 2)) + (bullets.length ? 12 : 0));
    write(title, contentWidth, options.bodySize, leading, "bold", BODY);
    if (meta) write(meta, contentWidth, metaSize, leading - 1, "normal", MUTED);
    for (const bullet of bullets) writeBullet(bullet);
    y += 5;
  }

  // Header: centered name, target title, and two plain-text contact lines.
  writeCentered(profile.name || "Your Name", contentWidth, 20, 15, "bold", ACCENT);
  writeCentered(profile.headline, contentWidth, 11, 15, "normal", BODY);

  const lineOne = [profile.location, profile.phone, profile.email]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" | ");
  writeCentered(lineOne, contentWidth, 9, 12, "normal", MUTED);

  const links = profile.links
    .map((link) => displayUrl(link.url))
    .filter(Boolean);
  const lineTwo = links.join(" | ");
  writeCentered(lineTwo, contentWidth, 9, 12, "normal", MUTED);

  const summary = cleanText(profile.summary).replace(/\s+/g, " ");
  if (summary) {
    section("PROFESSIONAL SUMMARY");
    write(summary, contentWidth, options.bodySize, leading, "normal", BODY);
  }

  if (profile.experience.length) {
    section("EXPERIENCE");
    for (const role of profile.experience) {
      const title = [role.title, role.company].map((value) => cleanText(value)).filter(Boolean).join(", ");
      const meta = dateRange(role.startDate, role.endDate, role.current);
      const withLocation = [meta, cleanText(role.location)].filter(Boolean).join(" | ");
      writeEntry(title, withLocation, splitBullets(role.description));
    }
  }

  const skillGroups = flattenSkillGroups(profile.skills).length
    ? profile.skills
    : [];
  if (skillGroups.length) {
    section("SKILLS");
    for (const group of skillGroups) {
      writeSkillGroup(group.group, group.items);
    }
  }

  if (profile.certifications.length) {
    section("CERTIFICATIONS");
    for (const cert of profile.certifications) {
      const value = [cert.name, cert.issuer, normalizeMonthYear(cert.date)]
        .map((item) => cleanText(item))
        .filter(Boolean)
        .join(" | ");
      writeBullet(value);
    }
  }

  if (profile.education.length) {
    section("EDUCATION");
    for (const edu of profile.education) {
      const title = [edu.degree, edu.field, edu.school]
        .map((value) => cleanText(value))
        .filter(Boolean)
        .join(", ");
      writeEntry(title, dateRange(edu.startDate, edu.endDate, false), []);
    }
  }

  if (profile.projects.length) {
    section("PROJECTS");
    for (const project of profile.projects) {
      const title = [project.name, displayUrl(project.link)]
        .map((value) => cleanText(value))
        .filter(Boolean)
        .join(", ");
      writeEntry(title, "", splitBullets(project.description));
    }
  }

  return doc;
}

export async function exportProfilePdf(profile: Profile): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const build = (candidate: Profile, margins: Margins, bodySize: number) =>
    renderCandidate(jsPDF, candidate, { margins, bodySize });

  let doc = build(profile, { x: BASE_MARGIN_X, y: BASE_MARGIN_Y }, BASE_BODY_SIZE);

  if (doc.getNumberOfPages() > 1) {
    doc = build(trimLowValueBullets(profile), { x: BASE_MARGIN_X, y: BASE_MARGIN_Y }, BASE_BODY_SIZE);
  }

  if (doc.getNumberOfPages() > 1) {
    doc = build(trimLowValueBullets(profile), { x: TIGHT_MARGIN, y: TIGHT_MARGIN }, BASE_BODY_SIZE);
  }

  if (doc.getNumberOfPages() > 1) {
    doc = build(trimLowValueBullets(profile), { x: TIGHT_MARGIN, y: TIGHT_MARGIN }, MIN_BODY_SIZE);
  }

  doc.save(safeFilename(profile.name));
}
