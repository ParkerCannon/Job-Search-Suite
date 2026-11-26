import { NextResponse } from "next/server";
import { clearScrapedJobs } from "@/lib/db";
import { getTitlesPayload } from "@/lib/titles/service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getTitlesPayload());
}

export async function DELETE() {
  clearScrapedJobs();
  return NextResponse.json({ ok: true, data: getTitlesPayload() });
}
