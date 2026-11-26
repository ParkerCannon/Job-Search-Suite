import { NextResponse } from "next/server";
import { refreshTitles } from "@/lib/titles/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const data = await refreshTitles();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not refresh job titles." },
      { status: 500 },
    );
  }
}
