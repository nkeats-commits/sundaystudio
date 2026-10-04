import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rawApiBaseUrl = (process.env.VITE_API_BASE_URL || "").trim();
if (!rawApiBaseUrl) {
  throw new Error(
    "Set VITE_API_BASE_URL to the app's public HTTPS API origin before building the mobile shell.",
  );
}

let parsedApiUrl;
try {
  parsedApiUrl = new URL(rawApiBaseUrl);
} catch {
  throw new Error("VITE_API_BASE_URL must be an absolute HTTPS origin.");
}

if (
  parsedApiUrl.protocol !== "https:" ||
  parsedApiUrl.username ||
  parsedApiUrl.password ||
  parsedApiUrl.pathname !== "/" ||
  parsedApiUrl.search ||
  parsedApiUrl.hash
) {
  throw new Error(
    "VITE_API_BASE_URL must be an HTTPS origin without a path, query, or credentials.",
  );
}
const apiBaseUrl = parsedApiUrl.origin;

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(
  "pnpm",
  ["exec", "vite", "build", "--config", "vite.config.ts"],
  {
    cwd: packageDirectory,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: process.env.PORT || "23590",
      BASE_PATH: "/",
      VITE_API_BASE_URL: apiBaseUrl,
    },
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);