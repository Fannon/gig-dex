import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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

function App() {
	return (
		<BrowserRouter basename={import.meta.env.BASE_URL}>
			<Suspense
				fallback={
					<div className="app-loading">
						<output>Loading…</output>
					</div>
				}
			>
				<Routes>
					<Route path="/" element={<HomePage />} />
					<Route path="/song/:id" element={<SongPage />} />
					<Route path="/setlists" element={<SetlistsPage />} />
					<Route path="/setlist/:id" element={<SetlistsPage />} />
					<Route path="/settings" element={<SettingsPage />} />
				</Routes>
			</Suspense>
		</BrowserRouter>
	);
}

export default App;
