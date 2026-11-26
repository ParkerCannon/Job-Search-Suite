import { NextResponse } from "next/server";
import { clearAnalyses, listAnalyses } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId") ?? undefined;
  return NextResponse.json({ analyses: await listAnalyses(jobId) });
}

export async function DELETE() {
  await clearAnalyses();
  return NextResponse.json({ ok: true });
}
