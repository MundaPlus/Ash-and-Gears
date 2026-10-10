import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";

// Bind to 0.0.0.0 so PCs and phones on the LAN can open the game (spec 10, "Dev servers").
// BASE_PATH: the sub-path the game is served from, for example "/Ash-and-Gears/" on GitHub Pages (default "/").
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [preact()],
  server: { host: "0.0.0.0", port: 5173, strictPort: true },
  preview: { host: "0.0.0.0", port: 4173, strictPort: true },
  // Two pages: the game, and the "Salvage Print" style samples (next phase, S1).
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: fileURLToPath(new URL("index.html", import.meta.url)), samples: fileURLToPath(new URL("samples.html", import.meta.url)) } },
  },
});
