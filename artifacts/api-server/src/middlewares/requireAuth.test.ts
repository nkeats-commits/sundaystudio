process.env.NODE_ENV = "production";

import assert from "node:assert/strict";
import { mock, test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";

let auth: { userId: string; sessionClaims: Record<string, unknown> } | null = {
  userId: "clerk-user",
  sessionClaims: { email: "pastor@example.org" },
};
let insertError: Error | null = null;

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => auth,
  },
});

mock.module("@workspace/db", {
  namedExports: {
    db: {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (insertError) throw insertError;
              return [{ id: "clerk-user", email: null, firstName: null }];
            },
          }),
        }),
      }),
    },
    usersTable: {
      id: "id",
      email: "email",
      firstName: "first_name",
      lastName: "last_name",
      imageUrl: "image_url",
    },
  },
});

const { requireAuth } = await import("./requireAuth");

function makeApp() {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { log: { error: () => undefined } });
    next();
  });
  app.get("/private", requireAuth, (req, res) => {
    res.json({ userId: req.userId });
  });
  return app;
}

async function startServer() {
  const server = makeApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("requireAuth allows a verified Clerk account after its user row is persisted", async () => {
  auth = { userId: "clerk-user", sessionClaims: { email: "pastor@example.org" } };
  insertError = null;
  const { base, close } = await startServer();
  try {
    const response = await fetch(`${base}/private`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { userId: "clerk-user" });
  } finally {
    await close();
  }
});

test("requireAuth stops the request when the account upsert fails", async () => {
  auth = { userId: "clerk-user", sessionClaims: {} };
  insertError = new Error("database schema is unavailable");
  const { base, close } = await startServer();
  try {
    const response = await fetch(`${base}/private`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "Unable to verify account. Please retry.",
    });
  } finally {
    insertError = null;
    await close();
  }
});

test("requireAuth rejects requests without a Clerk identity", async () => {
  auth = null;
  insertError = null;
  const { base, close } = await startServer();
  try {
    const response = await fetch(`${base}/private`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    auth = { userId: "clerk-user", sessionClaims: {} };
    await close();
  }
});