import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Bind to 0.0.0.0 so PCs and phones on the LAN can open the game (spec 10, "Dev servers").
// BASE_PATH: the sub-path the game is served from, for example "/Ash-and-Gears/" on GitHub Pages (default "/").
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [preact()],
  server: { host: "0.0.0.0", port: 5173, strictPort: true },
  preview: { host: "0.0.0.0", port: 4173, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
