import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CloudSync } from "../components/CloudSync";
import { DataManagement } from "../components/DataManagement";
import { PwaSettings } from "../components/PwaSettings";
import { useReadingPreferences } from "../hooks/useReadingPreferences";
import { applyMinimumFontSize, minimumFontSizes, savedMinimumFontSize } from "../utils/readingFont";
import { columnLimits } from "../utils/readingPreferences";
import { applyReadingTheme, type ReadingTheme, savedReadingTheme } from "../utils/readingTheme";
import "./SettingsPage.scss";

export const SettingsPage = () => {
  const [minimumFontSize, setMinimumFontSize] = useState(savedMinimumFontSize);
  const [readingTheme, setReadingTheme] = useState(savedReadingTheme);
  const [reading, setReading] = useReadingPreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const sections = ["appearance", "library", "sync", "offline", "about"] as const;
  type Section = (typeof sections)[number];
  const requested = searchParams.get("section");
  const active: Section = sections.find((section) => section === requested) ?? "appearance";
  const select = (section: Section) => {
    setSearchParams(section === "appearance" ? {} : { section });
  };

  return (
    <div className="settings-page">
      <main className="settings-page__content">
        <h1>Settings</h1>
        <nav className="settings-page__tabs" aria-label="Settings sections">
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              aria-current={active === section ? "page" : undefined}
              onClick={() => select(section)}
            >
              {section[0].toUpperCase() + section.slice(1)}
            </button>
          ))}
        </nav>
        <div hidden={active !== "appearance"}>
          <section className="settings-page__section settings-page__appearance">
            <h2>Appearance</h2>
            <label>
              Theme{" "}
              <select
                aria-label="Theme"
                value={readingTheme}
                onChange={(event) => {
                  const theme = event.target.value as ReadingTheme;
                  setReadingTheme(theme);
                  applyReadingTheme(theme);
                }}
              >
                <option value="violet">Dark violet</option>
                <option value="black">Pure black</option>
                <option value="light">Light</option>
              </select>
            </label>
          </section>
          <section className="settings-page__section settings-page__appearance">
            <h2>Song reading</h2>
            <label>
              Notation
              <select
                aria-label="Notation"
                value={reading.chordMode}
                onChange={(event) =>
                  setReading({ ...reading, chordMode: event.target.value as typeof reading.chordMode })
                }
              >
                <option value="standard">Standard (C, Am)</option>
                <option value="german">German (H = B, B = Bb)</option>
                <option value="nashville">Nashville (1–7)</option>
                <option value="roman">Roman (I–VII)</option>
              </select>
            </label>
            <label>
              Minimum font
              <select
                aria-label="Minimum font"
                value={minimumFontSize}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setMinimumFontSize(value);
                  applyMinimumFontSize(value);
                }}
              >
                {minimumFontSizes.map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </label>
            <label>
              Columns
              <select
                aria-label="Columns"
                value={reading.maxColumns}
                onChange={(event) => setReading({ ...reading, maxColumns: Number(event.target.value) })}
              >
                {columnLimits.map((limit) => (
                  <option key={limit} value={limit}>
                    {limit === 0 ? "Automatic" : limit === 1 ? "Single column" : `Up to ${limit} columns`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Wrap lines
              <input
                type="checkbox"
                checked={reading.wrapLines}
                onChange={(event) => setReading({ ...reading, wrapLines: event.target.checked })}
              />
            </label>
            <p className="settings-page__hint">
              Applies to all songs on this device, including setlist previews and performance. German changes how
              standard chords are shown. Number notation needs a song key. Auto-fit uses up to your column limit without
              going below the minimum font. Songs that cannot fit scroll in one column; wrapping keeps wide lyrics
              readable.
            </p>
          </section>
        </div>
        <div hidden={active !== "library"}>
          <DataManagement />
        </div>
        <div hidden={active !== "sync"}>
          <div className="settings-page__sync-intro">
            <p>
              Manage connected providers under Active syncs. Recent activity shows changes and errors; setup guides are
              beside the settings they explain. Connect another provider under Add sync provider.
            </p>
            <p>
              Connected Dropbox, OneDrive, and folder sync check for changes when Gig-Dex opens and after library edits.
              Use Sync now for an immediate check.
            </p>
          </div>
          <CloudSync />
        </div>
        <div hidden={active !== "offline"}>
          <PwaSettings />
        </div>
        <div hidden={active !== "about"}>
          <section className="settings-page__section">
            <h2>About</h2>
            <div className="settings-page__about">
              <div className="settings-page__about-brand">
                <img src={`${import.meta.env.BASE_URL}pwa-192x192.png`} alt="Gig-Dex" />
                <div>
                  <h3>Gig-Dex</h3>
                  <p>Version 0.1.0</p>
                </div>
              </div>
              <p className="settings-page__about-description">
                A personal songbook and setlist manager for musicians. Your library stays available on this device, even
                offline.
              </p>
              <div className="settings-page__about-links">
                <a href="https://www.chordpro.org/" target="_blank" rel="noopener noreferrer">
                  Learn ChordPro Format
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
