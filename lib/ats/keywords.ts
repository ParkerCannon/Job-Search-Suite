export const STOPWORDS = new Set(
  `a an and are as at be been being by can could did do does doing for from had has have having he her here hers him his how i if in into is it its its me my no not of on or our ours out over own same she should so some such than that the their them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours about above after again against all also am any because before below between both but cannot could did each few further had has have here how more most must need new other only or per plus really require required requires role team work working years year across using used use strong ability skills experience experiences including include includes such well position candidates candidate company job opportunity opportunities looking help make able best etc first second third one two three`.split(
    /\s+/,
  ),
);

export const SKILL_TERMS = `javascript typescript python java c# c++ ruby go golang rust php swift kotlin scala sql nosql html css sass tailwind react reactjs nextjs next.js angular vue svelte jquery node nodejs node.js express nestjs django flask fastapi spring springboot rails laravel asp.net dotnet tensorflow pytorch scikit-learn sklearn keras pandas numpy scipy matplotlib seaborn opencv huggingface langchain openai anthropic rag llm nlp computer vision machine learning deep learning data science data analysis data engineering data visualization statistics statistical modeling excel power bi tableau looker snowflake databricks spark hadoop kafka airflow dbt bigquery redshift mongodb postgresql postgres mysql sqlite redis cassandra elasticsearch dynamodb docker kubernetes k8s terraform ansible jenkins github actions gitlab ci/cd ci cd aws azure gcp google cloud cloudformation lambda ec2 s3 rds iam linux unix windows bash powershell shell git github gitlab bitbucket jira confluence trello agile scrum kanban sprint product management project management stakeholder management cross-functional leadership mentoring communication collaboration problem solving critical thinking time management adaptability creativity presentation negotiation customer service sales marketing seo sem content writing copywriting graphql rest restful api apis microservices architecture system design distributed systems design patterns object oriented oop functional programming testing unit testing integration testing e2e cypress jest vitest playwright selenium pytest junit mobx redux zustand three.js webgl unity unreal engine unity3d figma sketch adobe photoshop illustrator canva solidworks autocad matlab simulink labview plc scada sap oracle salesforce hubspot shopify wordpress drupal linux networking tcp/ip cybersecurity security pen testing siem soc iam oauth jwt ssl tls encryption gdpr hipaa soc 2 iso 27001 fintech blockchain smart contracts solidity web3 crypto accounting bookkeeping quickbooks sap fpa forecasting budgeting payroll recruiting hr onboarding employee relations benefits administration training development instructional design curriculum design grant writing fundraising nonprofit operations logistics supply chain procurement inventory management manufacturing lean six sigma quality assurance qa iso 9001 customer relationship management crm b2b b2c saas product-led growth analytics ab testing sql server ssrs ssis powerapps sharepoint microsoft 365 google workspace slack zoom notion asana monday.com`.split(
    /\s+/,
  );

const MULTI_WORD_SKILLS = [
  "machine learning",
  "deep learning",
  "data science",
  "data analysis",
  "data engineering",
  "data visualization",
  "statistical modeling",
  "computer vision",
  "natural language processing",
  "project management",
  "product management",
  "stakeholder management",
  "cross functional",
  "unit testing",
  "integration testing",
  "system design",
  "distributed systems",
  "object oriented",
  "functional programming",
  "technical writing",
  "customer service",
  "power bi",
  "google cloud",
  "amazon web services",
  "microsoft azure",
  "github actions",
  "ci cd",
  "rest api",
  "graphql api",
  "software development life cycle",
  "agile methodology",
  "scrum framework",
  "software engineering",
  "full stack",
  "front end",
  "back end",
  "mlaas",
  "data pipelines",
  "feature engineering",
  "a b testing",
  "technical support",
  "process improvement",
  "quality assurance",
];

// Only whole phrases are registered — adding their individual words would make
// "stack", "api", and "design" look like standalone hard skills.
const SKILL_LOOKUP = new Set([...SKILL_TERMS, ...MULTI_WORD_SKILLS]);

const SENIORITY_TERMS = `junior associate assistant entry level intern graduate junior developer senior lead principal staff manager director head vp chief executive founder`.split(/\s+/);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, "i").test(haystack);
}

export interface ExtractedKeyword {
  term: string;
  score: number;
  isSkill: boolean;
  inRequirements: boolean;
}

export function extractKeywords(jobText: string): ExtractedKeyword[] {
  const tokens = tokenize(jobText);
  const counts = new Map<string, number>();
  const ngrams = new Map<string, number>();

  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

  // Build phrases from contiguous words on a single line. Keeping stopwords in
  // the source tokens prevents "CI/CD and Jenkins" becoming "pipelines jenkins".
  for (const line of jobText.split(/\r?\n/)) {
    const lineTokens = normalize(line).split(/\s+/).filter(Boolean);
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= lineTokens.length - n; i++) {
        const phraseTokens = lineTokens.slice(i, i + n);
        if (phraseTokens.some((word) => STOPWORDS.has(word) || /^\d+$/.test(word))) continue;
        const phrase = phraseTokens.join(" ");
        ngrams.set(phrase, (ngrams.get(phrase) ?? 0) + 1);
      }
    }
  }

  const requirementsText = normalize(
    jobText
      .split(/\r?\n/)
      .filter((line) => /require|must|qualif|you have|experience with|responsib|looking for|ideal candidate|skills/i.test(line))
      .join(" "),
  );

  const candidates = new Map<string, ExtractedKeyword>();

  for (const [term, freq] of counts) {
    if (term.length < 3 && !SKILL_LOOKUP.has(term)) continue;
    const isSkill = SKILL_LOOKUP.has(term);
    if (!isSkill && freq < 2) continue;
    const inRequirements = requirementsText.includes(term);
    const score = freq * (1 + Math.log2(term.length)) * (isSkill ? 2.2 : 1) * (inRequirements ? 1.5 : 1);
    candidates.set(term, { term, score, isSkill, inRequirements });
  }

  for (const [term, freq] of ngrams) {
    const words = term.split(" ");
    const isSkill = SKILL_LOOKUP.has(term) || words.every((w) => SKILL_LOOKUP.has(w));
    if (!isSkill && freq < 2) continue;
    const inRequirements = requirementsText.includes(term);
    const score = freq * (1 + Math.log2(term.length)) * (isSkill ? 2.6 : 1) * (inRequirements ? 1.5 : 1);
    candidates.set(term, { term, score, isSkill, inRequirements });
    for (const word of words) candidates.delete(word);
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, 40);
}

export function findSkillMentions(text: string): Set<string> {
  const normalized = normalize(text);
  const found = new Set<string>();
  for (const term of SKILL_LOOKUP) {
    if (containsTerm(normalized, term)) found.add(term);
  }
  return found;
}

export function extractRequiredYears(jobText: string): number | null {
  const patterns = [
    /(\d{1,2})\s*\+?\s*(?:to\s*\d{1,2}\s*)?years?\s*(?:of\s*)?(?:relevant\s*|professional\s*|industry\s*|work\s*)?experience/i,
    /(?:minimum|at least|min\.?)\s*(\d{1,2})\s*\+?\s*years?/i,
    /(\d{1,2})\+?\s*years?\s*in\s*/i,
  ];
  for (const pattern of patterns) {
    const match = jobText.match(pattern);
    if (match) {
      const years = Number(match[1]);
      if (years >= 1 && years <= 30) return years;
    }
  }
  return null;
}

export function estimateYears(text: string): number | null {
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  if (!years.length) return null;
  const earliest = Math.min(...years.filter((y) => y >= 1970 && y <= new Date().getFullYear() + 1));
  if (!earliest || earliest < 1970) return null;
  return Math.max(0, Math.min(45, new Date().getFullYear() - earliest));
}

export function isSeniorityTerm(term: string): boolean {
  return SENIORITY_TERMS.includes(term);
}
