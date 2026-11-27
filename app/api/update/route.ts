import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function POST() {
  try {
    const script = path.join(process.cwd(), "scripts", "launch.js");
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, "update"], {
      cwd: process.cwd(),
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return NextResponse.json({ ok: true, output: `${stdout}${stderr}`.trim() });
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; message?: string };
    const output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`.trim();
    return NextResponse.json(
      { ok: false, error: output || failed.message || "Could not check for updates." },
      { status: 500 },
    );
  }
}
