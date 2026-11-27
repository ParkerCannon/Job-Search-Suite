import { NextResponse } from "next/server";
import { saveLinkedInExport, saveProfile } from "@/lib/db";
import { extractTextFromFile } from "@/lib/parse/files";
import { buildProfileImport } from "@/lib/parse/linkedinBundle";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form
      .getAll("file")
      .filter((value): value is File => typeof File !== "undefined" && value instanceof File && value.size > 0);
    const text = String(form.get("text") ?? "").trim();

    const preview = await buildProfileImport(files, text, (file) => extractTextFromFile(file as File));
    await saveProfile("imported", preview.imported, preview.rawText, preview.filename);
    await saveProfile("active", preview.profile, preview.rawText, preview.filename);
    await saveLinkedInExport(preview.linkedin);

    return NextResponse.json({ preview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import profile data." },
      { status: 400 },
    );
  }
}
