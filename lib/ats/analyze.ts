import { aiSummary } from "../ai";
import type {
  AppSettings,
  AtsFlag,
  AtsResult,
  AtsView,
  JobDescription,
  KeywordHit,
  Profile,
  ProfileSource,
  ScoreCategory,
} from "../types";
import { flattenSkillGroups } from "../types";
import {
  estimateYears,
  extractKeywords,
  extractRequiredYears,
  findSkillMentions,
  normalize,
} from "./keywords";

const SECTION_PATTERNS: Record<string, RegExp> = {
  Summary: /^(professional\s+)?(summary|profile|objective|about)\b/i,
  Experience: /^(work\s+)?(experience|employment|history|career)\b/i,
  Education: /^(education|academic)\b/i,
  Skills: /^(technical\s+)?(skills?|technologies|competenc)/i,
  Projects: /^(projects?|portfolio)\b/i,
  Certifications: /^(certifications?|licenses?)\b/i,
};

export function profileToText(profile: Profile): string {
  const parts: string[] = [
    profile.name,
    profile.headline,
    [profile.email, profile.phone, profile.location, ...profile.links.map((l) => l.url)]
      .filter(Boolean)
      .join(" | "),
    "SUMMARY",
    profile.summary,
    "EXPERIENCE",
    ...profile.experience.flatMap((e) => [
      [e.title, e.company, e.location, e.startDate, e.endDate].filter(Boolean).join(" | "),
      e.description,
    ]),
    "EDUCATION",
    ...profile.education.flatMap((e) => [
      [e.school, e.degree, e.field, e.startDate, e.endDate].filter(Boolean).join(" | "),
      e.details,
    ]),
    "SKILLS",
    flattenSkillGroups(profile.skills).join(", "),
    "PROJECTS",
    ...profile.projects.map((p) => `${p.name}: ${p.description}`),
    "CERTIFICATIONS",
    ...profile.certifications.map((c) => `${c.name} — ${c.issuer}`),
  ];
  return parts.filter(Boolean).join("\n");
}

function buildAtsView(rawText: string): AtsView {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const detectedSections = Object.entries(SECTION_PATTERNS)
    .filter(([, pattern]) => lines.some((line) => pattern.test(line)))
    .map(([name]) => name);
  const wordCount = rawText.split(/\s+/).filter(Boolean).length;
  const bulletLines = lines.filter((l) => /^[\u2022\u25cf\-\*\u2013\u2014\u00b7]\s+/.test(l)).length;
  const numericAchievements = lines.filter(
    (l) => /^[\u2022\u25cf\-\*\u2013\u2014\u00b7]\s+/.test(l) && /[\d$%]/.test(l),
  ).length;
  const dateFormats = [
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/i.test(rawText) ? "Mon YYYY" : "",
    /\b\d{1,2}\/\d{4}\b/.test(rawText) ? "MM/YYYY" : "",
    /\b(?:19|20)\d{2}\b/.test(rawText) ? "YYYY" : "",
  ].filter(Boolean);
  const likelyColumnsOrTables =
    lines.some((l) => (l.match(/\t/g) ?? []).length >= 3) ||
    rawText.split(/\r?\n/).some((l) => / {8,}/.test(l));

  return {
    wordCount,
    detectedSections,
    missingSections: ["Summary", "Experience", "Education", "Skills"].filter((s) => !detectedSections.includes(s)),
    contact: {
      email: /[\w.+-]+@[\w-]+\.[\w.-]+/.test(rawText),
      phone: /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(rawText),
      links: /linkedin\.com|github\.com|https?:\/\//i.test(rawText),
      location: /,?\s[A-Z]{2}\s?\d{5}|[A-Z][a-z]+,\s*[A-Z][a-z]+/.test(rawText),
    },
    dateFormats,
    bulletLines,
    numericAchievements,
    likelyColumnsOrTables,
    estimatedYears: estimateYears(rawText),
    extractedName: lines[0]?.slice(0, 80) ?? "",
  };
}

function yearsFromExperience(profile: Profile): number | null {
  const years = profile.experience
    .flatMap((e) => [e.startDate, e.endDate])
    .map((value) => Number(value.match(/\b(19|20)\d{2}\b/)?.[0]))
    .filter((year) => year >= 1970 && year <= new Date().getFullYear() + 1);
  if (!years.length) return null;
  return Math.max(0, Math.min(45, new Date().getFullYear() - Math.min(...years)));
}

function buildFlags(view: AtsView, missingKeywords: KeywordHit[], requiredYears: number | null): AtsFlag[] {
  const flags: AtsFlag[] = [];

  if (!view.contact.email)
    flags.push({ severity: "high", title: "No email address detected", detail: "The parser could not find an email anywhere in the document.", fix: "Put your email in plain text near the top of the resume — not in a header, footer, or text box." });
  if (!view.contact.phone)
    flags.push({ severity: "medium", title: "No phone number detected", detail: "A phone number was not extracted.", fix: "Add a plain-text phone number next to your email." });
  if (view.wordCount < 150)
    flags.push({ severity: "high", title: "Very little extractable text", detail: `Only ${view.wordCount} words were extracted. This often means the resume is an image, scanned PDF, or uses text boxes.`, fix: "Export as a text-based PDF or DOCX with a single column and standard fonts." });
  if (view.likelyColumnsOrTables)
    flags.push({ severity: "medium", title: "Columns or tables detected", detail: "Multi-column layouts and tables are frequently read in the wrong order by ATS parsers.", fix: "Use a single-column layout with simple headings and bullet lists." });
  if (view.missingSections.length)
    flags.push({ severity: "high", title: `Missing standard sections: ${view.missingSections.join(", ")}`, detail: "Many parsers rely on conventional section headings to place your content correctly.", fix: `Add clearly labelled headings for ${view.missingSections.join(", ")}.` });
  if (view.dateFormats.includes("Mon YYYY") && view.dateFormats.includes("MM/YYYY"))
    flags.push({ severity: "low", title: "Mixed date formats", detail: "Both month-name and numeric date formats appear in the document.", fix: "Use one date format everywhere, e.g. 'Jan 2023 – Present'." });
  if (view.bulletLines > 0 && view.numericAchievements / view.bulletLines < 0.25)
    flags.push({ severity: "medium", title: "Few quantified achievements", detail: `Only ${view.numericAchievements} of ${view.bulletLines} bullets contain a number, percentage, or dollar amount.`, fix: "Add measurable results — e.g. 'reduced load time by 35%' or 'managed a $2M budget'." });
  if (requiredYears && view.estimatedYears !== null && view.estimatedYears < requiredYears)
    flags.push({ severity: "medium", title: `Experience gap: ~${view.estimatedYears} years found vs ${requiredYears}+ required`, detail: "The dates in your resume suggest less experience than the job asks for.", fix: "Surface relevant internships, contracts, and projects, and lead with the most recent, most relevant roles." });
  if (missingKeywords.length >= 5)
    flags.push({ severity: "medium", title: `${missingKeywords.length} important keywords are absent`, detail: "These terms appear in the job description but not in your resume.", fix: "Where truthful, mirror the employer's exact wording for skills and tools you actually have." });

  return flags;
}

export async function analyzeResume(options: {
  job: Pick<JobDescription, "title" | "rawText">;
  profile: Profile;
  source: ProfileSource;
  rawText: string;
  settings: AppSettings;
}): Promise<AtsResult> {
  const { job, profile, source, settings } = options;
  const rawText = options.rawText || profileToText(profile);
  const normalizedResume = normalize(rawText);
  const normalizedJob = normalize(job.rawText);

  const view = buildAtsView(rawText);
  const profileYears = yearsFromExperience(profile);
  if (profileYears !== null) view.estimatedYears = profileYears;

  const keywords = extractKeywords(job.rawText);
  const topKeywords = keywords.slice(0, 30);
  const maxScore = Math.max(1, ...topKeywords.map((k) => k.score));

  const matchedKeywords: KeywordHit[] = [];
  const missingKeywords: KeywordHit[] = [];
  for (const keyword of topKeywords) {
    const found = normalizedResume.includes(keyword.term) || normalizedJob === normalizedResume;
    const hit: KeywordHit = {
      term: keyword.term,
      importance: Math.round((keyword.score / maxScore) * 100),
      found,
      context: keyword.isSkill ? "Skill / tool" : keyword.inRequirements ? "Requirements" : "Job description",
    };
    (found ? matchedKeywords : missingKeywords).push(hit);
  }
  missingKeywords.sort((a, b) => b.importance - a.importance);

  const keywordWeightTotal = matchedKeywords.concat(missingKeywords).reduce((sum, k) => sum + k.importance, 0);
  const keywordScore = keywordWeightTotal
    ? Math.round((matchedKeywords.reduce((sum, k) => sum + k.importance, 0) / keywordWeightTotal) * 100)
    : 60;

  const requiredSkills = findSkillMentions(job.rawText);
  const resumeSkills = findSkillMentions(rawText);
  const matchedSkills = [...requiredSkills].filter((s) => resumeSkills.has(s));
  const skillsScore = requiredSkills.size
    ? Math.round((matchedSkills.length / requiredSkills.size) * 100)
    : Math.min(100, 45 + resumeSkills.size * 2);

  const requiredYears = extractRequiredYears(job.rawText);
  const estimatedYears = view.estimatedYears;
  let experienceScore: number;
  if (requiredYears) {
    experienceScore = estimatedYears === null ? 45 : Math.min(100, Math.round((estimatedYears / requiredYears) * 100));
  } else if (estimatedYears !== null) {
    experienceScore = Math.min(100, 35 + estimatedYears * 9);
  } else {
    experienceScore = Math.min(100, 30 + profile.experience.length * 12);
  }

  const contactPoints = Object.values(view.contact).filter(Boolean).length;
  const sectionPoints = 4 - view.missingSections.length;
  const structureScore = Math.min(100, Math.round(sectionPoints * 15 + contactPoints * 7 + (view.wordCount >= 350 ? 15 : 5) + (view.likelyColumnsOrTables ? 0 : 10)));

  const achievementRatio = view.bulletLines ? view.numericAchievements / view.bulletLines : 0;
  const actionVerbBonus = /(?:led|built|created|improved|delivered|designed|launched|reduced|increased|managed|developed|implemented|optimized)/i.test(rawText) ? 15 : 0;
  const achievementsScore = Math.min(100, Math.round(20 + achievementRatio * 140 + actionVerbBonus));

  const weights = settings.weights;
  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const categoryDefs: ScoreCategory[] = [
    { key: "keywords", label: "Keyword coverage", score: keywordScore, weight: weights.keywords ?? 40, detail: `${matchedKeywords.length} of ${matchedKeywords.length + missingKeywords.length} high-value terms found` },
    { key: "skills", label: "Hard-skill match", score: skillsScore, weight: weights.skills ?? 25, detail: `${matchedSkills.length} of ${requiredSkills.size} detected job skills present` },
    { key: "experience", label: "Experience alignment", score: experienceScore, weight: weights.experience ?? 15, detail: requiredYears ? `~${estimatedYears ?? "?"} years found, ${requiredYears}+ requested` : `${profile.experience.length} roles listed` },
    { key: "structure", label: "ATS structure", score: structureScore, weight: weights.structure ?? 10, detail: `${view.missingSections.length ? `Missing ${view.missingSections.join(", ")}` : "All standard sections present"}` },
    { key: "achievements", label: "Quantified impact", score: achievementsScore, weight: weights.achievements ?? 10, detail: `${view.numericAchievements} of ${view.bulletLines} bullets include numbers` },
  ];

  const overall = Math.round(
    categoryDefs.reduce((sum, c) => sum + c.score * c.weight, 0) / weightTotal,
  );

  const flags = buildFlags(view, missingKeywords, requiredYears);
  const aiSummaryText = await aiSummary(settings.ai, {
    jobTitle: job.title,
    jobText: job.rawText,
    score: overall,
    missing: missingKeywords.map((k) => k.term),
    matched: matchedKeywords.map((k) => k.term),
  });

  return {
    overall,
    categories: categoryDefs,
    matchedKeywords,
    missingKeywords,
    flags,
    atsView: view,
    aiSummary: aiSummaryText,
    source,
    jobTitle: job.title,
    weights,
    createdAt: new Date().toISOString(),
  };
}
