import { NextResponse } from "next/server";
import { aiRecommendations } from "@/lib/ai";
import { analyzeResume, profileToText } from "@/lib/ats/analyze";
import { buildRecommendations } from "@/lib/ats/recommend";
import { getProfile, getSettings } from "@/lib/db";
import type { ProfileSource } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rawText?: string; source?: ProfileSource };
    if (!body.rawText?.trim()) {
      return NextResponse.json({ error: "Paste a job description first." }, { status: 400 });
    }

    const source = body.source ?? "active";
    const stored = getProfile(source);
    if (!stored) {
      return NextResponse.json({ error: "Import a resume or profile first." }, { status: 400 });
    }

    const profileText =
      source === "resume" && stored.rawText ? stored.rawText : profileToText(stored.profile);
    const settings = getSettings();

    const result = await analyzeResume({
      job: { title: "Pasted job description", rawText: body.rawText.trim() },
      profile: stored.profile,
      source,
      rawText: profileText,
      // AI is used for the recommendations below, so skip the score summary here.
      settings: { ...settings, ai: { ...settings.ai, provider: "none" } },
    });

    const recommendations = buildRecommendations(result, stored.profile, profileText, body.rawText);
    const aiRecs = await aiRecommendations(settings.ai, {
      jobText: body.rawText,
      profileText,
      score: result.overall,
      missing: result.missingKeywords.map((k) => k.term),
    });

    return NextResponse.json({
      result,
      recommendations: [...recommendations, ...aiRecs],
      jobTitle: "Pasted job description",
      source,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed." },
      { status: 500 },
    );
  }
}
