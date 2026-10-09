import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Bind to 0.0.0.0 so PCs and phones on the LAN can open the game (spec 10, "Dev servers").
export default defineConfig({
  plugins: [preact()],
  server: { host: "0.0.0.0", port: 5173, strictPort: true },
  preview: { host: "0.0.0.0", port: 4173, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
