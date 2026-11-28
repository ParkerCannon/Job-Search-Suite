# Job Search Suite

A local-first web app that parses your resume and LinkedIn profile into one structured profile, shows what an ATS would actually see, and scores you against a job description you paste in. The Job Descriptions window keeps your resume open next to a live keyword analysis with concrete recommendations. The Job Titles window compares your working resume against current public job feeds and recommends titles worth searching for.

There is no job-site HTML scraping and no arbitrary URL fetching. Job-title discovery uses only an allowlist of public APIs/feeds and the descriptions you paste in stay local.

You can run it three ways: a Node server with live public feeds, a **single HTML file** that opens straight from disk with no Node installed, or a **desktop app** with no server or ports.

## Requirements

- **Server build:** Node.js 18 or newer and npm (included with Node). SQLite runs through `sql.js` (WebAssembly), so there is no native database module to compile and older/32-bit Node installations are supported.
- **Single-file browser build:** any modern browser. Node is needed once to generate the file, not to use it.
- **Desktop app:** Windows 10, macOS, or Linux. The packaged app includes its own runtime; no Node installation is needed.

> The self-contained offline app is `dist-portable/index.html`, produced by `npm run build:static` (or included in the desktop package). A plain browser/web shortcut cannot start the local server, so use the shell launcher for your operating system instead.

## Run it

From the project folder:

```bash
npm install
npm run dev
```

Then open the URL printed in the terminal, usually http://127.0.0.1:3000. If that port is busy, the launcher tries 3001 through 3010 and prints the URL it selected. The server binds only to `127.0.0.1`, so it is not reachable from other devices. The first run creates `data/job-search-suite.db` locally.

### Desktop shortcuts

Use the launcher for your shell. Each one starts the local server, finds the next free port in 3000–3010 unless you specify one, waits until it responds, and opens the actual URL. Keep the terminal window open while you use the app.

- **Windows:** `Launch Job Search Suite.cmd` — double-click it, or right-click → *Send to* → *Desktop (create shortcut)*. It also locates Node.js when `PATH` is stale.
- **macOS:** `Launch Job Search Suite.command` — copy it to the Desktop or make an alias, then run it. Right-click → *Open* the first time if Gatekeeper asks.
- **Linux:** `Launch Job Search Suite.sh` — copy it to the Desktop, mark it executable with `chmod +x`, then double-click or run it from a terminal. A `.desktop` entry can point to this script.

All three accept `check`, `reset`, and `update` arguments. Add `--port <n>`, `-p <n>`, or `--port=<n>` (or set `PORT=<n>`) to host on a specific port from 1–65535; use `--port 0` for an OS-assigned ephemeral port. The launcher prints the exact URL it opens and binds only to `127.0.0.1` because the app has no authentication. An explicit port that is already busy is reported instead of silently moving elsewhere. `reset` stops only this project's listening processes, including ones on arbitrary ports. In a Git clone the update check pulls only with `--ff-only` and still starts your local copy if you have uncommitted tracked changes, local commits, a detached HEAD, no `origin`, or no network. There is no HTML/web shortcut because it cannot start the server.

In the server build, **Settings → Software updates → Pull latest version** runs the same update check and shows the result. Git clones pull from `origin`; folders installed from a ZIP download the published source archive from this project's GitHub repository instead. Both paths replace only application source files: `data/`, `.env*`, keys, and build output are left untouched. Every check also runs `npm install` so dependencies match `package.json` and `package-lock.json` on that device, whether or not source files changed; a failed install is reported as an error. When files change, the page reloads automatically. Restart the launcher only if a dependency was replaced. The browser-only build updates through its launcher instead.

For a production run:

```bash
npm run build
npm start
```

Both `npm run dev` and `npm start` go through the launcher, so they use the same 3000–3010 port fallback unless you pass a port: `npm run dev -- --port 8123`, `npm start -- --port 0`, or `PORT=8123 npm run dev`. Use `npm run dev:direct` or `npm run start:direct` only when you intentionally want to bypass the launcher; add `--hostname 127.0.0.1` yourself, because those scripts lose the launcher's port checks, localhost binding, and URL reporting.

## Run without Node

### Single-file browser app

Build it once on any machine with Node 18+:

```bash
npm install
npm run build:static
```

Then double-click `dist-portable/index.html` (or copy that one file anywhere and open it in a modern browser). No server, ports, or installed dependencies are needed at runtime. The whole UI and its libraries are inlined into that one file.

This build is deliberately offline: public job feeds and live suggestions are disabled, AI starts off, and any API key you enter is kept in memory for the current session only. The **Job titles** tab rebuilds suggestions from job descriptions you saved in the app plus your working profile. Data lives in this browser's `localStorage`; use **Settings → Local workspace backup** to export or restore a private JSON file, and **Delete local data** to clear it. Backups never contain API keys.

### Desktop app

The desktop shell loads `dist-portable/index.html` directly — there is no local server and no port to manage. External links open in your system browser.

```bash
npm install
npm run electron          # run the app from this checkout
npm run electron:dir      # build an unpacked app in dist-electron/
npm run electron:build    # build an installer in dist-electron/
```

`npm run electron` expects `dist-portable/index.html` to exist; run `npm run build:static` first (the `electron:dir` and `electron:build` scripts do that for you). If the build is missing, the app shows an error dialog with the exact command to run instead of closing silently. The packaged app contains only the Electron shell and the static build — no `node_modules`, no source files, and no `data/` directory.

Installers: `Job-Search-Suite-Setup-<version>.exe` (Windows), `.dmg` (macOS), and `.AppImage` (Linux). Windows builds are unsigned, so the first run may show a SmartScreen warning. On macOS, right-click → *Open* the first time if Gatekeeper asks.

## Troubleshooting

- **`'node' is not recognized`:** the Windows launcher now searches the usual Node.js install folders before failing. If it still cannot find Node.js, install the LTS version from https://nodejs.org/, then sign out or restart the computer so Windows refreshes `PATH`.
- **`npm` is not recognized:** Node.js is either not installed or not on PATH. Install Node.js 18 or newer from https://nodejs.org/ and reopen the terminal.
- **The launcher window closes immediately:** run it from an already-open Command Prompt so the error stays visible, or use `Launch Job Search Suite.cmd check` to print diagnostics.
- **The launcher says "Auto-update: skipped":** expected in a Git clone when you have uncommitted tracked changes, local commits, a detached HEAD, no `origin`, or no network. The launcher intentionally keeps your local files and still starts the app; commit or stash your work and relaunch to receive updates. A folder installed from a ZIP has no Git history and uses the published source archive instead; if the download fails, the local copy is kept.
- **The update button says the folder is not a repository:** older launchers could only update Git clones. Relaunch once from an updated build, or replace the ZIP install with a Git clone; your `data/` folder can be copied over.
- **Browser shows `ERR_CONNECTION_REFUSED`:** open the exact URL printed by the launcher, which uses `127.0.0.1`. Port 3000 may be taken by another program, in which case the app uses 3001–3010. Force a port with `--port <n>` or request an OS-assigned one with `--port 0`.
- **`Cannot find module './611.js'` or another stale chunk error:** a dev server is still running while `.next` was rebuilt. Run `Launch Job Search Suite.cmd reset`. On macOS/Linux, stop the server, delete `.next`, and run `npm run dev` again.
- **Stale chunks after `npm run build`:** stop the dev server before building. Do not run `npm run build` and `npm run dev` in the same folder at the same time; both write to `.next`.
- **The workspace is empty after cloning:** expected. `data/` is git-ignored to keep resumes, jobs, and API keys private, so each clone starts fresh.
- **Static hosting/GitHub Pages does not work with the server build:** expected. API routes require a Node.js process. Use `npm run dev` or `npm start`, or publish `dist-portable/index.html` as a plain static file.
- **The desktop app says the local build is missing:** run `npm run build:static`, then start the app again. `npm run electron:dir` and `npm run electron:build` regenerate it automatically.
- **The browser/desktop build shows no live job titles:** expected. Save a job description, then click *Rebuild suggestions* in the Job titles tab.
- **Local data disappeared after clearing browser storage:** the browser builds keep data in `localStorage`. Export a JSON backup in Settings before clearing browsing data; the server build uses `data/` instead.

## Using it

1. **Import your resume** (Overview → Import your resume): PDF, DOCX, TXT, or pasted text.
2. **Import LinkedIn** (Overview → Import your LinkedIn profile): upload the JSON from LinkedIn's data export, or paste your profile text.
   - To get the JSON: LinkedIn → *Me* → *Settings & Privacy* → *Data Privacy* → *Get a copy of your data* → request the **JSON** format → download and unzip → upload the profile JSON file. The JSON export parses far more reliably than the PDF.
3. **Job descriptions tab**: paste a full posting. Analysis runs automatically as you type — no save required. Your resume stays open on the left; keyword gaps and prioritized recommendations appear on the right. Switch the resume dropdown between your original resume, working profile, and LinkedIn profile. Use *Save description* to keep a posting for later, and *Full report* for the detailed ATS breakdown.
4. **ATS check tab** (optional): a fuller scored report for a saved description, with history over time.
5. **Job titles tab**: click *Refresh titles* to read current public listings and see recommended title groups. Configure which sources to use in Settings. In the single-file and desktop builds, click *Rebuild suggestions* instead; suggestions come only from descriptions you saved locally.

## Discover job titles

The **Job titles** tab extracts titles, skills, and keywords from your working resume, then ranks public job listings against them. Each recommendation shows why it matched, sample listings with direct links, and the source credit. Only compact metadata is stored: title, company, location, link, source, date, seniority, and any published pay range.

- Use **Filter recommendations** to narrow cached results by location, seniority level, and annual pay range. Listings without published pay data are excluded from a pay filter unless **Include listings without pay data** is checked.
- Hourly, daily, weekly, and monthly pay is annualized for comparison. Pay is compared as a numeric range, so overlapping ranges still match.
- Sources: Greenhouse, Lever, Remotive, Remote OK, and Jobicy are keyless. Greenhouse and Lever need company board tokens in Settings.
- Adzuna and USAJOBS are scaffolded but disabled until you add API keys in Settings. These receive only short search keywords — never your name, email, phone, or full resume text.
- Set an optional **Target role** in Settings → Profile shortcuts to give the ranking a strong signal (for example, “Target Role”).
- Refreshing is manual and results are cached locally for 24 hours. Saving profile changes marks the cache stale so you know when to refresh again.
- Each source is credited in the UI with a direct link to its feed or site, and every sample result links to the original listing.

## Edit and export your resume

The **Job descriptions** tab has an **Edit working resume** section below the side-by-side panels. It uses the same full editor as the Profile workspace, so edits update the working profile used by the analysis above. Basics stay pinned at the top, and Links are part of Basics as contact details rather than a standalone section. Use the grip handles to drag resume sections and individual entries (including links) into the order you want, or focus a handle and press `↑` / `↓`. While dragging, the source dims and an animated insertion line previews exactly where the item will land before you release the mouse. The saved order drives the editor and resume preview; links appear with your contact details in both.

Skills are grouped. **Core** is required, always first, and cannot be renamed, removed, or moved; its individual skills remain editable. Use **Add group** to create custom skill groups, then drag groups, reorder skills within a group, or drag skills between groups with the same live preview. Empty groups show a drop area, and `↑` / `↓` moves a skill to the adjacent group at a list boundary. Experience descriptions use one auto-growing text field per bullet; the field expands as text wraps, press `Enter` to add the next bullet, drag the grip on each bullet to reorder within that role, and each field exports as a PDF bullet. The **Export as PDF** button produces an ATS-safe resume with selectable text, standard section headings, grouped skills, centered Basics/Links contact details, and no page numbers. Use the **1 page / Multi-page** control next to Save and Export to choose whether long roles are trimmed to fit one page or kept intact across multiple pages. The PDF always uses the template section order: Professional Summary, Experience, Skills, Certifications, Education, then Projects. Entries, bullets, skill groups, links, and certifications keep the order you set in the editor. Use **Save changes** to store edits locally, or **Export as PDF** to save changes and download a newly generated `Your-Name-resume.pdf`.

## Clean up saved data

Old local data can be removed from the UI:

- **Job descriptions tab → Delete all**: deletes every saved job description and its ATS checks.
- **Job descriptions tab → Saved → trash icon**: deletes one saved description and its ATS checks.
- **ATS check tab → History → trash icon / Clear all**: deletes one ATS check or all of them.
- **Job titles tab → Clear cache**: deletes all cached listings and refresh history.

Delete confirmations are required for bulk delete. These actions cannot be undone.

## Profile workspace

- **Working profile** — editable, saved locally.
- **Resume / LinkedIn** — read-only renderings of each source.
- **Compare** — field-by-field differences with a *Use* button to copy either source's value into the working profile.

## What the ATS check measures

| Category | Default weight | What it looks at |
| --- | --- | --- |
| Keyword coverage | 40% | High-value terms from the job description found in your resume |
| Hard-skill match | 25% | Recognized tools, technologies, and domain skills |
| Experience alignment | 15% | Years of experience in your dates vs what the role requests |
| ATS structure | 10% | Standard sections, contact details, parse-friendly layout |
| Quantified impact | 10% | Numbers, percentages, and action verbs in bullets |

It also produces a **"What the ATS sees"** panel (extracted word count, detected sections, contact fields, date formats, bullet counts) and a list of specific flags with suggested fixes.

> This is an explainable simulation of common ATS behavior, **not** a score from any particular employer's system. Weights are adjustable in Settings.

## AI assistance (optional)

Scoring works entirely offline. In **Settings** you can optionally connect:

- **Ollama** (local, private) — e.g. `llama3.1`
- **OpenAI-compatible API** — any compatible endpoint and key
- **Anthropic API**

When configured, the app adds a short tailored assessment after computing the deterministic score. With a cloud provider, job descriptions and profile text are sent to that service; the settings page says so explicitly.

## Data and privacy

The server build stores everything locally in `data/job-search-suite.db` (SQLite via the `sql.js` WebAssembly build) — no account, no cloud sync. The `data/` directory is git-ignored. API keys are stored in the same local database.

The single-file and desktop builds keep profiles, jobs, ATS history, and settings in `localStorage` instead. Settings offers JSON export/restore for those builds; API keys are session-only and are excluded from backups. Job-title discovery never sends your name, email, phone, or full resume text to a job source; keyless feeds receive no profile data at all, and the browser/desktop builds contact no job source at all.

## Project layout

```
app/api/                        Route handlers (parse, profile, jobs, ATS, titles, settings)
app/page.tsx                    App entry
components/                     UI (overview, profile workspace, jobs, title discovery, ATS results, settings)
electron/main.js                Electron desktop shell (loads the local static build)
lib/ats/                        Keyword extraction and scoring engine
lib/jobs/                       Public feed adapters and source metadata
lib/parse/                      Resume, LinkedIn export, and PDF/DOCX text extraction
lib/store/                      Shared store contract, server API store, and local browser store
lib/titles/                     Resume signal extraction, ranking, and cache service
lib/db.ts                       SQLite storage via sql.js (WASM)
lib/types.ts                    Shared profile and result types
scripts/launch.js               Cross-platform launcher logic and port fallback
static/                         Vite entry for the single-file build
vite.static.config.ts           Single-file build configuration
dist-portable/index.html        Generated offline app (git-ignored)
dist-electron/                  Generated desktop packages (git-ignored)
Launch Job Search Suite.cmd     Windows shell launcher
Launch Job Search Suite.command macOS shell launcher
Launch Job Search Suite.sh      Linux shell launcher
package.json                    Scripts and Node engine requirement
```

## Profile shortcuts

Add your LinkedIn and Indeed profile URLs in **Settings → Profile shortcuts**. The **Overview** tab then shows direct links that open each profile in a new tab. If no LinkedIn URL is set, the app uses one found in an imported LinkedIn profile when available.

## Possible next steps

- **Resume assistant:** add accept/edit/reject diff cards from ATS recommendations, revision history, and before/after ATS score deltas. DOCX export is not implemented; PDF export is available now.
