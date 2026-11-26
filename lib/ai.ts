import type { AiSettings, Recommendation } from "./types";
import { uid } from "./types";

function cleanJson(text: string): string {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function endpoint(settings: AiSettings): { url: string; headers: Record<string, string>; body: unknown } | null {
  const base = settings.baseUrl.replace(/\/$/, "");

  if (settings.provider === "ollama") {
    return {
      url: `${base || "http://localhost:11434"}/api/generate`,
      headers: { "Content-Type": "application/json" },
      body: { model: settings.model || "llama3.1", prompt: "", stream: false, format: "json" },
    };
  }

  if (settings.provider === "openai") {
    return {
      url: settings.baseUrl.includes("chat/completions")
        ? settings.baseUrl
        : `${base || "https://api.openai.com/v1"}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: {
        model: settings.model || "gpt-4o-mini",
        messages: [],
        response_format: { type: "json_object" },
        temperature: 0.2,
      },
    };
  }

  if (settings.provider === "anthropic") {
    return {
      url: `${base || "https://api.anthropic.com/v1"}/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: { model: settings.model || "claude-3-5-haiku-latest", max_tokens: 1200, system: "", messages: [] },
    };
  }

  return null;
}

export async function askAI(settings: AiSettings, system: string, user: string): Promise<string | null> {
  const config = endpoint(settings);
  if (!config) return null;

  try {
    if (settings.provider === "ollama") {
      const body = config.body as Record<string, unknown>;
      body.prompt = `${system}\n\n${user}`;
    } else if (settings.provider === "openai") {
      const body = config.body as Record<string, unknown>;
      body.messages = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];
    } else if (settings.provider === "anthropic") {
      const body = config.body as Record<string, unknown>;
      body.system = system;
      body.messages = [{ role: "user", content: user }];
    }

    const response = await fetch(config.url, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify(config.body),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;

    if (settings.provider === "ollama") return typeof data.response === "string" ? cleanJson(data.response) : null;
    if (settings.provider === "openai") {
      const choices = data.choices as { message?: { content?: string } }[] | undefined;
      return choices?.[0]?.message?.content ? cleanJson(choices[0].message.content) : null;
    }
    const content = data.content as { text?: string }[] | undefined;
    return content?.[0]?.text ? cleanJson(content[0].text) : null;
  } catch {
    return null;
  }
}

export async function aiSummary(
  settings: AiSettings,
  payload: { jobTitle: string; jobText: string; score: number; missing: string[]; matched: string[] },
): Promise<string | null> {
  if (settings.provider === "none") return null;
  const result = await askAI(
    settings,
    "You are a concise career advisor. Return only a JSON object with a single key 'summary' containing 2-3 sentences of specific, actionable advice. No markdown.",
    `Job: ${payload.jobTitle}\nJob description excerpt: ${payload.jobText.slice(0, 4000)}\nATS score: ${payload.score}/100\nMatched keywords: ${payload.matched.slice(0, 20).join(", ")}\nMissing keywords: ${payload.missing.slice(0, 20).join(", ")}`,
  );
  if (!result) return null;
  try {
    const parsed = JSON.parse(result) as { summary?: string };
    return parsed.summary ?? null;
  } catch {
    return result.slice(0, 800);
  }
}

export async function aiRecommendations(
  settings: AiSettings,
  payload: { jobText: string; profileText: string; score: number; missing: string[] },
): Promise<Recommendation[]> {
  if (settings.provider === "none") return [];
  const result = await askAI(
    settings,
    "You are a resume coach. Return only JSON: {\"recommendations\":[{\"title\":\"...\",\"detail\":\"...\",\"suggestion\":\"...\",\"location\":\"...\",\"priority\":\"high|medium|low\"}]}. Give 3-5 specific, truthful changes. Never invent experience or skills. Keep each suggestion under 240 characters.",
    `Job description:\n${payload.jobText.slice(0, 5000)}\n\nCurrent resume:\n${payload.profileText.slice(0, 5000)}\n\nKeyword score: ${payload.score}/100\nMissing keywords: ${payload.missing.slice(0, 20).join(", ")}`,
  );
  if (!result) return [];
  try {
    const parsed = JSON.parse(result) as { recommendations?: Partial<Recommendation>[] };
    return (parsed.recommendations ?? []).slice(0, 5).map((rec) => ({
      id: uid(),
      type: "ai" as const,
      priority: rec.priority === "high" || rec.priority === "low" ? rec.priority : "medium",
      title: rec.title ?? "AI suggestion",
      detail: rec.detail ?? "",
      suggestion: rec.suggestion ?? "",
      location: rec.location ?? "Resume",
    }));
  } catch {
    return [];
  }
}
