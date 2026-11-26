import { NextResponse } from "next/server";
import { analyzeResume, profileToText } from "@/lib/ats/analyze";
import { getJob, getProfile, getSettings, saveAnalysis } from "@/lib/db";
import type { ProfileSource } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobId?: string; source?: ProfileSource; rawText?: string };
    if (!body.jobId) return NextResponse.json({ error: "A job description is required." }, { status: 400 });

    const job = getJob(body.jobId);
    if (!job) return NextResponse.json({ error: "Job description not found." }, { status: 404 });

    const source = body.source ?? "active";
    const stored = getProfile(source);
    if (!stored || !stored.profile.name && !stored.profile.summary && !stored.profile.experience.length) {
      return NextResponse.json({ error: `No ${source} profile data found. Import a resume or LinkedIn profile first.` }, { status: 400 });
    }

    const rawText = source === "resume" && stored.rawText
      ? stored.rawText
      : body.rawText || profileToText(stored.profile);

    const result = await analyzeResume({
      job,
      profile: stored.profile,
      source,
      rawText,
      settings: getSettings(),
    });
    const record = saveAnalysis(job.id, job.title, result);
    return NextResponse.json({ result, record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed." },
      { status: 500 },
    );
  }
}
