import assert from "node:assert/strict";
import test from "node:test";
import {
  getMe,
  setAuthTokenGetter,
} from "@workspace/api-client-react";

test("protected /api/me calls request a fresh Clerk bearer token every time", async () => {
  const originalFetch = globalThis.fetch;
  const seen: Array<{ url: string; authorization: string | null }> = [];
  let tokenNumber = 0;

  globalThis.fetch = (async (input, init) => {
    const headers = new Headers(init?.headers);
    seen.push({
      url: String(input),
      authorization: headers.get("authorization"),
    });
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  setAuthTokenGetter(async () => `fresh-session-token-${++tokenNumber}`);

  try {
    await getMe();
    await getMe();
  } finally {
    setAuthTokenGetter(null);
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(seen, [
    { url: "/api/me", authorization: "Bearer fresh-session-token-1" },
    { url: "/api/me", authorization: "Bearer fresh-session-token-2" },
  ]);
});