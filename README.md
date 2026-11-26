# Job Search Suite

A local-first web app that parses your resume and LinkedIn profile into one structured profile, shows what an ATS would actually see, and scores you against a job description you paste in. The Job Descriptions window keeps your resume open next to a live keyword analysis with concrete recommendations. The Job Titles window compares your working resume against current public job feeds and recommends titles worth searching for.

There is no job-site HTML scraping and no arbitrary URL fetching. Job-title discovery uses only an allowlist of public APIs/feeds and the descriptions you paste in stay local.

## Requirements

- Node.js 18 or newer
- npm (included with Node.js)

SQLite runs through `sql.js` (WebAssembly), so there is no native database module to compile and older/32-bit Node installations are supported.

> **This is not a standalone HTML app.** Opening `Launch Job Search Suite.html` directly does not render the GUI. The HTML launcher only checks for a local server and redirects to it. The app needs a running Node.js server, and the server dependencies are not included in Git.

## Run it

From the project folder:

```bash
npm install
npm run dev
```

Then open the URL printed in the terminal, usually http://localhost:3000. If that port is busy, the launcher tries 3001 through 3010 and prints the URL it selected. The first run creates `data/job-search-suite.db` locally.

### Desktop shortcut

- **`Launch Job Search Suite.cmd`** (Windows, recommended) — double-click to check Node.js/npm, install dependencies if needed, find the next available port, clear stale build cache, start a fresh dev server, wait until it responds, and open the browser. Run it with `check` to validate the environment, or `reset` to stop this project's servers and start clean.
- **`Launch Job Search Suite.command`** (macOS) and **`Launch Job Search Suite.sh`** (Linux) — equivalent wrappers. On macOS, right-click → *Open* the first time if Gatekeeper asks.
- **`Launch Job Search Suite.html`** — right-click → *Send to* → *Desktop (create shortcut)*. It checks for the server and shows setup instructions if the server is not running.
- **`Job Search Suite.url`** — a plain Internet Shortcut to `http://localhost:3000`. It only works while the server is using port 3000.

The HTML file and `.url` shortcut require the dev server to be running (`npm run dev`). The launchers start it for you and always print the actual URL.

For a production run:

```bash
npm run build
npm start
```

## Troubleshooting

- **`npm` is not recognized:** Node.js is either not installed or not on PATH. Install Node.js 18 or newer from https://nodejs.org/ and reopen the terminal.
- **The launcher window closes immediately:** run it from an already-open Command Prompt so the error stays visible, or use `Launch Job Search Suite.cmd check` to print diagnostics.
- **The HTML launcher shows "server is not running":** run `npm install` then `npm run dev` in the project folder, then reopen the launcher.
- **Browser shows `ERR_CONNECTION_REFUSED`:** open the exact URL printed by the launcher. Port 3000 may be taken by another program, in which case the app uses 3001–3010.
- **`Cannot find module './611.js'` or another stale chunk error:** a dev server is still running while `.next` was rebuilt. Run `Launch Job Search Suite.cmd reset`. On macOS/Linux, stop the server, delete `.next`, and run `npm run dev` again.
- **Stale chunks after `npm run build`:** stop the dev server before building. Do not run `npm run build` and `npm run dev` in the same folder at the same time; both write to `.next`.
- **The workspace is empty after cloning:** expected. `data/` is git-ignored to keep resumes, jobs, and API keys private, so each clone starts fresh.
- **Static hosting/GitHub Pages does not work with the server build:** expected. API routes require a Node.js process. Use `npm run dev` or `npm start`.

## Using it

1. **Import your resume** (Overview → Import your resume): PDF, DOCX, TXT, or pasted text.
2. **Import LinkedIn** (Overview → Import your LinkedIn profile): upload the JSON from LinkedIn's data export, or paste your profile text.
   - To get the JSON: LinkedIn → *Me* → *Settings & Privacy* → *Data Privacy* → *Get a copy of your data* → request the **JSON** format → download and unzip → upload the profile JSON file. The JSON export parses far more reliably than the PDF.
3. **Job descriptions tab**: paste a full posting. Analysis runs automatically as you type — no save required. Your resume stays open on the left; keyword gaps and prioritized recommendations appear on the right. Switch the resume dropdown between your original resume, working profile, and LinkedIn profile. Use *Save description* to keep a posting for later, and *Full report* for the detailed ATS breakdown.
4. **ATS check tab** (optional): a fuller scored report for a saved description, with history over time.
5. **Job titles tab**: click *Refresh titles* to read current public listings and see recommended title groups. Configure which sources to use in Settings.

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

Skills are grouped. **Core** is required, always first, and cannot be renamed, removed, or moved; its individual skills remain editable. Use **Add group** to create custom skill groups, then drag groups, reorder skills within a group, or drag skills between groups with the same live preview. Empty groups show a drop area, and `↑` / `↓` moves a skill to the adjacent group at a list boundary. Experience descriptions use one auto-growing text field per bullet; the field expands as text wraps, press `Enter` to add the next bullet, drag the grip on each bullet to reorder within that role, and each field exports as a PDF bullet. The **Export as PDF** button produces an ATS-safe, one-page resume with selectable text, standard section headings, grouped skills, centered Basics/Links contact details, and no page numbers. The PDF always uses the template section order: Professional Summary, Experience, Skills, Certifications, Education, then Projects. Entries, bullets, skill groups, links, and certifications keep the order you set in the editor. Use **Save changes** to store edits locally, or **Export as PDF** to save changes and download a newly generated `Your-Name-resume.pdf`.

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

Everything is stored locally in `data/job-search-suite.db` (SQLite via the `sql.js` WebAssembly build) — no account, no cloud sync. The `data/` directory is git-ignored. API keys are stored in the same local database. Job-title discovery never sends your name, email, phone, or full resume text to a job source; keyless feeds receive no profile data at all.

## Project layout

```
app/api/                        Route handlers (parse, profile, jobs, ATS, titles, settings)
app/page.tsx                    App entry
components/                     UI (overview, profile workspace, jobs, title discovery, ATS results, settings)
lib/ats/                        Keyword extraction and scoring engine
lib/jobs/                       Public feed adapters and source metadata
lib/parse/                      Resume, LinkedIn export, and PDF/DOCX text extraction
lib/titles/                     Resume signal extraction, ranking, and cache service
lib/db.ts                       SQLite storage via sql.js (WASM)
lib/types.ts                    Shared profile and result types
scripts/launch.js               Cross-platform launcher logic and port fallback
Launch Job Search Suite.cmd     Windows launcher wrapper
Launch Job Search Suite.command macOS launcher wrapper
Launch Job Search Suite.sh      Linux launcher wrapper
Launch Job Search Suite.html    Browser launcher (checks server, then redirects)
Job Search Suite.url            Plain localhost shortcut (requires port 3000)
package.json                    Scripts and Node engine requirement
```

## Profile shortcuts

Add your LinkedIn and Indeed profile URLs in **Settings → Profile shortcuts**. The **Overview** tab then shows direct links that open each profile in a new tab. If no LinkedIn URL is set, the app uses one found in an imported LinkedIn profile when available.

## Planned next phase

- **Resume assistant:** add accept/edit/reject diff cards from ATS recommendations, revision history, and before/after ATS score deltas. DOCX export is not implemented; PDF export is available now.
