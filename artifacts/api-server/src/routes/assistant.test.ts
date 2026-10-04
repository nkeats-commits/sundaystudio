process.env.NODE_ENV = "test";

import assert from "node:assert/strict";
import test, { mock } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { clerkMiddleware } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import {
  type AiUsageEvent,
  aiUsageEventsTable,
  churchProfilesTable,
  conversations,
  db,
  messages,
  usersTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import assistantRouter from "./assistant";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(
    clerkMiddleware({
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    }),
  );
  app.use((req, _res, next) => {
    req.log = { error: () => undefined, warn: () => undefined } as never;
    next();
  });
  app.use("/api", assistantRouter);
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

function userId() {
  return `test-user-assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function seedUser(uid: string, profile = true) {
  const now = new Date();
  await db.insert(usersTable).values({
    id: uid,
    trialEnrollmentStatus: "enrolled",
    trialStartedAt: now,
    trialEndsAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
  });
  if (profile) {
    await db.insert(churchProfilesTable).values({
      userId: uid,
      churchName: "Grace Community",
      leaderName: "Pastor Jamie",
      denomination: "Presbyterian",
      theology: "Reformed and ecumenical",
      traditions: "Weekly communion",
      musicStyle: "Hymns and contemporary worship",
      toneDescription: "Warm and plainspoken",
      derivedToneDescription: "Uses short, thoughtful sentences",
      missionStatement: "Welcome our neighbors into the life of Christ",
      focusAreas: ["Discipleship", "Community care"],
    });
  }
}

async function cleanup(uid: string) {
  await db.delete(aiUsageEventsTable).where(eq(aiUsageEventsTable.userId, uid));
  await db.delete(churchProfilesTable).where(eq(churchProfilesTable.userId, uid));
  await db.delete(usersTable).where(eq(usersTable.id, uid));
}

function authHeaders(uid: string, extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-test-user-id": uid,
    ...extra,
  };
}

async function createConversation(base: string, uid: string) {
  const response = await fetch(`${base}/api/assistant/conversations`, {
    method: "POST",
    headers: authHeaders(uid),
  });
  assert.equal(response.status, 201);
  return (await response.json()) as { id: number; title: string };
}

function modelResponse(text: string) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 120, output_tokens: 40 },
  };
}

test("assistant requires authentication, a profile, and valid message content", async () => {
  const uid = userId();
  const noProfileUid = userId();
  await seedUser(uid);
  await seedUser(noProfileUid, false);
  const { base, close } = await startServer();

  try {
    const unauthenticated = await fetch(`${base}/api/assistant/conversations`);
    assert.equal(unauthenticated.status, 401);

    const conversation = await createConversation(base, noProfileUid);
    const noProfile = await fetch(
      `${base}/api/assistant/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: authHeaders(noProfileUid),
        body: JSON.stringify({ content: "Help me think through Sunday." }),
      },
    );
    assert.equal(noProfile.status, 409);
    assert.equal(
      ((await noProfile.json()) as { code: string }).code,
      "profile_required",
    );

    const ownConversation = await createConversation(base, uid);
    for (const content of ["", "   ", "x".repeat(8001)]) {
      const invalid = await fetch(
        `${base}/api/assistant/conversations/${ownConversation.id}/messages`,
        {
          method: "POST",
          headers: authHeaders(uid),
          body: JSON.stringify({ content }),
        },
      );
      assert.equal(invalid.status, 400);
    }
  } finally {
    await close();
    await cleanup(uid);
    await cleanup(noProfileUid);
  }
});

test("assistant conversation operations are isolated to their owner", async () => {
  const owner = userId();
  const other = userId();
  await seedUser(owner);
  await seedUser(other);
  const { base, close } = await startServer();

  try {
    const conversation = await createConversation(base, owner);
    const otherList = await fetch(`${base}/api/assistant/conversations`, {
      headers: authHeaders(other),
    });
    assert.deepEqual(await otherList.json(), []);

    const otherGet = await fetch(
      `${base}/api/assistant/conversations/${conversation.id}`,
      { headers: authHeaders(other) },
    );
    assert.equal(otherGet.status, 404);

    const otherSend = await fetch(
      `${base}/api/assistant/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: authHeaders(other),
        body: JSON.stringify({ content: "Can you help?" }),
      },
    );
    assert.equal(otherSend.status, 404);

    const otherDelete = await fetch(
      `${base}/api/assistant/conversations/${conversation.id}`,
      { method: "DELETE", headers: authHeaders(other) },
    );
    assert.equal(otherDelete.status, 404);

    const stillOwned = await fetch(
      `${base}/api/assistant/conversations/${conversation.id}`,
      { headers: authHeaders(owner) },
    );
    assert.equal(stillOwned.status, 200);
  } finally {
    await close();
    await cleanup(owner);
    await cleanup(other);
  }
});

test("assistant persists the user message on failure, retries it, and records AI usage", async () => {
  const uid = userId();
  await seedUser(uid);
  const { base, close } = await startServer();
  const calls: Array<Record<string, unknown>> = [];
  let shouldFail = true;
  const stub = mock.method(
    anthropic.messages,
    "create",
    async (args: Record<string, unknown>) => {
      calls.push(args);
      if (shouldFail) throw new Error("upstream unavailable");
      return modelResponse("Consider making room for quiet reflection.") as never;
    },
  );

  try {
    const conversation = await createConversation(base, uid);
    const url = `${base}/api/assistant/conversations/${conversation.id}/messages`;
    const request = () =>
      fetch(url, {
        method: "POST",
        headers: authHeaders(uid),
        body: JSON.stringify({ content: "How can we make worship more welcoming?" }),
      });

    const failure = await request();
    assert.equal(failure.status, 502);
    assert.equal(
      ((await failure.json()) as { code: string }).code,
      "generation_failed",
    );

    const savedAfterFailure = await fetch(
      `${base}/api/assistant/conversations/${conversation.id}`,
      { headers: authHeaders(uid) },
    );
    const failedHistory = (await savedAfterFailure.json()) as {
      messages: Array<{ id: number; role: string; content: string }>;
    };
    assert.equal(failedHistory.messages.length, 1);
    assert.equal(failedHistory.messages[0]?.role, "user");
    assert.equal(
      failedHistory.messages[0]?.content,
      "How can we make worship more welcoming?",
    );

    shouldFail = false;
    const retry = await request();
    assert.equal(retry.status, 200);
    const exchange = (await retry.json()) as {
      userMessage: { id: number };
      assistantMessage: { role: string; content: string };
    };
    assert.equal(exchange.userMessage.id, failedHistory.messages[0]?.id);
    assert.equal(exchange.assistantMessage.role, "assistant");
    assert.match(exchange.assistantMessage.content, /quiet reflection/);

    const historyResponse = await fetch(
      `${base}/api/assistant/conversations/${conversation.id}`,
      { headers: authHeaders(uid) },
    );
    const history = (await historyResponse.json()) as {
      messages: Array<{ role: string }>;
    };
    assert.deepEqual(
      history.messages.map((message) => message.role),
      ["user", "assistant"],
    );

    const prompt = calls[1] as {
      system: string;
      messages: Array<{ role: string; content: string }>;
    };
    assert.match(prompt.system, /Grace Community/);
    assert.match(prompt.system, /Weekly communion/);
    assert.match(prompt.system, /Welcome our neighbors/);
    assert.match(prompt.system, /short, thoughtful sentences/);
    assert.match(prompt.system, /not God, a prophet/);
    assert.equal(prompt.messages.at(-1)?.role, "user");
    assert.equal(
      prompt.messages.at(-1)?.content,
      "How can we make worship more welcoming?",
    );

    let usage: AiUsageEvent[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      usage = await db
        .select()
        .from(aiUsageEventsTable)
        .where(
          and(
            eq(aiUsageEventsTable.userId, uid),
            eq(aiUsageEventsTable.generationType, "pastoral-assistant"),
          ),
        );
      if (usage.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(usage.length, 1);
    assert.equal(usage[0]?.inputTokens, 120);
    assert.equal(usage[0]?.outputTokens, 40);
  } finally {
    stub.mock.restore();
    await close();
    await cleanup(uid);
  }
});

test("deleting a conversation removes its messages", async () => {
  const uid = userId();
  await seedUser(uid);
  const { base, close } = await startServer();
  try {
    const conversation = await createConversation(base, uid);
    await db.insert(messages).values({
      conversationId: conversation.id,
      role: "user",
      content: "A message to remove with its conversation.",
    });
    const deleted = await fetch(
      `${base}/api/assistant/conversations/${conversation.id}`,
      { method: "DELETE", headers: authHeaders(uid) },
    );
    assert.equal(deleted.status, 204);
    const remainingMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    assert.deepEqual(remainingMessages, []);
  } finally {
    await close();
    await cleanup(uid);
  }
});