import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import "./App.scss";

const SongPage = lazy(() =>
	import("./pages/SongPage").then((module) => ({ default: module.SongPage })),
);
const SetlistsPage = lazy(() =>
	import("./pages/SetlistsPage").then((module) => ({ default: module.SetlistsPage })),
);
const SettingsPage = lazy(() =>
	import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);

const PerformancePage = lazy(() =>
	import("./pages/PerformancePage").then((module) => ({ default: module.PerformancePage })),
);
const router = createBrowserRouter(
	[
		{
			element: (
				<Suspense
					fallback={
						<div className="app-loading">
							<output>Loading…</output>
						</div>
					}
				>
					<Outlet />
				</Suspense>
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
	return <RouterProvider router={router} />;
}

export default App;
