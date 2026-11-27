#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { execFileSync, spawn, spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const minNodeMajor = 18;
const portStart = 3000;
const portEnd = 3010;
const gitCmd = "git";
const updateTimeoutMs = 20000;
const dependencyFiles = new Set(["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);

process.chdir(projectRoot);

const mode = String(process.argv[2] || "launch").toLowerCase();

function fail(message) {
  console.error("");
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function printHeader() {
  console.log("");
  console.log("=== Job Search Suite launcher ===");
  console.log(`Project: ${projectRoot}`);
  console.log(`Platform: ${process.platform} (${process.arch})`);
  console.log("");
}

function commandSucceeded(command, args) {
  try {
    return spawnSync(command, args, {
      cwd: projectRoot,
      shell: isWindows,
      stdio: "ignore",
    }).status === 0;
  } catch {
    return false;
  }
}

function commandOutput(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: projectRoot,
      shell: isWindows,
      encoding: "utf8",
      windowsHide: true,
      timeout: options.timeoutMs,
    }).trim();
  } catch {
    return "";
  }
}

function ensureEnvironment(forceInstall = false) {
  const nodeVersion = process.versions.node;
  const nodeMajor = Number(nodeVersion.split(".")[0]);
  console.log(`Node.js: v${nodeVersion} (${process.execPath})`);

  if (!Number.isFinite(nodeMajor) || nodeMajor < minNodeMajor) {
    fail(`Node.js ${minNodeMajor} or newer is required. Found v${nodeVersion}. Install a newer runtime from https://nodejs.org/.`);
    return false;
  }

  if (!commandSucceeded(npmCmd, ["--version"])) {
    fail("npm was not found on PATH. Reinstall Node.js with npm included.");
    return false;
  }
  console.log(`npm: ${commandOutput(npmCmd, ["--version"]) || "available"}`);

  if (forceInstall || !fs.existsSync(path.join(projectRoot, "node_modules", "next"))) {
    const installArgs = forceInstall && fs.existsSync(path.join(projectRoot, "package-lock.json"))
      ? ["ci"]
      : ["install"];
    console.log(forceInstall ? "Dependencies changed; refreshing npm packages..." : "Installing dependencies...");
    const install = spawnSync(npmCmd, installArgs, {
      cwd: projectRoot,
      shell: isWindows,
      stdio: "inherit",
    });
    if (install.status !== 0) {
      fail(`npm ${installArgs[0]} failed. Check the output above.`);
      return false;
    }
  }

  return true;
}

function shortCommit(hash) {
  return hash ? hash.slice(0, 7) : "unknown";
}

function updateFromGit() {
  console.log("Checking for Git updates...");

  if (
    !commandSucceeded(gitCmd, ["--version"]) ||
    !commandSucceeded(gitCmd, ["rev-parse", "--is-inside-work-tree"])
  ) {
    console.log("Auto-update: skipped because Git is unavailable or this folder is not a repository.");
    return { dependenciesChanged: false };
  }

  if (!commandOutput(gitCmd, ["config", "--get", "remote.origin.url"])) {
    console.log("Auto-update: skipped because no origin remote is configured.");
    return { dependenciesChanged: false };
  }

  const dirty = commandOutput(gitCmd, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty) {
    console.log("Auto-update: skipped because you have uncommitted tracked changes.");
    for (const line of dirty.split(/\r?\n/).slice(0, 5)) console.log(`  ${line}`);
    return { dependenciesChanged: false };
  }

  const branch = commandOutput(gitCmd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch || branch === "HEAD") {
    console.log("Auto-update: skipped because HEAD is detached.");
    return { dependenciesChanged: false };
  }

  const oldHead = commandOutput(gitCmd, ["rev-parse", "HEAD"]);
  if (!oldHead) {
    console.log("Auto-update: skipped because the current commit could not be read.");
    return { dependenciesChanged: false };
  }

  const fetch = spawnSync(gitCmd, ["fetch", "--prune", "origin"], {
    cwd: projectRoot,
    shell: isWindows,
    stdio: "ignore",
    timeout: updateTimeoutMs,
    windowsHide: true,
  });
  if (fetch.status !== 0) {
    console.log(`Auto-update: could not reach origin (${branch}); continuing with the local copy.`);
    return { dependenciesChanged: false };
  }

  const remoteHead = commandOutput(gitCmd, ["rev-parse", `origin/${branch}`]);
  if (!remoteHead) {
    console.log(`Auto-update: origin/${branch} is not available; continuing with the local copy.`);
    return { dependenciesChanged: false };
  }
  if (remoteHead === oldHead) {
    console.log(`Auto-update: already up to date (${shortCommit(oldHead)}).`);
    return { dependenciesChanged: false };
  }

  const counts = commandOutput(gitCmd, ["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`]);
  const [ahead, behind] = counts.split(/\s+/).map(Number);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    console.log("Auto-update: could not compare branches; continuing with the local copy.");
    return { dependenciesChanged: false };
  }
  if (ahead > 0) {
    console.log(`Auto-update: skipped because this branch has ${ahead} local commit(s) not on origin.`);
    return { dependenciesChanged: false };
  }
  if (behind === 0) {
    console.log("Auto-update: skipped because origin changed but cannot be fast-forwarded.");
    return { dependenciesChanged: false };
  }

  const pull = spawnSync(gitCmd, ["pull", "--ff-only", "origin", branch], {
    cwd: projectRoot,
    shell: isWindows,
    stdio: "inherit",
    timeout: updateTimeoutMs,
    windowsHide: true,
  });
  if (pull.status !== 0) {
    console.log("Auto-update: pull failed; continuing with the local copy.");
    return { dependenciesChanged: false };
  }

  const newHead = commandOutput(gitCmd, ["rev-parse", "HEAD"]);
  if (!newHead || newHead === oldHead) {
    console.log("Auto-update: pull finished with no commit change.");
    return { dependenciesChanged: false };
  }
  console.log(`Auto-update: updated ${shortCommit(oldHead)} -> ${shortCommit(newHead)}.`);

  const changedFiles = commandOutput(gitCmd, ["diff", "--name-only", `${oldHead}..${newHead}`])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dependenciesChanged = changedFiles.some((file) =>
    dependencyFiles.has(file.split(/[\\/]/).pop() ?? ""),
  );
  if (dependenciesChanged) console.log("Auto-update: dependency files changed; npm will be refreshed.");

  return { dependenciesChanged };
}

function responds(port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: "127.0.0.1", port, path: "/", timeout: timeoutMs },
      (response) => {
        response.resume();
        resolve(response.statusCode !== undefined && response.statusCode < 500);
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

function portHasListener(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => server.close(() => resolve(false)));
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort() {
  for (let port = portStart; port <= portEnd; port += 1) {
    if (!(await portHasListener(port))) return port;
  }
  return null;
}

function pidsListeningOn(port) {
  const pids = new Set();

  if (isWindows) {
    const output = commandOutput("netstat", ["-ano"]);
    const pattern = new RegExp(`[:.]${port}\\s+.*?LISTENING\\s+(\\d+)`);
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(pattern);
      if (match) pids.add(Number(match[1]));
    }
  } else {
    let output = commandOutput("lsof", ["-ti", `tcp:${port}`]);
    if (!output) output = commandOutput("fuser", ["-n", "tcp", String(port)]);
    for (const token of output.split(/\s+/)) {
      const pid = Number(token);
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
  }

  return [...pids];
}

function isProjectProcess(pid) {
  let commandLine = "";
  if (isWindows) {
    commandLine = commandOutput("powershell", [
      "-NoProfile",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\").CommandLine`,
    ]);
  } else {
    try {
      commandLine = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
    } catch {
      commandLine = "";
    }
  }
  const normalized = commandLine.toLowerCase();
  return (
    normalized.includes("next dev") ||
    (normalized.includes("npm-cli.js") && normalized.includes("run dev")) ||
    normalized.includes(path.basename(projectRoot).toLowerCase()) ||
    normalized.includes(projectRoot.toLowerCase())
  );
}

function stopProjectServersOn(port) {
  const pids = pidsListeningOn(port).filter(isProjectProcess);
  for (const pid of pids) {
    console.log(`Stopping this project's server on port ${port} (PID ${pid})...`);
    if (isWindows) {
      commandOutput("taskkill", ["/PID", String(pid), "/F", "/T"]);
    } else {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
  if (!pids.length) console.log(`No Job Search Suite server found on port ${port}.`);
  return pids.length;
}

function clearStaleBuild() {
  const nextDir = path.join(projectRoot, ".next");
  if (fs.existsSync(nextDir)) {
    console.log("Clearing stale build cache (.next)...");
    fs.rmSync(nextDir, { recursive: true, force: true });
  }
}

function openBrowser(url) {
  try {
    if (isWindows) {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
    console.log(`Opened ${url}`);
  } catch {
    console.log(`Could not open a browser automatically. Open this URL manually: ${url}`);
  }
}

async function waitForHttp(port, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await responds(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

async function runCheck() {
  console.log("Port status:");
  for (let port = portStart; port <= portEnd; port += 1) {
    const used = await portHasListener(port);
    const appResponds = used ? await responds(port) : false;
    console.log(`  ${port}: ${used ? (appResponds ? "Job Search Suite responding" : "in use by another process") : "free"}`);
  }
  console.log("");
  console.log("Environment check passed.");
}

async function runLaunch() {
  if (await responds(portStart)) {
    const url = `http://localhost:${portStart}`;
    console.log(`Job Search Suite is already running at ${url}`);
    openBrowser(url);
    return;
  }

  let port = portStart;
  if (await portHasListener(portStart)) {
    console.log(`Port ${portStart} is in use by another process. Looking for the next available port...`);
    const fallback = await findFreePort();
    if (!fallback) {
      fail(`No free port was found between ${portStart} and ${portEnd}. Close a program or extend the range in scripts/launch.js.`);
      return;
    }
    port = fallback;
  }

  clearStaleBuild();

  const url = `http://localhost:${port}`;
  console.log(`Starting the local server at ${url}`);
  console.log("Keep this window open while you use the app.");

  const child = spawn(npmCmd, ["run", "dev", "--", "--port", String(port)], {
    cwd: projectRoot,
    shell: isWindows,
    stdio: "inherit",
  });

  const shutdown = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const ready = await waitForHttp(port);
  if (ready) {
    openBrowser(url);
  } else {
    console.log("");
    console.log(`The server did not respond in time. Check the output above, or try ${url} manually.`);
  }

  child.on("exit", (code) => process.exit(code ?? 0));
}

async function main() {
  printHeader();

  const update = mode === "launch" || mode === "update" ? updateFromGit() : { dependenciesChanged: false };

  if (mode === "update") {
    if (update.dependenciesChanged) console.log("Dependencies changed; restart the launcher to install them.");
    console.log("Update check complete. Restart the launcher if files changed.");
    return;
  }

  if (!ensureEnvironment(update.dependenciesChanged)) return;

  if (mode === "check") {
    await runCheck();
    return;
  }

  if (mode === "reset") {
    for (let port = portStart; port <= portEnd; port += 1) {
      stopProjectServersOn(port);
    }
    clearStaleBuild();
  }

  await runLaunch();
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
