export const minimumFontSizes = [12, 14, 16, 18, 20, 24, 28, 32];
export const maximumFontSizes = [24, 28, 32, 36, 42, 48, 56, 64, 72];
export const DEFAULT_MAXIMUM_FONT_SIZE = 36;
/** Largest manual size from the font buttons; also covers the biggest automatic maximum. */
export const MANUAL_FONT_LIMIT = 72;

export function savedMinimumFontSize() {
  try {
    const value = Number(localStorage.getItem("song_minimum_font"));
    return minimumFontSizes.includes(value) ? value : 12;
  } catch {
    return 12;
  }
}
export function applyMinimumFontSize(value: number) {
  if (!minimumFontSizes.includes(value)) return;
  try {
    localStorage.setItem("song_minimum_font", String(value));
  } catch {
    /* Optional device preference. */
  }
  window.dispatchEvent(new Event("reading-font-changed"));
}

/** Largest size automatic fitting starts from. */
export function savedMaximumFontSize() {
  try {
    const value = Number(localStorage.getItem("song_maximum_font"));
    return maximumFontSizes.includes(value) ? value : DEFAULT_MAXIMUM_FONT_SIZE;
  } catch {
    return DEFAULT_MAXIMUM_FONT_SIZE;
  }
}
export function applyMaximumFontSize(value: number) {
  if (!maximumFontSizes.includes(value)) return;
  try {
    localStorage.setItem("song_maximum_font", String(value));
  } catch {
    /* Optional device preference. */
  }
  window.dispatchEvent(new Event("reading-font-changed"));
}
