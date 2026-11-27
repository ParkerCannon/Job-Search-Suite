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
      timeout: 300000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    const raw = `${stdout}${stderr}`;
    const changed = /UPDATE_FILES_CHANGED=1/.test(raw);
    const dependencyFailed = /UPDATE_DEPENDENCY_ERROR=1/.test(raw);
    const output = raw
      .split(/\r?\n/)
      .filter(
        (line) =>
          !line.startsWith("UPDATE_FILES_CHANGED=") && !line.startsWith("UPDATE_DEPENDENCY_ERROR="),
      )
      .join("\n")
      .trim();
    if (dependencyFailed) {
      return NextResponse.json(
        { ok: false, error: output || "Dependency sync failed." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, changed, output });
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string; message?: string };
    const output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`.trim();
    return NextResponse.json(
      { ok: false, error: output || failed.message || "Could not check for updates." },
      { status: 500 },
    );
  }
}
