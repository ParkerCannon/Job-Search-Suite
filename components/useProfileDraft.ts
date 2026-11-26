"use client";

import { useEffect, useRef, useState } from "react";
import { emptyProfile, normalizeProfile, type Profile, type StoredProfile } from "@/lib/types";

/**
 * Keeps a local editable copy of the active profile in sync with saved data,
 * without throwing away edits when an unrelated refresh loads the profile again.
 */
export function useProfileDraft(active: StoredProfile | null | undefined) {
  const initial = normalizeProfile(active?.profile ?? emptyProfile());
  const [draft, setDraft] = useState<Profile>(initial);
  const lastSynced = useRef<Profile>(initial);

  useEffect(() => {
    const next = normalizeProfile(active?.profile ?? emptyProfile());
    setDraft((current) =>
      JSON.stringify(current) === JSON.stringify(lastSynced.current) ? next : current,
    );
    lastSynced.current = next;
  }, [active]);

  return [draft, setDraft] as const;
}
