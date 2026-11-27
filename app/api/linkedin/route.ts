import { NextResponse } from "next/server";
import { clearLinkedInExport, getLinkedInExport } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ linkedin: await getLinkedInExport() });
}

export async function DELETE() {
  await clearLinkedInExport();
  return NextResponse.json({ ok: true });
}
