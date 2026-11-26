"use client";

import { Fragment } from "react";
import { Link2, Mail, MapPin, Phone } from "lucide-react";
import { normalizeResumeSectionOrder, type Profile, type ResumeSectionId } from "@/lib/types";
import { Card } from "./ui";

export default function ProfileDocument({
  profile,
  compact = false,
}: {
  profile: Profile;
  compact?: boolean;
}) {
  const sectionOrder = normalizeResumeSectionOrder(profile.sectionOrder);

  function renderSection(id: ResumeSectionId) {
    switch (id) {
      case "summary":
        return profile.summary ? (
          <DocSection title="Summary">
            <p className="text-sm leading-7 text-slate-300">{profile.summary}</p>
          </DocSection>
        ) : null;
      case "experience":
        return profile.experience.length > 0 ? (
          <DocSection title="Experience">
            <div className="space-y-6">
              {profile.experience.map((e) => (
                <div key={e.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-white">
                      {e.title || "Role"}
                      {e.company && <span className="font-normal text-slate-400"> · {e.company}</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[e.startDate, e.endDate || (e.current ? "Present" : "")].filter(Boolean).join(" – ")}
                    </p>
                  </div>
                  {e.location && <p className="mt-0.5 text-xs text-slate-500">{e.location}</p>}
                  {e.description && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{e.description}</p>
                  )}
                </div>
              ))}
            </div>
          </DocSection>
        ) : null;
      case "education":
        return profile.education.length > 0 ? (
          <DocSection title="Education">
            <div className="space-y-3">
              {profile.education.map((e) => (
                <div key={e.id} className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{e.school}</p>
                    <p className="text-xs text-slate-400">{[e.degree, e.field].filter(Boolean).join(" · ")}</p>
                    {e.details && <p className="mt-1 text-xs text-slate-500">{e.details}</p>}
                  </div>
                  <p className="text-xs text-slate-500">{[e.startDate, e.endDate].filter(Boolean).join(" – ")}</p>
                </div>
              ))}
            </div>
          </DocSection>
        ) : null;
      case "skills":
        return profile.skills.some((group) => group.items.some(Boolean)) ? (
          <DocSection title="Skills">
            <div className="space-y-2">
              {profile.skills
                .filter((group) => group.items.some(Boolean))
                .map((group) => (
                  <p key={group.id} className="text-sm leading-6 text-slate-300">
                    <span className="font-semibold text-white">{group.group}:</span>{" "}
                    {group.items.filter(Boolean).join(", ")}
                  </p>
                ))}
            </div>
          </DocSection>
        ) : null;
      case "certifications":
        return profile.certifications.length > 0 ? (
          <DocSection title="Certifications">
            {profile.certifications.map((c) => (
              <p key={c.id} className="mb-1.5 text-sm text-slate-300">
                {[c.name, c.issuer].filter(Boolean).join(" — ")}
                {c.date && <span className="text-slate-500"> · {c.date}</span>}
              </p>
            ))}
          </DocSection>
        ) : null;
      case "projects":
        return profile.projects.length > 0 ? (
          <DocSection title="Projects">
            {profile.projects.map((p) => (
              <div key={p.id} className="mb-3">
                <p className="text-sm font-semibold text-white">
                  {p.name}
                  {p.link && <span className="ml-2 text-xs font-normal text-accent-400">{p.link}</span>}
                </p>
                <p className="whitespace-pre-line text-sm text-slate-300">{p.description}</p>
              </div>
            ))}
          </DocSection>
        ) : null;
    }
  }

  return (
    <Card className={compact ? "p-5 sm:p-6" : "p-7 sm:p-10"}>
      <div className="border-b border-white/[0.08] pb-6">
        <h2 className={`font-semibold tracking-tight text-white ${compact ? "text-2xl" : "text-3xl"}`}>
          {profile.name || "Your name"}
        </h2>
        <p className="mt-1.5 text-sm text-accent-400">{profile.headline}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-400">
          {profile.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{profile.email}</span>}
          {profile.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{profile.phone}</span>}
          {profile.location && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{profile.location}</span>}
          {profile.links.filter((link) => link.label || link.url).map((link, i) =>
            link.url ? (
              <a
                key={`${link.url}-${i}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-accent-400 hover:underline"
              >
                <Link2 className="h-3.5 w-3.5" />
                {link.label || link.url}
              </a>
            ) : (
              <span key={`${link.label}-${i}`} className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                {link.label}
              </span>
            ),
          )}
        </div>
      </div>

      {sectionOrder.map((id) => (
        <Fragment key={id}>{renderSection(id)}</Fragment>
      ))}
    </Card>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-accent-400">{title}</h3>
      {children}
    </section>
  );
}
