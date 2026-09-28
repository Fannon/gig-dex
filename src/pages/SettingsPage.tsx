import { useState } from "react";
import { CloudSync } from "../components/CloudSync";
import { ConflictReview } from "../components/ConflictReview";
import { DataManagement } from "../components/DataManagement";
import { PwaSettings } from "../components/PwaSettings";
import { syncManager } from "../sync";
import type { SyncStatus } from "../sync/types";
import { applyMinimumFontSize, minimumFontSizes, savedMinimumFontSize } from "../utils/readingFont";
import { applyReadingTheme, type ReadingTheme, savedReadingTheme } from "../utils/readingTheme";
import "./SettingsPage.scss";

export const SettingsPage = () => {
  const [minimumFontSize, setMinimumFontSize] = useState(savedMinimumFontSize);
  const [readingTheme, setReadingTheme] = useState(savedReadingTheme);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncManager.getStatus());

  return (
    <div className="settings-page">
      <main className="settings-page__content">
        <h1>Settings</h1>
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
          <p className="settings-page__hint">
            Smallest text used when fitting songs to this screen. Longer songs scroll when they cannot fit at this size.
          </p>
        </section>
        <DataManagement />

        <CloudSync onStatus={setSyncStatus} />
        <ConflictReview status={syncStatus} />
        <PwaSettings />

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
              A personal songbook and setlist manager for guitarists and musicians. Built with React, TypeScript, and
              IndexedDB for full offline support.
            </p>
            <div className="settings-page__about-links">
              <a href="https://www.chordpro.org/" target="_blank" rel="noopener noreferrer">
                Learn ChordPro Format
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
