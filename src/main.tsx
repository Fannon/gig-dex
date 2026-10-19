import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { savedReadingTheme } from "./utils/readingTheme";

document.documentElement.dataset.readingTheme = savedReadingTheme();

import { initDB } from "./db";
import { startLibraryEvents } from "./libraryEvents";
import { startPwa } from "./pwa/lifecycle";
import { startAutomaticSync } from "./sync/automaticSync";

startPwa();
const stopLibraryEvents = startLibraryEvents();
const stopAutomaticSync = startAutomaticSync();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    stopLibraryEvents();
    stopAutomaticSync();
  });

// Initialize the database on app start
initDB()
  .then(() => {
    console.log("Database initialized");
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
  });

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
