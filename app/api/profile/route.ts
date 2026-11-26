import { NextResponse } from "next/server";
import { getAllProfiles, getProfile, saveProfile } from "@/lib/db";
import { emptyProfile, normalizeProfile, type Profile, type ProfileSource } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getAllProfiles());
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      profile?: Profile;
      resetFrom?: ProfileSource;
    };

    if (body.resetFrom && body.resetFrom !== "active") {
      const source = getProfile(body.resetFrom);
      if (!source) return NextResponse.json({ error: `No ${body.resetFrom} data imported yet.` }, { status: 404 });
      const record = saveProfile("active", source.profile, source.rawText, source.filename);
      return NextResponse.json({ profile: record.profile });
    }

    if (!body.profile) {
      return NextResponse.json({ error: "A profile is required." }, { status: 400 });
    }

    const record = saveProfile("active", normalizeProfile(body.profile), "", "Edited in app");
    return NextResponse.json({ profile: record.profile });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function DELETE() {
  saveProfile("active", emptyProfile(), "", "");
  return NextResponse.json({ ok: true });
}
