"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Compass,
  DollarSign,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import { buildRecommendations, filterJobListings, hasActiveTitleFilters } from "@/lib/titles/rank";
import {
  EMPTY_TITLE_FILTERS,
  SENIORITY_LEVELS,
  SENIORITY_LABELS,
  type JobSourceId,
  type StoredProfile,
  type TitleFilters,
  type TitleRecommendation,
  type TitlesPayload,
} from "@/lib/types";
import { Card, EmptyState, SectionHeader, Stat } from "./ui";

type Props = {
  data: TitlesPayload | null;
  profiles: Record<string, StoredProfile | null>;
  busy: string | null;
  onRefresh: () => Promise<void>;
  onClear: () => Promise<void>;
  onNavigateSettings: () => void;
  onNavigateProfile: () => void;
  onNavigateJobs?: () => void;
  staticMode?: boolean;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPay(value: number | null): string {
  if (value === null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function sourceLabel(data: TitlesPayload | null, id: JobSourceId): string {
  return data?.sources.find((source) => source.id === id)?.label ?? id;
}

export default function TitleRecommendations({
  data,
  profiles,
  busy,
  onRefresh,
  onClear,
  onNavigateSettings,
  onNavigateProfile,
  onNavigateJobs,
  staticMode = false,
}: Props) {
  const profileReady = Boolean(
    profiles.active?.profile?.name ||
      profiles.active?.profile?.experience?.length ||
      profiles.active?.profile?.skills?.some((group) => group.items.length),
  );
  const refreshing = busy === "titles";
  const clearing = busy === "titles-clear";
  const usableSources = data?.sources.filter((source) => source.enabled && source.configured) ?? [];
  const failedSources = data?.status.sourceStatuses.filter((status) => !status.ok) ?? [];
  const stale = Boolean(data?.status.stale);

  const [filters, setFilters] = useState<TitleFilters>({ ...EMPTY_TITLE_FILTERS });
  const filteredListings = useMemo(
    () => filterJobListings(data?.listings ?? [], filters),
    [data?.listings, filters],
  );
  const filteredRecommendations = useMemo(
    () => buildRecommendations(filteredListings),
    [filteredListings],
  );
  const filtersActive = hasActiveTitleFilters(filters);
  const resetFilters = () => setFilters({ ...EMPTY_TITLE_FILTERS });
  const setNumberFilter = (key: "minPay" | "maxPay", value: string) =>
    setFilters((current) => ({ ...current, [key]: value.trim() === "" ? null : Number(value) }));

  return (
    <>
      <SectionHeader
        eyebrow="Job titles"
        title="Find titles worth searching for."
        description={staticMode
          ? "This browser-only build never contacts a job feed. Save job descriptions and rebuild suggestions from their titles plus your working profile."
          : "Compare your working resume against current public job feeds and see the roles that repeat most often for your background. Nothing from your profile text is sent to the keyless feeds."}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-ghost text-xs"
              disabled={clearing || !data?.totalListings}
              onClick={() => {
                if (window.confirm("Delete all cached job listings and refresh history? This cannot be undone.")) {
                  void onClear();
                }
              }}
            >
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Clear cache
            </button>
            <button
              className="btn-primary text-xs"
              disabled={refreshing || !profileReady || (!staticMode && usableSources.length === 0)}
              onClick={() => void onRefresh()}
              title={!profileReady ? "Import a resume first" : !staticMode && usableSources.length === 0 ? "Enable a source in Settings" : staticMode ? "Rebuild from saved jobs" : "Fetch current listings"}
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {refreshing ? "Rebuilding…" : staticMode ? "Rebuild suggestions" : "Refresh titles"}
            </button>
          </div>
        }
      />

      {!data ? (
        <Card className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-accent-400" /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Recommended titles"
              value={filteredRecommendations.length}
              hint={filtersActive ? "Matches current filters" : "Grouped from current listings"}
            />
            <Stat
              label="Listings scanned"
              value={filteredListings.length}
              hint={filtersActive ? `of ${data.totalListings} cached listings` : "Compact metadata only"}
            />
            <Stat
              label="Cache"
              value={data.status.lastRefreshedAt ? (stale ? "Stale" : "Fresh") : "Empty"}
              hint={data.status.lastRefreshedAt ? `Updated ${formatDate(data.status.lastRefreshedAt)}` : "Not refreshed yet"}
              tone={stale ? "warn" : "good"}
            />
          </div>

          {stale && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-100/80">
              <Clock3 className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="flex-1">{data.status.staleReason}</span>
              {(profileReady && staticMode) || (profileReady && usableSources.length > 0) ? (
                <button className="btn-ghost px-3 py-1.5 text-[11px]" onClick={() => void onRefresh()}>
                  {staticMode ? "Rebuild now" : "Refresh now"}
                </button>
              ) : null}
            </div>
          )}

          {data.status.message && (
            <div className={`mt-3 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs ${
              data.status.state === "error"
                ? "border-rose-500/20 bg-rose-500/[0.06] text-rose-100/80"
                : "border-white/10 bg-white/[0.02] text-slate-400"
            }`}>
              {data.status.state === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint-400" />}
              <span>{data.status.message}</span>
            </div>
          )}

          <Card className="mt-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <SlidersHorizontal className="h-4 w-4 text-accent-400" /> Filter recommendations
              </h2>
              <button
                className="btn-ghost px-3 py-1.5 text-[11px]"
                disabled={!filtersActive}
                onClick={resetFilters}
              >
                Reset filters
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="label">Location</label>
                <input
                  className="input"
                  value={filters.location}
                  onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))}
                  placeholder="USA, New York, Remote"
                />
              </div>
              <div>
                <label className="label">Seniority</label>
                <select
                  className="input"
                  style={{ colorScheme: "dark" }}
                  value={filters.seniority}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      seniority: event.target.value as TitleFilters["seniority"],
                    }))
                  }
                >
                  <option value="all">All levels</option>
                  {SENIORITY_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {SENIORITY_LABELS[level]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Minimum pay / year</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={5000}
                  value={filters.minPay ?? ""}
                  onChange={(event) => setNumberFilter("minPay", event.target.value)}
                  placeholder="No minimum"
                />
              </div>
              <div>
                <label className="label">Maximum pay / year</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={5000}
                  value={filters.maxPay ?? ""}
                  onChange={(event) => setNumberFilter("maxPay", event.target.value)}
                  placeholder="No maximum"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-white/20 bg-ink-900 accent-accent-500"
                  checked={filters.includeUnknownPay}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, includeUnknownPay: event.target.checked }))
                  }
                />
                Include listings without pay data
              </label>
              <p className="text-[11px] text-slate-500">
                Hourly, daily, weekly, and monthly pay is annualized for comparison.
              </p>
            </div>

            {filtersActive && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Active</span>
                {filters.location.trim() && (
                  <span className="chip border-accent-500/20 bg-accent-500/[0.07] text-[11px] text-accent-300/90">
                    Location: {filters.location.trim()}
                  </span>
                )}
                {filters.seniority !== "all" && (
                  <span className="chip border-accent-500/20 bg-accent-500/[0.07] text-[11px] text-accent-300/90">
                    {SENIORITY_LABELS[filters.seniority]}
                  </span>
                )}
                {filters.minPay !== null && (
                  <span className="chip border-accent-500/20 bg-accent-500/[0.07] text-[11px] text-accent-300/90">
                    <DollarSign className="h-3 w-3" /> {formatPay(filters.minPay)}+
                  </span>
                )}
                {filters.maxPay !== null && (
                  <span className="chip border-accent-500/20 bg-accent-500/[0.07] text-[11px] text-accent-300/90">
                    <DollarSign className="h-3 w-3" /> Up to {formatPay(filters.maxPay)}
                  </span>
                )}
                {filters.includeUnknownPay && (
                  <span className="chip border-white/10 bg-white/[0.03] text-[11px] text-slate-400">
                    Unknown pay included
                  </span>
                )}
                <span className="ml-auto text-[11px] text-slate-400">
                  {filteredListings.length} of {data.totalListings} listings · {filteredRecommendations.length} recommendations
                </span>
              </div>
            )}
          </Card>

          {staticMode ? (
            <Card className="mt-5 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Compass className="h-4 w-4 text-accent-400" /> Local-only suggestions
              </h2>
              <p className="muted mt-2 text-xs">
                No network requests are made in this build. Titles come from job descriptions saved in this browser and the profile you edit here. Use Settings to export a private JSON backup.
              </p>
            </Card>
          ) : (
            <Card className="mt-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Compass className="h-4 w-4 text-accent-400" /> Sources
                </h2>
                <button className="btn-ghost px-3 py-1.5 text-[11px]" onClick={onNavigateSettings}>
                  Configure sources
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.sources.map((source) => {
                  const live = source.enabled && source.configured;
                  const failed = failedSources.some((status) => status.source === source.id && !status.ok);
                  return (
                    <a
                      key={source.id}
                      href={source.attributionUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={source.reason}
                      className={`chip transition hover:border-white/25 ${
                        live
                          ? failed
                            ? "border-amber-500/25 bg-amber-500/[0.06] text-amber-200/80"
                            : "border-mint-500/20 bg-mint-500/[0.06] text-mint-400"
                          : "border-white/[0.07] bg-white/[0.02] text-slate-500"
                      }`}
                    >
                      {source.requiresKey ? <KeyRound className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {source.label}
                      <span className="opacity-60">{live ? (failed ? "partial" : "on") : "off"}</span>
                    </a>
                  );
                })}
              </div>
            </Card>
          )}

          {!profileReady ? (
            <div className="mt-6">
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="No working resume yet"
                description="Import a resume or edit your working profile first. Titles and keywords from that profile drive the recommendations."
                action={<button className="btn-primary text-xs" onClick={onNavigateProfile}>Open Profile</button>}
              />
            </div>
          ) : !staticMode && usableSources.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<KeyRound className="h-6 w-6" />}
                title="No job sources ready"
                description="Enable a public feed or add an API key in Settings, then refresh. Greenhouse and Lever also need at least one company board token."
                action={<button className="btn-primary text-xs" onClick={onNavigateSettings}>Open Settings</button>}
              />
            </div>
          ) : staticMode && !data.totalListings ? (
            <div className="mt-6">
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="No saved job descriptions"
                description="Paste and save a job description first. This browser-only build derives title suggestions from those saved descriptions."
                action={<button className="btn-primary text-xs" onClick={() => onNavigateJobs?.()}>Open Job descriptions</button>}
              />
            </div>
          ) : filtersActive && filteredRecommendations.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<SlidersHorizontal className="h-6 w-6" />}
                title="No titles match these filters"
                description="No cached listings match the location, seniority, and pay filters you selected. Reset the filters to see all recommendations."
                action={<button className="btn-primary text-xs" onClick={resetFilters}>Reset filters</button>}
              />
            </div>
          ) : !data.recommendations.length ? (
            <div className="mt-6">
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="No matching titles yet"
                description={staticMode
                  ? "Saved jobs were read, but none matched your profile strongly enough. Add more skills to your working profile or save another job description."
                  : data.totalListings
                    ? "Listings were read, but none matched your profile strongly enough. Add more skills to your profile or try another source."
                    : "Refresh to read current public listings, or add a source in Settings."}
                action={
                  <div className="flex gap-2">
                    <button className="btn-primary text-xs" disabled={refreshing || !profileReady} onClick={() => void onRefresh()}>{staticMode ? "Rebuild suggestions" : "Refresh titles"}</button>
                    <button className="btn-ghost text-xs" onClick={staticMode ? () => onNavigateJobs?.() : onNavigateSettings}>{staticMode ? "Job descriptions" : "Settings"}</button>
                  </div>
                }
              />
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {filteredRecommendations.map((item, index) => (
                <RecommendationCard key={item.normalizedTitle} item={item} rank={index + 1} data={data} staticMode={staticMode} />
              ))}
            </div>
          )}

          <p className="mt-8 text-[11px] leading-relaxed text-slate-500">
            {staticMode
              ? "Everything in this build stays in this browser. Nothing is fetched from a job source; suggestions are rebuilt from your saved descriptions whenever you ask."
              : "Job data is credited to each source above and linked directly to the original listing. Listings are cached locally for 24 hours and only compact metadata (title, company, location, link, source, date) is stored."}
          </p>
        </>
      )}
    </>
  );
}

function RecommendationCard({ item, rank, data, staticMode = false }: { item: TitleRecommendation; rank: number; data: TitlesPayload; staticMode?: boolean }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-sm font-semibold text-accent-400">
              {rank}
            </span>
            <div>
              <h2 className="text-base font-semibold text-white sm:text-lg">{item.title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {item.listingCount} listing{item.listingCount === 1 ? "" : "s"} · {item.sources.map((source) => sourceLabel(data, source)).join(", ")}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">{item.reason}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.matchedTerms.map((term) => (
              <span key={term} className="chip border-accent-500/20 bg-accent-500/[0.07] text-[11px] text-accent-300/90">
                {term}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Match</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-white">{item.score.toFixed(1)}</p>
          {item.latestAt && <p className="mt-1 text-[11px] text-slate-500">Newest {formatDate(item.latestAt)}</p>}
        </div>
      </div>

      <div className="mt-5 grid gap-2 border-t border-white/[0.06] pt-4 md:grid-cols-2">
        {item.samples.map((listing) => {
          const content = (
            <>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-200 group-hover:text-white">{listing.title}</p>
                <p className="mt-1 truncate text-[11px] text-slate-500">
                  {listing.company}{listing.location ? ` · ${listing.location}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider text-slate-600">
                  <span>{sourceLabel(data, listing.source)} · {listing.matchScore.toFixed(1)} match</span>
                  {listing.seniority !== "unknown" && (
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-slate-400">
                      {SENIORITY_LABELS[listing.seniority]}
                    </span>
                  )}
                  {listing.salaryText && (
                    <span className="normal-case tracking-normal text-slate-400">{listing.salaryText}</span>
                  )}
                </div>
              </div>
              {!staticMode && <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 group-hover:text-accent-400" />}
            </>
          );
          const className = "group flex min-w-0 items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 transition hover:border-accent-500/25 hover:bg-accent-500/[0.04]";
          return staticMode ? (
            <div key={listing.id} className={className}>{content}</div>
          ) : (
            <a key={listing.id} href={listing.url} target="_blank" rel="noreferrer" className={className}>{content}</a>
          );
        })}
      </div>
    </Card>
  );
}
