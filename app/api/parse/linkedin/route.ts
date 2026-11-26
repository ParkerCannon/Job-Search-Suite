import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/db";
import { extractTextFromFile } from "@/lib/parse/files";
import { parseLinkedInText } from "@/lib/parse/linkedin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    let rawText = String(form.get("text") ?? "").trim();
    let filename = "Pasted LinkedIn profile";

    if (file instanceof File && file.size > 0) {
      rawText = await extractTextFromFile(file);
      filename = file.name;
    }
    if (!rawText.trim()) {
      return NextResponse.json({ error: "No LinkedIn data was provided." }, { status: 400 });
    }

    const profile = parseLinkedInText(rawText);
    const record = await saveProfile("linkedin", profile, rawText, filename);
    if (!(await getProfile("active"))) await saveProfile("active", profile, rawText, filename);

    return NextResponse.json({ profile, rawText, filename, updatedAt: record.updatedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse LinkedIn export." },
      { status: 400 },
    );
  }
}
