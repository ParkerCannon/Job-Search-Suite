import type { AtsResult, Profile, Recommendation } from "../types";
import { findSkillMentions, extractRequiredYears } from "./keywords";
import { uid } from "../types";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

const GENERIC_TERMS = new Set(["design", "integration", "api", "full", "stack", "pipelines", "services", "management"]);

function toTitleCaseList(terms: string[], limit: number): string {
  return terms.slice(0, limit).join(", ");
}

export function buildRecommendations(
  result: AtsResult,
  profile: Profile,
  profileText: string,
  jobText: string,
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const missingTerms = result.missingKeywords.map((k) => k.term);
  const foundTerms = result.matchedKeywords.map((k) => k.term);

  if (missingTerms.length) {
    const top = missingTerms.slice(0, 10);
    recommendations.push({
      id: uid(),
      type: "keyword",
      priority: "high",
      title: `Mirror ${missingTerms.length} missing job keywords`,
      detail: `The description uses these terms but your resume does not. Keyword scanners look for the employer's exact wording, so a synonym may not count.`,
      suggestion: `Only where it is truthful, work in these exact phrases: ${toTitleCaseList(top, 10)}. Best places: your Skills line and the experience bullets that already describe this work.`,
      location: "Skills + Experience",
    });
  }

  const jobSkills = findSkillMentions(jobText);
  const resumeSkills = findSkillMentions(profileText);
  const missingSkillPool = [...jobSkills].filter((skill) => !resumeSkills.has(skill));
  // Drop fragments like "stack" or "api" when the full phrase is already present.
  const missingSkills = missingSkillPool
    .filter((skill) => !GENERIC_TERMS.has(skill))
    .filter((skill) => !missingSkillPool.some((other) => other !== skill && other.includes(skill)))
    .slice(0, 12);
  if (missingSkills.length) {
    recommendations.push({
      id: uid(),
      type: "skill",
      priority: missingSkills.length >= 5 ? "high" : "medium",
      title: `${missingSkills.length} mentioned skills are absent`,
      detail: "These are recognizable tools, technologies, or domain skills pulled from the posting.",
      suggestion: `If you have used them, add to Skills: ${toTitleCaseList(missingSkills, 12)}. If you have not, consider whether a nearby project or course covers the underlying concept.`,
      location: "Skills section",
    });
  }

  for (const flag of result.flags) {
    // Already covered by the keyword recommendation above.
    if (/important keywords are absent/i.test(flag.title)) continue;
    const lower = flag.title.toLowerCase();
    const isFormat = /section|text|column|date|email|phone|table/i.test(lower);
    const isAchievement = /quantif|achievement|bullet/i.test(lower);
    recommendations.push({
      id: uid(),
      type: isFormat ? "format" : isAchievement ? "achievement" : "experience",
      priority: flag.severity,
      title: flag.title,
      detail: flag.detail,
      suggestion: flag.fix,
      location: isAchievement ? "Experience bullets" : isFormat ? "Formatting" : "Experience",
    });
  }

  const view = result.atsView;
  if (view.bulletLines > 0 && view.numericAchievements / view.bulletLines < 0.3) {
    recommendations.push({
      id: uid(),
      type: "achievement",
      priority: "medium",
      title: "Turn one duty into a measured result",
      detail: `Only ${view.numericAchievements} of ${view.bulletLines} bullets contain a number. Recruiters and scanners both respond to concrete impact.`,
      suggestion: "Rewrite one bullet as: 'Built [thing] with [technology], reducing [metric] by 30% / serving 200+ users / cutting runtime from X to Y.' Use your real numbers.",
      location: "Experience bullets",
    });
  }

  const jobTitle = jobText.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const titleWords = jobTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !/^(senior|junior|with|for|and|the)$/.test(w));
  const headline = profile.headline.toLowerCase();
  const missingTitleWords = titleWords.filter((word) => !headline.includes(word) && !profileText.toLowerCase().includes(word));
  if (profile.headline && missingTitleWords.length >= 2) {
    recommendations.push({
      id: uid(),
      type: "headline",
      priority: "medium",
      title: "Align your headline with the target role",
      detail: `Your headline is "${profile.headline}". The posting is titled "${jobTitle}".`,
      suggestion: `If it accurately describes you, try a headline closer to: "${jobTitle}". Keep it truthful — do not claim a level you have not held.`,
      location: "Headline",
    });
  }

  const requiredYears = extractRequiredYears(jobText);
  if (requiredYears && view.estimatedYears !== null && view.estimatedYears < requiredYears) {
    recommendations.push({
      id: uid(),
      type: "experience",
      priority: "high",
      title: `Close the ${requiredYears - view.estimatedYears}-year experience gap on paper`,
      detail: `Your dates suggest about ${view.estimatedYears} years; the posting asks for ${requiredYears}+.`,
      suggestion: "Move relevant contracts, internships, and side projects into Experience, and lead with the most recent role that uses the job's core technologies.",
      location: "Experience order",
    });
  }

  if (foundTerms.length >= 3) {
    recommendations.push({
      id: uid(),
      type: "keyword",
      priority: "low",
      title: "Keep what already matches",
      detail: `Your resume already contains ${foundTerms.length} of the posting's high-value terms.`,
      suggestion: `Do not remove or bury these: ${toTitleCaseList(foundTerms, 8)}. Keep them near the top of the relevant sections.`,
      location: "Existing strengths",
    });
  }

  return recommendations.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
