import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { SetlistsPage } from "./pages/SetlistsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SongPage } from "./pages/SongPage";
import "./App.scss";

function App() {
	return (
		<BrowserRouter basename={import.meta.env.BASE_URL}>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/song/:id" element={<SongPage />} />
				<Route path="/setlists" element={<SetlistsPage />} />
				<Route path="/setlist/:id" element={<SetlistsPage />} />
				<Route path="/settings" element={<SettingsPage />} />
			</Routes>
		</BrowserRouter>
	);
}

export default App;
