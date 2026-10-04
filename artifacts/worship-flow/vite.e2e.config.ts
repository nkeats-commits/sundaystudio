import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import appConfig from "./vite.config";

const here = path.dirname(fileURLToPath(import.meta.url));

// This alias is only used by the isolated E2E server. It exercises the real
// protected routes as a signed-in owner without adding a test auth path to the
// production app or replacing Clerk in the production Vite config.
export default mergeConfig(appConfig, {
  resolve: {
    alias: {
      ...(appConfig.resolve?.alias as Record<string, string>),
      "@clerk/react": path.join(here, "tests/e2e/fixtures/clerk-react.tsx"),
    },
  },
  server: {
    host: "127.0.0.1",
    strictPort: true,
  },
});