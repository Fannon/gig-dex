import { useEffect, useState } from "react";
import {
  applyReadingPreferences,
  READING_PREFERENCES_EVENT,
  savedReadingPreferences,
} from "../utils/readingPreferences";

export function useReadingPreferences() {
  const [preferences, setPreferences] = useState(savedReadingPreferences);
  useEffect(() => {
    const refresh = () => setPreferences(savedReadingPreferences());
    window.addEventListener(READING_PREFERENCES_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(READING_PREFERENCES_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return [preferences, applyReadingPreferences] as const;
}
