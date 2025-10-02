import { defineConfig } from "vite";
import os from "os";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

function findFirstExisting(paths) {
  return paths.find(p => {
    try { return p && fs.existsSync(p); } catch { return false; }
  });
}

function resolveChrome() {
  const platform = os.platform();

  if (platform === "win32") {
    // Try PATH first
    try {
      const fromWhere = execSync("where chrome", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .split(/\r?\n/)
        .map(s => s.trim())
        .find(Boolean);
      if (fromWhere && fs.existsSync(fromWhere)) return fromWhere;
    } catch {}

    const candidates = [
      process.env.CHROME_PATH,
      path.join(process.env["ProgramFiles"] || "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
    ].filter(Boolean);

    return findFirstExisting(candidates) || null;
  }

  if (platform === "darwin") {
    const candidates = [
      process.env.CHROME_PATH,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(process.env.HOME || "", "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    ].filter(Boolean);

    return findFirstExisting(candidates) || "Google Chrome"; // app name via 'open'
  }

  // Linux
  const names = [
    process.env.CHROME_PATH,
    "google-chrome",
    "google-chrome-stable",
    "chromium-browser",
    "chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
  ].filter(Boolean);

  for (const name of names) {
    try {
      const which = execSync(`which "${name}"`, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
      if (which) return which;
    } catch {}
  }
  return findFirstExisting(names) || null;
}

const chromePath = resolveChrome();

if (chromePath) {
  process.env.BROWSER = chromePath;
  console.log(`✅ Vite will open in: ${chromePath}`);
} else {
  delete process.env.BROWSER; // fallback to system default
  console.warn("⚠️ Chrome not found — falling back to system default browser.");
}

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    // 👇 Forward /api/* calls to your Express server running on 8787
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
