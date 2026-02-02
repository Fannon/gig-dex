import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initDB } from "./db";

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
