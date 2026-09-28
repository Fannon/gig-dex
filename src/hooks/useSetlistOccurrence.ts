import { useEffect, useState } from "react";
import { getSetlist, LIBRARY_CHANGED_EVENT, type Setlist, updateSetlist } from "../db";
import { occurrenceSettings } from "../utils/setlistSettings";

export function useSetlistOccurrence(listId: string | null, songId: string | undefined, index: number) {
  const [list, setList] = useState<Setlist>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setList(undefined);
    const load = () => {
      if (!listId) return;
      void getSetlist(listId)
        .then((list) => {
          if (!cancelled) setList(list?.songIds[index] === songId ? list : undefined);
        })
        .catch(() => {
          if (!cancelled) setError("Could not load setlist settings.");
        });
    };
    load();
    window.addEventListener(LIBRARY_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(LIBRARY_CHANGED_EVENT, load);
    };
  }, [listId, songId, index]);
  const transpose = async (value: number) => {
    if (!list || saving) return;
    setSaving(true);
    setError("");
    try {
      const latest = await getSetlist(list.id);
      if (!latest || latest.songIds[index] !== songId) throw new Error("Setlist changed");
      const settings = occurrenceSettings(latest);
      settings[index] = { ...settings[index], transpose: value };
      await updateSetlist(list.id, { songSettings: settings });
      setList({ ...latest, songSettings: settings });
    } catch {
      setError("Could not save setlist transpose. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return { list, setting: list?.songSettings?.[index], transpose, error };
}
