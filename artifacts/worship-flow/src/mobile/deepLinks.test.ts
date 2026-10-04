import assert from "node:assert/strict";
import test from "node:test";
import { appUrlToPath } from "./deepLinks";
import { safeExportFilename, shareTextFileWithPorts } from "./exportFiles";
import { requireHttpsOrigin, resolveApiRequestUrl } from "./urls";

test("routes app-scheme and verified website links into the app", () => {
  assert.equal(
    appUrlToPath("sundaystudio://open/services/42?from=email#plan"),
    "/services/42?from=email#plan",
  );
  assert.equal(
    appUrlToPath("https://studio.example/settings/integrations?pcs=ok", [
      "studio.example",
    ]),
    "/settings/integrations?pcs=ok",
  );
  assert.equal(appUrlToPath("sundaystudio://auth/callback?__clerk_status=complete"), null);
  assert.equal(appUrlToPath("app.sundaystudio.app://callback?state=private"), null);
  assert.equal(
    appUrlToPath("clerk://app.sundaystudio.app.hosted-callback?created_session_id=sess_1"),
    null,
  );
});

test("does not route external, malformed, or API links into the app", () => {
  assert.equal(appUrlToPath("https://example.com/services/42", ["studio.example"]), null);
  assert.equal(appUrlToPath("javascript:alert(1)"), null);
  assert.equal(appUrlToPath("sundaystudio://open//example.com"), null);
  assert.equal(appUrlToPath("sundaystudio://open/api/users"), null);
  assert.equal(appUrlToPath("not a URL"), null);
});

test("resolves authenticated API calls to the remote origin only in native builds", () => {
  assert.equal(
    resolveApiRequestUrl("/api/services", true, "https://api.example"),
    "https://api.example/api/services",
  );
  assert.equal(
    resolveApiRequestUrl("/api/services", false, "https://api.example"),
    "/api/services",
  );
  assert.equal(
    resolveApiRequestUrl("https://files.example/upload", true, "https://api.example"),
    "https://files.example/upload",
  );
});

test("requires API and app URLs to be public HTTPS origins", () => {
  assert.equal(requireHttpsOrigin("https://studio.example/", "VITE_API_BASE_URL"), "https://studio.example");
  assert.throws(
    () => requireHttpsOrigin("http://studio.example", "VITE_API_BASE_URL"),
    /HTTPS origin/,
  );
  assert.throws(
    () => requireHttpsOrigin("https://studio.example/api", "VITE_API_BASE_URL"),
    /without a path/,
  );
});

test("sanitizes export filenames before writing a native share file", () => {
  assert.equal(safeExportFilename("../../Plan for Sunday?.md"), "Plan-for-Sunday-.md");
});

test("native export stops and reports a share failure instead of pretending it worked", async () => {
  let savedFilename = "";
  let attemptedShare = false;

  await assert.rejects(
    shareTextFileWithPorts("Service plan", "Order of service", "service.md", {
      async writeTextFile(filename) {
        savedFilename = filename;
        return "file:///cache/service.md";
      },
      async shareFile() {
        attemptedShare = true;
        throw new Error("Share sheet unavailable");
      },
    }),
    /Share sheet unavailable/,
  );

  assert.equal(savedFilename, "service.md");
  assert.equal(attemptedShare, true);
});

test("native export rejects an empty file URI", async () => {
  await assert.rejects(
    shareTextFileWithPorts("Service plan", "Text", "service.txt", {
      async writeTextFile() {
        return "";
      },
      async shareFile() {},
    }),
    /could not be created/,
  );
});