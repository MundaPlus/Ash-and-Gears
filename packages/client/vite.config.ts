import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// One id per build. The game polls version.json and reloads itself when a newer build is out (user request).
const BUILD_ID = String(Date.now());
// The version shown in the lower left: package version, commit, build date (UTC).
const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as { version: string };
const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
})();
const VERSION = `v${pkg.version} · ${commit} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;

// Bind to 0.0.0.0 so PCs and phones on the LAN can open the game (spec 10, "Dev servers").
// BASE_PATH: the sub-path the game is served from, for example "/Ash-and-Gears/" on GitHub Pages (default "/").
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __VERSION__: JSON.stringify(VERSION) },
  plugins: [
    preact(),
    {
      name: "build-id",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: BUILD_ID }) });
      },
    },
  ],
  server: { host: "0.0.0.0", port: 5173, strictPort: true },
  preview: { host: "0.0.0.0", port: 4173, strictPort: true },
  // Two pages: the game, and the "Salvage Print" style samples (next phase, S1).
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: fileURLToPath(new URL("index.html", import.meta.url)), samples: fileURLToPath(new URL("samples.html", import.meta.url)) } },
  },
});
