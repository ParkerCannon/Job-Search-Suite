import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { normalizeJobDiscoverySettings } from "@/lib/jobs/sourceInfo";
import type { AppSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ settings: getSettings() });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<AppSettings>;
    const current = getSettings();
    const settings = saveSettings({
      ai: { ...current.ai, ...(body.ai ?? {}) },
      weights: { ...current.weights, ...(body.weights ?? {}) },
      targetRole: body.targetRole ?? current.targetRole,
      jobDiscovery: normalizeJobDiscoverySettings({
        ...current.jobDiscovery,
        ...(body.jobDiscovery ?? {}),
      }),
      profileLinks: {
        linkedin: body.profileLinks?.linkedin ?? current.profileLinks.linkedin,
        indeed: body.profileLinks?.indeed ?? current.profileLinks.indeed,
      },
    });
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  }
}
