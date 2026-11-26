import { emptyProfile, makeCoreSkillGroup, uid, type Profile } from "../types";
import { parseResumeText } from "./resume";

type AnyObject = Record<string, unknown>;

function isObject(value: unknown): value is AnyObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findValuesByKey(root: unknown, keyFragment: string): unknown[] {
  const results: unknown[] = [];
  const seen = new WeakSet<object>();
  const target = keyFragment.toLowerCase();

  function walk(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (seen.has(value as object)) return;
    seen.add(value as object);
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(value as AnyObject)) {
      if (key.toLowerCase().includes(target)) results.push(child);
      walk(child);
    }
  }
  walk(root);
  return results;
}

function asArray(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (isObject(value)) {
    const nested = Object.values(value).find(Array.isArray);
    if (nested) return nested;
    return [value];
  }
  return [];
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (isObject(value)) {
    const name = value.name ?? value.formattedName ?? value.text ?? value.value;
    if (typeof name === "string") return name.trim();
  }
  return "";
}

function formatDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (isObject(value)) {
    const year = asString(value.year);
    const month = asString(value.month);
    if (year && month) return `${month.slice(0, 3)} ${year}`;
    if (year) return year;
  }
  return "";
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map(asString).filter((s) => s.length >= 2 && s.length <= 60))];
}

export function parseLinkedInText(raw: string): Profile {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const withoutHtml = trimmed.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    return parseResumeText(withoutHtml);
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return parseResumeText(trimmed);
  }

  const profile = emptyProfile();
  const profileObj = (findValuesByKey(data, "profile").find(isObject) ?? data) as AnyObject;

  profile.name =
    [asString(profileObj.firstName), asString(profileObj.lastName)].filter(Boolean).join(" ") ||
    asString(profileObj.formattedName) ||
    asString(profileObj.name);

  profile.headline = asString(profileObj.headline) || asString(profileObj.occupation);
  profile.summary = asString(profileObj.summary) || asString(profileObj.about);

  const locationValue = profileObj.location ?? findValuesByKey(data, "location")[0];
  profile.location = asString(locationValue);

  for (const key of ["emailAddress", "email", "contactInfo"]) {
    const value = findValuesByKey(data, key)[0];
    const text = asString(value);
    if (/@/.test(text)) profile.email = text;
    if (profile.email) break;
  }
  for (const key of ["phoneNumber", "phone"]) {
    const text = asString(findValuesByKey(data, key)[0]);
    if (/\d{7,}/.test(text)) profile.phone = text;
    if (profile.phone) break;
  }

  const urls = uniqueStrings([
    ...findValuesByKey(data, "linkedinUrl"),
    ...findValuesByKey(data, "githubUrl"),
    ...findValuesByKey(data, "websiteUrl"),
    ...findValuesByKey(data, "personalWebsite"),
  ]).filter((s) => /linkedin|github|https?:|www\./i.test(s));
  profile.links = urls.slice(0, 8).map((url) => ({
    label: /linkedin/i.test(url) ? "LinkedIn" : /github/i.test(url) ? "GitHub" : "Website",
    url: url.startsWith("http") ? url : `https://${url}`,
  }));

  const positions = asArray(
    findValuesByKey(data, "positions")[0] ?? findValuesByKey(data, "experience")[0] ?? [],
  );
  profile.experience = positions
    .filter(isObject)
    .slice(0, 25)
    .map((p) => {
      const start = formatDate(p.startDate ?? p.startTime);
      const end = formatDate(p.endDate ?? p.endTime);
      return {
        id: uid(),
        title: asString(p.title ?? p.name),
        company: asString(p.companyName ?? (isObject(p.company) ? p.company.name : p.company)),
        location: asString(p.locationName ?? p.location),
        startDate: start,
        endDate: end,
        current: !end || /present|current/i.test(end),
        description: asString(p.description),
      };
    });

  const educations = asArray(findValuesByKey(data, "educations")[0] ?? findValuesByKey(data, "education")[0] ?? []);
  profile.education = educations
    .filter(isObject)
    .slice(0, 15)
    .map((e) => ({
      id: uid(),
      school: asString(e.schoolName ?? e.school),
      degree: asString(e.degreeName ?? e.degree),
      field: asString(e.fieldOfStudy ?? e.field),
      startDate: formatDate(e.startDate ?? e.startTime),
      endDate: formatDate(e.endDate ?? e.endTime),
      details: asString(e.description ?? e.activities),
    }));

  const skillValues = asArray(findValuesByKey(data, "skills")[0] ?? []);
  profile.skills = [{
    ...makeCoreSkillGroup(),
    items: uniqueStrings(skillValues.filter(isObject).map((s) => s.name ?? s.skillName ?? s)).slice(0, 80),
  }];

  const certs = asArray(findValuesByKey(data, "certifications")[0] ?? []);
  profile.certifications = certs
    .filter(isObject)
    .slice(0, 20)
    .map((c) => ({
      id: uid(),
      name: asString(c.name ?? c.title),
      issuer: asString(c.authorityName ?? c.issuer ?? c.companyName),
      date: formatDate(c.timePeriod ?? c.date),
    }));

  const projects = asArray(findValuesByKey(data, "projects")[0] ?? []);
  profile.projects = projects
    .filter(isObject)
    .slice(0, 20)
    .map((p) => ({
      id: uid(),
      name: asString(p.name ?? p.title),
      description: asString(p.description),
      link: asString(p.url ?? p.link),
    }));

  return profile;
}
