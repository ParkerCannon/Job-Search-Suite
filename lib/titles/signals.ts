import { findSkillMentions, normalize, STOPWORDS } from "@/lib/ats/keywords";
import { flattenSkillGroups, type Profile } from "@/lib/types";

export interface WeightedTerm {
  term: string;
  weight: number;
}

export interface ProfileSignals {
  terms: WeightedTerm[];
  skillTerms: string[];
  titles: string[];
}

// Words that are too broad to carry meaning on their own when they appear
// inside a phrase like "project management" or "quality control".
const GENERIC_DECOMPOSITION_TERMS = new Set(
  `management microsoft quality control technical senior junior lead principal staff director head chief executive vice president engineer coordinator manager specialist associate assistant professional support services solutions systems products time problem solving status reporting prioritization job task cross functional communication collaboration detail oriented`.split(
    /\s+/,
  ),
);

const EXTRA_STOPWORDS = new Set(
  `inc llc ltd corp company corporation university college school institute academy bachelor master masters doctorate degree certificate certification certified associate senior junior lead principal staff manager director head vice president executive founder owner volunteer internship intern remote hybrid onsite fulltime parttime contract temporary permanent current presently previous prior experience experiences skilled responsible responsibilities duties achievements accomplished results team player self starter fast paced detail oriented hard working longtime years year month months date dates present summary objective profile contact email phone website linkedin github portfolio references available request first last middle mr mrs ms dr`.split(
    /\s+/,
  ),
);

function meaningfulTokens(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token) && !EXTRA_STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function addTerm(counts: Map<string, number>, term: string, weight: number, personalTokens: Set<string>) {
  const cleaned = normalize(term).trim();
  if (!cleaned || personalTokens.has(cleaned)) return;
  const words = cleaned.split(/\s+/);
  if (words.length > 5) return;
  if (words.some((word) => personalTokens.has(word))) return;
  const meaningful = words.filter((word) => !STOPWORDS.has(word) && !EXTRA_STOPWORDS.has(word));
  if (!meaningful.length) return;
  counts.set(cleaned, (counts.get(cleaned) ?? 0) + weight);
  if (words.length === 1) return;
  for (const word of meaningful) {
    if (word.length >= 3 && !GENERIC_DECOMPOSITION_TERMS.has(word)) {
      counts.set(word, (counts.get(word) ?? 0) + weight * 0.35);
    }
  }
}

export function buildProfileSignals(profile: Profile, targetRole: string, searchKeywords: string[] = []): ProfileSignals {
  const counts = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  const skillTerms = new Set<string>();

  const personalTokens = new Set(
    [profile.name, profile.email, profile.phone, profile.location]
      .flatMap((value) => normalize(value).split(/\s+/))
      .filter((token) => token.length >= 2),
  );

  const skillNames = flattenSkillGroups(profile.skills);

  const addTitle = (title: string, weight: number) => {
    const cleaned = normalize(title).trim();
    if (!cleaned || cleaned.length < 3 || cleaned.length > 80) return;
    titleCounts.set(cleaned, (titleCounts.get(cleaned) ?? 0) + weight);
    addTerm(counts, cleaned, weight * 1.4, personalTokens);
  };

  const addText = (text: string, weight: number) => {
    if (!text?.trim()) return;
    addTerm(counts, text, weight, personalTokens);
  };

  if (targetRole.trim()) {
    addTitle(targetRole, 8);
    addTerm(counts, targetRole, 6, personalTokens);
  }
  for (const keyword of searchKeywords.slice(0, 30)) {
    addTerm(counts, keyword, 2.5, personalTokens);
  }
  addTitle(profile.headline, 3.5);
  addText(profile.summary, 0.8);

  profile.experience.forEach((item, index) => {
    const recency = index === 0 ? 1 : Math.max(0.4, 1 - index * 0.1);
    addTitle(item.title, 6 * recency);
    addText(item.description, 0.75 * recency);
  });

  for (const skill of skillNames) {
    addTerm(counts, skill, 5, personalTokens);
    if (skill.includes(" ")) skillTerms.add(normalize(skill));
  }

  for (const cert of profile.certifications) {
    addText(cert.name, 2);
    addText(cert.issuer, 0.5);
  }

  for (const project of profile.projects) {
    addText(project.name, 1.5);
    addText(project.description, 0.5);
  }

  for (const education of profile.education) {
    addText(education.field, 1.2);
    addText(education.degree, 0.8);
  }

  const profileText = [
    profile.headline,
    profile.summary,
    skillNames.join(" "),
    profile.experience.map((item) => `${item.title} ${item.description}`).join(" "),
    profile.certifications.map((item) => `${item.name} ${item.issuer}`).join(" "),
    profile.projects.map((item) => `${item.name} ${item.description}`).join(" "),
  ].join(" ");
  for (const skill of findSkillMentions(profileText)) {
    if (GENERIC_DECOMPOSITION_TERMS.has(skill)) continue;
    skillTerms.add(skill);
  }

  for (const skill of skillTerms) addTerm(counts, skill, 3, personalTokens);

  const terms = [...counts.entries()]
    .filter(([term, weight]) => weight >= 0.8 && meaningfulTokens(term).length > 0)
    .map(([term, weight]) => ({ term, weight: Math.round(weight * 10) / 10 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 36);

  const titles = [...titleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([title]) => title)
    .slice(0, 12);

  return { terms, skillTerms: [...skillTerms].sort(), titles };
}
