import { NextResponse } from "next/server";
import { deleteAnalysis } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteAnalysis(id);
  return NextResponse.json({ ok: true });
}
