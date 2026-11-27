"use client";

import {
  Briefcase,
  FileText,
  GraduationCap,
  Link2,
  Lock,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import {
  normalizeResumeSectionOrder,
  uid,
  type Profile,
  type ProfileSource,
  type ResumeSectionId,
  type StoredProfile,
} from "@/lib/types";
import {
  DragHandle,
  GroupedDragHandle,
  GroupedSortableZone,
  SortableZone,
  moveItem,
  useDragReorder,
  useGroupedDragReorder,
  type DragReorderController,
  type GroupedDragReorderController,
} from "./DragHandle";
import { Card } from "./ui";

type Props = {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onReset?: (source: ProfileSource) => Promise<void>;
  profiles?: Record<string, StoredProfile | null>;
  busy?: string | null;
};

type Updater = <K extends keyof Profile>(key: K, value: Profile[K]) => void;

export default function ResumeEditor({ profile, onChange, onReset, profiles, busy }: Props) {
  const update: Updater = (key, value) => onChange({ ...profile, [key]: value });
  const sectionOrder = normalizeResumeSectionOrder(profile.sectionOrder);
  const sectionReorder = useDragReorder((from, to) =>
    update("sectionOrder", moveItem(sectionOrder, from, to)),
  );
  const linkReorder = useDragReorder((from, to) =>
    update("links", moveItem(profile.links, from, to)),
  );

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Basics</h2>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-500">
              Pinned at top
            </span>
          </div>
          {onReset && profiles && (
            <div className="flex flex-wrap gap-2">
              {profiles.imported && (
                <button className="btn-ghost text-[11px]" disabled={busy === "reset"} onClick={() => void onReset("imported")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset from imported snapshot
                </button>
              )}
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={profile.name} onChange={(v) => update("name", v)} />
          <Field label="Headline" value={profile.headline} onChange={(v) => update("headline", v)} placeholder="Your headline" />
          <Field label="Email" value={profile.email} onChange={(v) => update("email", v)} />
          <Field label="Phone" value={profile.phone} onChange={(v) => update("phone", v)} />
          <Field label="Location" value={profile.location} onChange={(v) => update("location", v)} />
        </div>

        <div className="mt-5 border-t border-white/[0.07] pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Link2 className="h-4 w-4 text-accent-400" /> Links
              <span className="text-[10px] font-normal text-slate-500">Part of your contact details</span>
            </h3>
            <button
              className="btn-ghost text-xs"
              onClick={() => update("links", [...profile.links, { label: "", url: "" }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add link
            </button>
          </div>
          {profile.links.length === 0 && <p className="muted text-xs">No links yet.</p>}
          <div className="space-y-2">
            {profile.links.map((link, i) => (
              <SortableZone key={`link-${i}`} controller={linkReorder} index={i} className="flex items-center gap-2">
                <DragHandle controller={linkReorder} index={i} count={profile.links.length} label="link" />
                <input
                  className="input min-w-0 flex-1"
                  value={link.label}
                  onChange={(e) => setLink(profile, i, { label: e.target.value }, update)}
                  placeholder="LinkedIn"
                />
                <input
                  className="input min-w-0 flex-[2]"
                  value={link.url}
                  onChange={(e) => setLink(profile, i, { url: e.target.value }, update)}
                  onBlur={(e) => setLink(profile, i, { url: normalizeUrl(e.target.value) }, update)}
                  placeholder="https://linkedin.com/in/you"
                />
                <RemoveIconButton onClick={() => update("links", profile.links.filter((_, idx) => idx !== i))} />
              </SortableZone>
            ))}
          </div>
        </div>
      </Card>

      {sectionOrder.map((sectionId, index) => (
        <SortableZone key={sectionId} controller={sectionReorder} index={index}>
          <SectionCard
            id={sectionId}
            index={index}
            count={sectionOrder.length}
            profile={profile}
            update={update}
            controller={sectionReorder}
          />
        </SortableZone>
      ))}
    </div>
  );
}

function SectionCard({
  id,
  index,
  count,
  profile,
  update,
  controller,
}: {
  id: ResumeSectionId;
  index: number;
  count: number;
  profile: Profile;
  update: Updater;
  controller: DragReorderController;
}) {
  switch (id) {
    case "summary":
      return (
        <Card className="p-6">
          <SectionHeading
            title="Summary"
            icon={<FileText className="h-4 w-4" />}
            controller={controller}
            index={index}
            count={count}
          />
          <TextArea
            label="Professional summary"
            value={profile.summary}
            onChange={(v) => update("summary", v)}
            rows={4}
            placeholder="A short, keyword-rich summary…"
          />
        </Card>
      );
    case "experience":
      return (
        <ExperienceSection
          profile={profile}
          update={update}
          controller={controller}
          index={index}
          count={count}
        />
      );
    case "education":
      return (
        <EducationSection
          profile={profile}
          update={update}
          controller={controller}
          index={index}
          count={count}
        />
      );
    case "skills":
      return (
        <SkillsSection
          profile={profile}
          update={update}
          controller={controller}
          index={index}
          count={count}
        />
      );
    case "certifications":
      return (
        <CertificationsSection
          profile={profile}
          update={update}
          controller={controller}
          index={index}
          count={count}
        />
      );
    case "projects":
      return (
        <ProjectsSection
          profile={profile}
          update={update}
          controller={controller}
          index={index}
          count={count}
        />
      );
    default:
      return null;
  }
}

function SectionHeading({
  title,
  icon,
  action,
  controller,
  index,
  count,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  controller: DragReorderController;
  index: number;
  count: number;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <DragHandle controller={controller} index={index} count={count} label="resume section" />
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
          <span className="text-accent-400">{icon}</span>
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function ExperienceSection({
  profile,
  update,
  controller,
  index,
  count,
}: SectionComponentProps) {
  const reorder = useDragReorder((from, to) => update("experience", moveItem(profile.experience, from, to)));
  return (
    <Card className="p-6">
      <SectionHeading
        title="Experience"
        icon={<Briefcase className="h-4 w-4" />}
        action={
          <button
            className="btn-ghost text-xs"
            onClick={() => update("experience", [...profile.experience, { id: uid(), title: "", company: "", location: "", startDate: "", endDate: "", current: false, description: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add role
          </button>
        }
        controller={controller}
        index={index}
        count={count}
      />
      {profile.experience.length === 0 && <p className="muted text-xs">No roles yet.</p>}
      <div className="space-y-4">
        {profile.experience.map((exp, i) => (
          <SortableZone
            key={exp.id}
            controller={reorder}
            index={i}
            className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
          >
            <ItemToolbar
              controller={reorder}
              index={i}
              count={profile.experience.length}
              label="experience entry"
              onRemove={() => update("experience", profile.experience.filter((_, idx) => idx !== i))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" value={exp.title} onChange={(v) => setExperience(profile, i, { title: v }, update)} />
              <Field label="Company" value={exp.company} onChange={(v) => setExperience(profile, i, { company: v }, update)} />
              <Field label="Location" value={exp.location} onChange={(v) => setExperience(profile, i, { location: v }, update)} />
              <Field label="Start date" value={exp.startDate} onChange={(v) => setExperience(profile, i, { startDate: v }, update)} placeholder="Mon YYYY" />
              <Field label="End date" value={exp.endDate} onChange={(v) => setExperience(profile, i, { endDate: v }, update)} placeholder="Present" />
              <label className="flex items-end gap-2 pb-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={exp.current}
                  onChange={(e) => setExperience(profile, i, { current: e.target.checked }, update)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent accent-accent-500"
                />
                Currently employed
              </label>
            </div>
            <div className="mt-3">
              <BulletFields
                label="Description / bullets"
                value={exp.description}
                onChange={(v) => setExperience(profile, i, { description: v }, update)}
              />
            </div>
          </SortableZone>
        ))}
      </div>
    </Card>
  );
}

function EducationSection({
  profile,
  update,
  controller,
  index,
  count,
}: SectionComponentProps) {
  const reorder = useDragReorder((from, to) => update("education", moveItem(profile.education, from, to)));
  return (
    <Card className="p-6">
      <SectionHeading
        title="Education"
        icon={<GraduationCap className="h-4 w-4" />}
        action={
          <button
            className="btn-ghost text-xs"
            onClick={() => update("education", [...profile.education, { id: uid(), school: "", degree: "", field: "", startDate: "", endDate: "", details: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add education
          </button>
        }
        controller={controller}
        index={index}
        count={count}
      />
      {profile.education.length === 0 && <p className="muted text-xs">No education entries yet.</p>}
      <div className="space-y-4">
        {profile.education.map((edu, i) => (
          <SortableZone
            key={edu.id}
            controller={reorder}
            index={i}
            className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
          >
            <ItemToolbar
              controller={reorder}
              index={i}
              count={profile.education.length}
              label="education entry"
              onRemove={() => update("education", profile.education.filter((_, idx) => idx !== i))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="School" value={edu.school} onChange={(v) => setEducation(profile, i, { school: v }, update)} />
              <Field label="Degree" value={edu.degree} onChange={(v) => setEducation(profile, i, { degree: v }, update)} />
              <Field label="Field of study" value={edu.field} onChange={(v) => setEducation(profile, i, { field: v }, update)} />
              <Field label="Start date" value={edu.startDate} onChange={(v) => setEducation(profile, i, { startDate: v }, update)} />
              <Field label="End date" value={edu.endDate} onChange={(v) => setEducation(profile, i, { endDate: v }, update)} />
            </div>
            <div className="mt-3">
              <TextArea label="Details" value={edu.details} onChange={(v) => setEducation(profile, i, { details: v }, update)} rows={2} />
            </div>
          </SortableZone>
        ))}
      </div>
    </Card>
  );
}

function SkillsSection({ profile, update, controller, index, count }: SectionComponentProps) {
  const groupReorder = useDragReorder((from, to) => {
    const [core, ...custom] = profile.skills;
    update("skills", [core, ...moveItem(custom, from, to)]);
  });

  const skillItemReorder = useGroupedDragReorder(
    (from, to) => {
      const groups = structuredClone(profile.skills);
      const source = groups[from.group];
      const target = groups[to.group];
      if (!source || !target) return;
      const [moved] = source.items.splice(from.index, 1);
      if (moved === undefined) return;
      target.items.splice(to.index, 0, moved);
      update("skills", groups);
    },
    profile.skills.map((group) => group.items.length),
  );

  function addGroup() {
    const used = new Set(profile.skills.map((group) => group.group.trim().toLowerCase()));
    let name = "Custom group";
    let suffix = 2;
    while (used.has(name.toLowerCase())) name = `Custom group ${suffix++}`;
    update("skills", [...profile.skills, { id: uid(), group: name, items: [] }]);
  }

  return (
    <Card className="p-6">
      <SectionHeading
        title="Skills"
        icon={<Sparkles className="h-4 w-4" />}
        action={
          <button className="btn-ghost text-xs" onClick={addGroup}>
            <Plus className="h-3.5 w-3.5" /> Add group
          </button>
        }
        controller={controller}
        index={index}
        count={count}
      />
      <p className="muted mb-4 text-xs">
        Core is required and always first. Add custom groups for systems, software, or other skill categories, then drag skills between groups with the handles.
      </p>
      <div className="space-y-4">
        {profile.skills.map((group, groupIndex) => (
          <SkillGroupCard
            key={group.id}
            profile={profile}
            update={update}
            group={group}
            groupIndex={groupIndex}
            groupCount={profile.skills.length}
            groupReorder={groupReorder}
            itemReorder={skillItemReorder}
          />
        ))}
      </div>
    </Card>
  );
}

function SkillGroupCard({
  profile,
  update,
  group,
  groupIndex,
  groupCount,
  groupReorder,
  itemReorder,
}: {
  profile: Profile;
  update: Updater;
  group: Profile["skills"][number];
  groupIndex: number;
  groupCount: number;
  groupReorder: DragReorderController;
  itemReorder: GroupedDragReorderController;
}) {
  const isCore = groupIndex === 0 || group.locked === true;
  const customIndex = groupIndex - 1;

  function addSkill() {
    const groups = structuredClone(profile.skills);
    groups[groupIndex] = {
      ...groups[groupIndex],
      items: [...groups[groupIndex].items, ""],
    };
    update("skills", groups);
  }

  function removeGroup() {
    if (group.items.some(Boolean) && !window.confirm(`Remove "${group.group}" and its skills?`)) return;
    update("skills", profile.skills.filter((_, i) => i !== groupIndex));
  }

  const card = (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        {isCore ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500" title="Required group">
            <Lock className="h-3.5 w-3.5" />
          </span>
        ) : (
          <DragHandle
            controller={groupReorder}
            index={customIndex}
            count={Math.max(0, groupCount - 1)}
            label="skill group"
          />
        )}
        {isCore ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-100">Core</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-500">
              Required
            </span>
          </div>
        ) : (
          <input
            className="input min-w-0 flex-1 py-1.5 text-xs"
            value={group.group}
            onChange={(e) => setSkillGroupName(profile, groupIndex, e.target.value, update)}
            onBlur={() => commitSkillGroupName(profile, groupIndex, update)}
            placeholder="Group name"
            aria-label="Skill group name"
          />
        )}
        {!isCore && <RemoveIconButton onClick={removeGroup} />}
      </div>
      <div className="space-y-2">
        {group.items.map((skill, i) => (
          <GroupedSortableZone
            key={`skill-${group.id}-${i}`}
            controller={itemReorder}
            groupIndex={groupIndex}
            index={i}
            className="flex items-center gap-2"
          >
            <GroupedDragHandle controller={itemReorder} groupIndex={groupIndex} index={i} label="skill" />
            <input
              className="input min-w-0 flex-1"
              value={skill}
              onChange={(e) => setSkillGroupItem(profile, groupIndex, i, e.target.value, update)}
              placeholder={isCore ? "Core skill" : "Custom skill"}
            />
            <RemoveIconButton
              onClick={() => {
                const groups = structuredClone(profile.skills);
                groups[groupIndex] = {
                  ...groups[groupIndex],
                  items: groups[groupIndex].items.filter((_, idx) => idx !== i),
                };
                update("skills", groups);
              }}
            />
          </GroupedSortableZone>
        ))}
        <GroupedSortableZone
          controller={itemReorder}
          groupIndex={groupIndex}
          index={group.items.length}
          className={
            group.items.length === 0
              ? "rounded-md border border-dashed border-white/10 px-3 py-2"
              : "h-4 rounded-md"
          }
        >
          {group.items.length === 0 && (
            <p className="muted text-xs">
              {itemReorder.dragging ? "Drop a skill here" : "No skills in this group yet."}
            </p>
          )}
        </GroupedSortableZone>
      </div>
      <button className="btn-ghost mt-3 text-xs" onClick={addSkill}>
        <Plus className="h-3.5 w-3.5" /> Add skill
      </button>
    </Card>
  );

  return isCore ? (
    card
  ) : (
    <SortableZone controller={groupReorder} index={customIndex}>
      {card}
    </SortableZone>
  );
}

function CertificationsSection({ profile, update, controller, index, count }: SectionComponentProps) {
  const reorder = useDragReorder((from, to) => update("certifications", moveItem(profile.certifications, from, to)));
  return (
    <Card className="p-6">
      <SectionHeading
        title="Certifications"
        icon={<Sparkles className="h-4 w-4" />}
        action={
          <button
            className="btn-ghost text-xs"
            onClick={() => update("certifications", [...profile.certifications, { id: uid(), name: "", issuer: "", date: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add certification
          </button>
        }
        controller={controller}
        index={index}
        count={count}
      />
      {profile.certifications.length === 0 && <p className="muted text-xs">No certifications yet.</p>}
      <div className="space-y-4">
        {profile.certifications.map((cert, i) => (
          <SortableZone
            key={cert.id}
            controller={reorder}
            index={i}
            className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
          >
            <ItemToolbar
              controller={reorder}
              index={i}
              count={profile.certifications.length}
              label="certification"
              onRemove={() => update("certifications", profile.certifications.filter((_, idx) => idx !== i))}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name" value={cert.name} onChange={(v) => setCert(profile, i, { name: v }, update)} />
              <Field label="Issuer" value={cert.issuer} onChange={(v) => setCert(profile, i, { issuer: v }, update)} />
              <Field label="Date" value={cert.date} onChange={(v) => setCert(profile, i, { date: v }, update)} />
            </div>
          </SortableZone>
        ))}
      </div>
    </Card>
  );
}

function ProjectsSection({ profile, update, controller, index, count }: SectionComponentProps) {
  const reorder = useDragReorder((from, to) => update("projects", moveItem(profile.projects, from, to)));
  return (
    <Card className="p-6">
      <SectionHeading
        title="Projects"
        icon={<Link2 className="h-4 w-4" />}
        action={
          <button
            className="btn-ghost text-xs"
            onClick={() => update("projects", [...profile.projects, { id: uid(), name: "", description: "", link: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add project
          </button>
        }
        controller={controller}
        index={index}
        count={count}
      />
      {profile.projects.length === 0 && <p className="muted text-xs">No projects yet.</p>}
      <div className="space-y-4">
        {profile.projects.map((project, i) => (
          <SortableZone
            key={project.id}
            controller={reorder}
            index={i}
            className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
          >
            <ItemToolbar
              controller={reorder}
              index={i}
              count={profile.projects.length}
              label="project"
              onRemove={() => update("projects", profile.projects.filter((_, idx) => idx !== i))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={project.name} onChange={(v) => setProject(profile, i, { name: v }, update)} />
              <Field label="Link" value={project.link} onChange={(v) => setProject(profile, i, { link: v }, update)} />
            </div>
            <div className="mt-3">
              <TextArea label="Description" value={project.description} onChange={(v) => setProject(profile, i, { description: v }, update)} rows={2} />
            </div>
          </SortableZone>
        ))}
      </div>
    </Card>
  );
}

type SectionComponentProps = {
  profile: Profile;
  update: Updater;
  controller: DragReorderController;
  index: number;
  count: number;
};

function ItemToolbar({
  controller,
  index,
  count,
  label,
  onRemove,
}: {
  controller: DragReorderController;
  index: number;
  count: number;
  label: string;
  onRemove: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-end gap-2">
      <DragHandle controller={controller} index={index} count={count} label={label} />
      <RemoveIconButton onClick={onRemove} />
    </div>
  );
}

function RemoveIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="text-slate-500 hover:text-rose-400" onClick={onClick} title="Remove" aria-label="Remove">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function TextArea({ label, hint, value, onChange, rows, placeholder }: { label: string; hint?: string; value: string; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="label">{label}</label>
        {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
      </div>
      <textarea className="input resize-y" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function splitDescriptionBullets(value: string): string[] {
  const lines = (value ?? "").replace(/\r\n?/g, "\n").split("\n");
  return lines.map((line) => line.replace(/^\s*[-•*]\s+/, "").trim());
}

function BulletFields({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const bullets = splitDescriptionBullets(value);
  const inputs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const bulletReorder = useDragReorder((from, to) => write(moveItem(bullets, from, to)));

  useEffect(() => {
    for (const element of inputs.current) {
      if (!element) continue;
      element.style.height = "auto";
      const style = window.getComputedStyle(element);
      const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      element.style.height = `${element.scrollHeight + borders}px`;
    }
  }, [value]);

  function write(next: string[]) {
    onChange(next.join("\n"));
  }

  function addBullet(afterIndex: number) {
    const next = [...bullets];
    const insertAt = afterIndex + 1;
    next.splice(insertAt, 0, "");
    write(next);
    setTimeout(() => inputs.current[insertAt]?.focus(), 0);
  }

  function removeBullet(index: number) {
    const next = bullets.filter((_, i) => i !== index);
    write(next.length ? next : [""]);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="label">{label}</label>
        <span className="text-[10px] text-slate-500">Drag to reorder • one bullet per field</span>
      </div>
      <div className="space-y-2">
        {bullets.map((bullet, i) => (
          <SortableZone key={i} controller={bulletReorder} index={i} className="flex items-start gap-2">
            <DragHandle controller={bulletReorder} index={i} count={bullets.length} label="bullet" />
            <span aria-hidden="true" className="mt-2 text-xs text-slate-500">•</span>
            <textarea
              ref={(element) => {
                inputs.current[i] = element;
              }}
              rows={1}
              className="input min-w-0 flex-1 resize-none overflow-hidden leading-5"
              value={bullet}
              onChange={(event) => {
                const next = [...bullets];
                next[i] = event.target.value;
                write(next);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addBullet(i);
                }
              }}
              placeholder="Describe an achievement or responsibility"
              aria-label={`${label} ${i + 1}`}
            />
            <RemoveIconButton onClick={() => removeBullet(i)} />
          </SortableZone>
        ))}
      </div>
      <button className="btn-ghost mt-2 text-xs" onClick={() => addBullet(bullets.length - 1)}>
        <Plus className="h-3.5 w-3.5" /> Add bullet
      </button>
    </div>
  );
}

function setExperience(profile: Profile, index: number, patch: Partial<Profile["experience"][number]>, update: Updater) {
  const list = structuredClone(profile.experience);
  list[index] = { ...list[index], ...patch };
  update("experience", list);
}
function setEducation(profile: Profile, index: number, patch: Partial<Profile["education"][number]>, update: Updater) {
  const list = structuredClone(profile.education);
  list[index] = { ...list[index], ...patch };
  update("education", list);
}
function setCert(profile: Profile, index: number, patch: Partial<Profile["certifications"][number]>, update: Updater) {
  const list = structuredClone(profile.certifications);
  list[index] = { ...list[index], ...patch };
  update("certifications", list);
}
function setProject(profile: Profile, index: number, patch: Partial<Profile["projects"][number]>, update: Updater) {
  const list = structuredClone(profile.projects);
  list[index] = { ...list[index], ...patch };
  update("projects", list);
}
function setSkillGroupItem(
  profile: Profile,
  groupIndex: number,
  itemIndex: number,
  value: string,
  update: Updater,
) {
  const groups = structuredClone(profile.skills);
  groups[groupIndex].items[itemIndex] = value;
  update("skills", groups);
}

function skillGroupNameConflict(profile: Profile, groupIndex: number, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "core" ||
    profile.skills.some(
      (group, i) => i !== groupIndex && group.group.trim().toLowerCase() === normalized,
    )
  );
}

function setSkillGroupName(profile: Profile, groupIndex: number, value: string, update: Updater) {
  if (value.trim() && skillGroupNameConflict(profile, groupIndex, value)) return;
  const groups = structuredClone(profile.skills);
  groups[groupIndex].group = value;
  update("skills", groups);
}

function commitSkillGroupName(profile: Profile, groupIndex: number, update: Updater) {
  const groups = structuredClone(profile.skills);
  let name = groups[groupIndex].group.trim();
  if (!name || skillGroupNameConflict(profile, groupIndex, name)) {
    name = `Custom group ${groupIndex + 1}`;
  }
  groups[groupIndex].group = name;
  update("skills", groups);
}
function setLink(profile: Profile, index: number, patch: Partial<Profile["links"][number]>, update: Updater) {
  const list = structuredClone(profile.links);
  list[index] = { ...list[index], ...patch };
  update("links", list);
}

function normalizeUrl(url: string): string {
  const value = url.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
