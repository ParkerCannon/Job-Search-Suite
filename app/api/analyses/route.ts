import { NextResponse } from "next/server";
import { clearAnalyses, listAnalyses } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId") ?? undefined;
  return NextResponse.json({ analyses: listAnalyses(jobId) });
}

export async function DELETE() {
  clearAnalyses();
  return NextResponse.json({ ok: true });
}
