import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppDialogs } from "./components/AppDialogs";
import { LibraryWorkspace } from "./components/LibraryWorkspace";
import { PwaRecovery } from "./components/PwaRecovery";
import { HomePage } from "./pages/HomePage";
import "./App.scss";

const SongPage = lazy(() => import("./pages/SongPage").then((module) => ({ default: module.SongPage })));
const SetlistsPage = lazy(() => import("./pages/SetlistsPage").then((module) => ({ default: module.SetlistsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

const PerformancePage = lazy(() =>
  import("./pages/PerformancePage").then((module) => ({ default: module.PerformancePage })),
);
const PrintPage = lazy(() => import("./pages/PrintPage").then((module) => ({ default: module.PrintPage })));
const printElement = (
  <Suspense
    fallback={
      <div className="app-loading">
        <output>Loading…</output>
      </div>
    }
  >
    <PrintPage />
  </Suspense>
);
const router = createBrowserRouter(
  [
    // Print views render outside the workspace so only the paper reaches the printer.
    { path: "/print/song/:id", element: printElement, errorElement: <PwaRecovery /> },
    { path: "/print/setlist/:listId", element: printElement, errorElement: <PwaRecovery /> },
    {
      errorElement: <PwaRecovery />,
      element: (
        <div className="app-shell">
          <div className="app-workspace">
            <LibraryWorkspace />
          </div>
        </div>
      ),
      children: [
        { path: "/", element: <HomePage /> },
        { path: "/song/:id", element: <SongPage /> },
        { path: "/setlists", element: <SetlistsPage /> },
        { path: "/setlist/:id", element: <SetlistsPage /> },
        { path: "/settings", element: <SettingsPage /> },
        { path: "/perform/song/:id", element: <PerformancePage /> },
        { path: "/perform/setlist/:listId", element: <PerformancePage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <AppDialogs />
    </>
  );
}

export default App;
