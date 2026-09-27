import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
	base,
	server: {
		watch: { ignored: ["**/reports/**", "**/tmp/**", "**/coverage/**"] },
	},
	plugins: [
		react(),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png"],
			manifest: {
				name: "Gig-Dex - Song & Setlist Manager",
				short_name: "Gig-Dex",
				description: "Personal songbook and setlist manager for musicians",
				theme_color: "#4F46E5",
				background_color: "#0f0f23",
				display: "standalone",
				orientation: "portrait",
				scope: base,
				start_url: base,
				icons: [
					{
						src: "pwa-192x192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any maskable",
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
			},
		}),
	],
});
