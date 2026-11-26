import { NextResponse } from "next/server";
import { clearJobs, createJob, listJobs } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: await listJobs() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; company?: string; rawText?: string };
    if (!body.rawText?.trim()) {
      return NextResponse.json({ error: "Paste a job description first." }, { status: 400 });
    }
    const job = await createJob(body.title ?? "", body.company ?? "", body.rawText.trim());
    return NextResponse.json({ job }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function DELETE() {
  await clearJobs();
  return NextResponse.json({ ok: true });
}
