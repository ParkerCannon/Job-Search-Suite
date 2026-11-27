#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
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
const updateArchiveUrl = "https://codeload.github.com/ParkerCannon/Job-Search-Suite/tar.gz/refs/heads/main";
const updateStateFile = ".install-state.json";
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

function missingDependencies() {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    const required = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
    return Object.keys(required).filter(
      (name) => !fs.existsSync(path.join(projectRoot, "node_modules", ...name.split("/"))),
    );
  } catch {
    return [];
  }
}

function refreshDependencies(reason) {
  const lockPath = path.join(projectRoot, "package-lock.json");
  const lockBefore = fs.existsSync(lockPath) ? fs.readFileSync(lockPath) : null;
  console.log(`Dependency sync: ${reason}.`);
  const install = spawnSync(npmCmd, ["install", "--no-audit", "--no-fund"], {
    cwd: projectRoot,
    shell: isWindows,
    stdio: "inherit",
    windowsHide: true,
  });
  if (lockBefore && fs.existsSync(lockPath) && !fs.readFileSync(lockPath).equals(lockBefore)) {
    fs.writeFileSync(lockPath, lockBefore);
  }
  if (install.status !== 0) {
    console.log("Dependency sync failed. Check the npm output above.");
    return false;
  }
  const missing = missingDependencies();
  if (missing.length > 0) {
    console.log(`Dependency sync did not install: ${missing.join(", ")}`);
    return false;
  }
  console.log("Dependency sync complete.");
  return true;
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

  const missing = missingDependencies();
  if (forceInstall || missing.length > 0 || !fs.existsSync(path.join(projectRoot, "node_modules", "next"))) {
    const installArgs = forceInstall && fs.existsSync(path.join(projectRoot, "package-lock.json"))
      ? ["ci"]
      : ["install"];
    if (missing.length > 0) console.log(`Missing packages detected: ${missing.join(", ")}`);
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

function isProtectedUpdatePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  if (normalized === updateStateFile) return true;
  return (
    normalized.startsWith("data/") ||
    normalized.startsWith("node_modules/") ||
    normalized.startsWith(".next/") ||
    normalized.startsWith(".git/") ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("dist-portable/") ||
    normalized.startsWith("dist-electron/") ||
    normalized.startsWith("out/") ||
    normalized.startsWith("build/") ||
    normalized.startsWith("logs/") ||
    normalized.startsWith("coverage/") ||
    normalized.startsWith(".env") ||
    normalized.endsWith(".db") ||
    normalized.includes(".db-") ||
    /\.(pem|key|p12|pfx|log|sqlite|tsbuildinfo)$/.test(normalized) ||
    normalized === ".ds_store" ||
    normalized === "thumbs.db"
  );
}

function readUpdateState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectRoot, updateStateFile), "utf8"));
    return { hasState: true, files: Array.isArray(parsed.files) ? parsed.files : [] };
  } catch {
    return { hasState: false, files: [] };
  }
}

function writeUpdateState(files) {
  fs.writeFileSync(
    path.join(projectRoot, updateStateFile),
    `${JSON.stringify({ files, updatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

function listSourceFiles(root, base = "") {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const relative = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function findSourceRoot(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const candidate = path.join(directory, entry.name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
  }
  return null;
}

function sameFileContents(left, right) {
  try {
    if (fs.statSync(left).size !== fs.statSync(right).size) return false;
    return fs.readFileSync(left).equals(fs.readFileSync(right));
  } catch {
    return false;
  }
}

async function updateFromArchive() {
  console.log("Git checkout is unavailable; checking the published source archive...");
  let tempDir = "";
  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jss-update-"));
    const archivePath = path.join(tempDir, "source.tar.gz");
    const response = await fetch(updateArchiveUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(updateTimeoutMs * 3),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    fs.writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));

    const extract = spawnSync("tar", ["-xzf", archivePath, "-C", tempDir], {
      cwd: tempDir,
      shell: isWindows,
      stdio: "ignore",
      windowsHide: true,
      timeout: updateTimeoutMs * 3,
    });
    if (extract.status !== 0) throw new Error("the archive could not be extracted");

    const sourceRoot = findSourceRoot(tempDir);
    if (!sourceRoot) throw new Error("the archive did not contain the project source");

    const state = readUpdateState();
    const installedFiles = new Set();
    let changedCount = 0;
    let dependenciesChanged = false;

    for (const relative of listSourceFiles(sourceRoot)) {
      if (isProtectedUpdatePath(relative)) continue;
      installedFiles.add(relative);
      const source = path.join(sourceRoot, ...relative.split("/"));
      const destination = path.join(projectRoot, ...relative.split("/"));
      if (dependencyFiles.has(path.basename(relative)) && !sameFileContents(source, destination)) {
        dependenciesChanged = true;
      }
      if (sameFileContents(source, destination)) continue;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      changedCount += 1;
    }

    if (state.hasState) {
      for (const relative of state.files) {
        if (installedFiles.has(relative) || isProtectedUpdatePath(relative)) continue;
        try {
          const stale = path.join(projectRoot, ...relative.split("/"));
          if (fs.statSync(stale).isFile()) {
            fs.unlinkSync(stale);
            changedCount += 1;
          }
        } catch {
          // already gone
        }
      }
    }

    writeUpdateState([...installedFiles].sort());

    if (changedCount > 0) console.log(`Auto-update: applied ${changedCount} changed file(s) from the published source.`);
    else console.log("Auto-update: already up to date with the published source.");

    return { dependenciesChanged, changed: changedCount > 0 };
  } catch (error) {
    console.log(
      `Auto-update: could not check the published source (${error instanceof Error ? error.message : String(error)}); continuing with the local copy.`,
    );
    return { dependenciesChanged: false, changed: false };
  } finally {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // already gone
      }
    }
  }
}

async function updateFromGit() {
  console.log("Checking for updates...");

  const gitAvailable = commandSucceeded(gitCmd, ["--version"]);
  const inRepository = gitAvailable && commandSucceeded(gitCmd, ["rev-parse", "--is-inside-work-tree"]);
  if (!inRepository) return updateFromArchive();

  if (!commandOutput(gitCmd, ["config", "--get", "remote.origin.url"])) {
    console.log("Auto-update: skipped because no origin remote is configured.");
    return { dependenciesChanged: false, changed: false };
  }

  const dirty = commandOutput(gitCmd, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty) {
    console.log("Auto-update: skipped because you have uncommitted tracked changes.");
    for (const line of dirty.split(/\r?\n/).slice(0, 5)) console.log(`  ${line}`);
    return { dependenciesChanged: false, changed: false };
  }

  const branch = commandOutput(gitCmd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch || branch === "HEAD") {
    console.log("Auto-update: skipped because HEAD is detached.");
    return { dependenciesChanged: false, changed: false };
  }

  const oldHead = commandOutput(gitCmd, ["rev-parse", "HEAD"]);
  if (!oldHead) {
    console.log("Auto-update: skipped because the current commit could not be read.");
    return { dependenciesChanged: false, changed: false };
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
    return { dependenciesChanged: false, changed: false };
  }

  const remoteHead = commandOutput(gitCmd, ["rev-parse", `origin/${branch}`]);
  if (!remoteHead) {
    console.log(`Auto-update: origin/${branch} is not available; continuing with the local copy.`);
    return { dependenciesChanged: false, changed: false };
  }
  if (remoteHead === oldHead) {
    console.log(`Auto-update: already up to date (${shortCommit(oldHead)}).`);
    return { dependenciesChanged: false, changed: false };
  }

  const counts = commandOutput(gitCmd, ["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`]);
  const [ahead, behind] = counts.split(/\s+/).map(Number);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    console.log("Auto-update: could not compare branches; continuing with the local copy.");
    return { dependenciesChanged: false, changed: false };
  }
  if (ahead > 0) {
    console.log(`Auto-update: skipped because this branch has ${ahead} local commit(s) not on origin.`);
    return { dependenciesChanged: false, changed: false };
  }
  if (behind === 0) {
    console.log("Auto-update: skipped because origin changed but cannot be fast-forwarded.");
    return { dependenciesChanged: false, changed: false };
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
    return { dependenciesChanged: false, changed: false };
  }

  const newHead = commandOutput(gitCmd, ["rev-parse", "HEAD"]);
  if (!newHead || newHead === oldHead) {
    console.log("Auto-update: pull finished with no commit change.");
    return { dependenciesChanged: false, changed: false };
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

  return { dependenciesChanged, changed: true };
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

async function portHasListener(port) {
  // Test binds are unreliable on Windows: SO_REUSEADDR can let a second socket
  // bind 127.0.0.1 while Next.js still fails on :::port. Ask the OS for actual
  // listeners first, then fall back to an exclusive bind where available.
  if (pidsListeningOn(port).length > 0) return true;

  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => server.close(() => resolve(false)));
    server.listen({ port, host: "127.0.0.1", exclusive: true });
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

async function runLaunch(serverMode = "dev") {
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

  if (serverMode === "dev") clearStaleBuild();

  const url = `http://localhost:${port}`;
  console.log(`Starting the local server at ${url}`);
  console.log("Keep this window open while you use the app.");

  const scriptName = serverMode === "start" ? "start:direct" : "dev:direct";
  const child = spawn(npmCmd, ["run", scriptName, "--", "--port", String(port)], {
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

  const update = mode === "launch" || mode === "update"
    ? await updateFromGit()
    : { dependenciesChanged: false, changed: false };

  if (mode === "update") {
    console.log(`UPDATE_FILES_CHANGED=${update.changed ? 1 : 0}`);
    let reason = "keeping dependencies current";
    if (update.dependenciesChanged) reason = "package files changed";
    else if (missingDependencies().length > 0) reason = "packages are missing";
    if (!refreshDependencies(reason)) console.log("UPDATE_DEPENDENCY_ERROR=1");
    console.log("Update check complete. Restart the launcher if a dependency was replaced.");
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

  await runLaunch(mode === "start" ? "start" : "dev");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
