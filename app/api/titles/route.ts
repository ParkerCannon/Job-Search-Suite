import { NextResponse } from "next/server";
import { clearScrapedJobs } from "@/lib/db";
import { getTitlesPayload } from "@/lib/titles/service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getTitlesPayload());
}

export async function DELETE() {
  await clearScrapedJobs();
  return NextResponse.json({ ok: true, data: await getTitlesPayload() });
}
