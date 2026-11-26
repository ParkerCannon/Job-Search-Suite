import { NextResponse } from "next/server";
import { saveProfile, getProfile } from "@/lib/db";
import { extractTextFromFile } from "@/lib/parse/files";
import { parseResumeText } from "@/lib/parse/resume";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const pasted = String(form.get("text") ?? "").trim();

    let rawText = pasted;
    let filename = "Pasted resume";
    if (file instanceof File && file.size > 0) {
      rawText = await extractTextFromFile(file);
      filename = file.name;
    }
    if (!rawText.trim()) {
      return NextResponse.json({ error: "No resume text was provided." }, { status: 400 });
    }

    const profile = parseResumeText(rawText);
    const record = await saveProfile("resume", profile, rawText, filename);
    if (!(await getProfile("active"))) await saveProfile("active", profile, rawText, filename);

    return NextResponse.json({ profile, rawText, filename, updatedAt: record.updatedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse resume." },
      { status: 400 },
    );
  }
}
