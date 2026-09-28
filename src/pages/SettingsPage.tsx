import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CloudSync } from "../components/CloudSync";
import { ConflictReview } from "../components/ConflictReview";
import { DataManagement } from "../components/DataManagement";
import { PwaSettings } from "../components/PwaSettings";
import { SyncActivityLog } from "../components/SyncActivityLog";
import type { SyncStatus } from "../sync/types";
import { applyMinimumFontSize, minimumFontSizes, savedMinimumFontSize } from "../utils/readingFont";
import { applyReadingTheme, type ReadingTheme, savedReadingTheme } from "../utils/readingTheme";
import "./SettingsPage.scss";

export const SettingsPage = () => {
  const [minimumFontSize, setMinimumFontSize] = useState(savedMinimumFontSize);
  const [readingTheme, setReadingTheme] = useState(savedReadingTheme);
  const [searchParams, setSearchParams] = useSearchParams();
  const sections = ["appearance", "library", "sync", "offline", "about"] as const;
  type Section = (typeof sections)[number];
  const requested = searchParams.get("section");
  const active: Section = sections.find((section) => section === requested) ?? "appearance";
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ lastSyncTime: null, isSyncing: false, error: null });
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
              Smallest text used when fitting songs to this screen. Longer songs scroll when they cannot fit at this
              size.
            </p>
          </section>
        </div>
        <div hidden={active !== "library"}>
          <DataManagement />
        </div>
        <div hidden={active !== "sync"}>
          <div className="settings-page__sync-intro">
            <p>
              <strong>Choose how to sync.</strong> A folder on this computer is easiest if you already use a cloud
              folder. Direct Google Drive and OneDrive connections require you to register your own app and enter its
              Client ID.
            </p>
            <div className="settings-page__guide-links">
              <a
                href="https://github.com/Fannon/gig-dex/blob/main/docs/local-folder-sync.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Folder sync guide
              </a>
              <a
                href="https://github.com/Fannon/gig-dex/blob/main/docs/local-folder-sync.md#runtime-cloud-configuration"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Drive & OneDrive setup
              </a>
            </div>
          </div>
          <CloudSync onStatus={setSyncStatus} />
          <ConflictReview status={syncStatus} />
          <SyncActivityLog />
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
