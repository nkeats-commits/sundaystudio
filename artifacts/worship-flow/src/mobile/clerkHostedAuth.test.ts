import assert from "node:assert/strict";
import test from "node:test";
import {
  CLERK_ANDROID_HOSTED_AUTH_REDIRECT,
  CLERK_IOS_HOSTED_AUTH_REDIRECT,
  hostedAuthCallbackMatches,
  nativeHostedAuthRedirect,
  startClerkHostedAuth,
  type ClerkReactInstance,
} from "./clerkHostedAuth";

test("uses Clerk's registered platform callback formats", () => {
  assert.equal(nativeHostedAuthRedirect("ios"), CLERK_IOS_HOSTED_AUTH_REDIRECT);
  assert.equal(
    nativeHostedAuthRedirect("android"),
    CLERK_ANDROID_HOSTED_AUTH_REDIRECT,
  );
  assert.equal(
    hostedAuthCallbackMatches(
      `${CLERK_ANDROID_HOSTED_AUTH_REDIRECT}?state=ok`,
      CLERK_ANDROID_HOSTED_AUTH_REDIRECT,
    ),
    true,
  );
  assert.equal(
    hostedAuthCallbackMatches(
      "clerk://attacker.hosted-callback?state=ok",
      CLERK_ANDROID_HOSTED_AUTH_REDIRECT,
    ),
    false,
  );
  assert.equal(
    hostedAuthCallbackMatches(
      "https://app.example/callback",
      CLERK_IOS_HOSTED_AUTH_REDIRECT,
    ),
    false,
  );
});

test("redeems Clerk hosted auth and activates its session in the React client", async () => {
  const requests: Array<{
    path: string;
    body: Record<string, string>;
  }> = [];
  const clientJSON = {
    object: "client",
    sessions: [{ id: "sess_hosted" }],
  } as const;
  let appliedClientJSON: typeof clientJSON | undefined;
  let activatedSession: string | undefined;
  let randomSeed = 0;

  const rawClerk = {
    getFapiClient: () => ({
      async request(request: { path: string; body: Record<string, string> }) {
        requests.push(request);
        if (request.path === "/client/hosted_auth") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            payload: {
              response: {
                object: "hosted_auth",
                url: "https://accounts.example/sign-in",
              },
            },
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          payload: { response: clientJSON },
        };
      },
    }),
  };

  const client = {
    fromJSON(data: typeof clientJSON) {
      appliedClientJSON = data;
      return client;
    },
  } as never;

  const clerk = {
    loaded: true,
    client,
    clerkjs: rawClerk,
    async setActive({ session }: { session: string }) {
      activatedSession = session;
    },
  } as unknown as ClerkReactInstance & {
    clerkjs: typeof rawClerk;
  };

  const result = await startClerkHostedAuth(
    clerk,
    {
      redirectUrl: CLERK_IOS_HOSTED_AUTH_REDIRECT,
      mode: "sign-in",
    },
    {
      randomBytes(length) {
        randomSeed += 1;
        return new Uint8Array(length).fill(randomSeed);
      },
      async digest() {
        return new Uint8Array(32).fill(9).buffer;
      },
      async openAuthSession(authUrl, redirectUrl) {
        assert.equal(authUrl, "https://accounts.example/sign-in");
        const state = requests[0]?.body.state;
        assert.ok(state);
        return {
          type: "success",
          url: `${redirectUrl}?state=${state}&rotating_token_nonce=nonce_once&created_session_id=sess_hosted`,
        };
      },
    },
  );

  assert.deepEqual(result, { createdSessionId: "sess_hosted" });
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.path, "/client/hosted_auth");
  assert.equal(requests[0]?.body.mode, "sign-in");
  assert.equal(requests[0]?.body.codeChallenge?.length, 43);
  assert.equal("codeVerifier" in requests[0]!.body, false);
  assert.equal(requests[1]?.path, "/client");
  assert.equal(requests[1]?.body._method, "GET");
  assert.equal(requests[1]?.body.rotatingTokenNonce, "nonce_once");
  assert.equal(requests[1]?.body.codeVerifier, "02".repeat(32));
  assert.equal(appliedClientJSON, clientJSON);
  assert.equal(activatedSession, "sess_hosted");
});

test("does not activate a session when the browser flow is cancelled", async () => {
  let activated = false;
  const rawClerk = {
    getFapiClient: () => ({
      async request() {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          payload: {
            response: {
              object: "hosted_auth",
              url: "https://accounts.example/sign-in",
            },
          },
        };
      },
    }),
  };
  const clerk = {
    loaded: true,
    client: {} as NonNullable<ClerkReactInstance["client"]>,
    clerkjs: rawClerk,
    async setActive() {
      activated = true;
    },
  } as unknown as ClerkReactInstance;

  const result = await startClerkHostedAuth(
    clerk,
    {
      redirectUrl: CLERK_ANDROID_HOSTED_AUTH_REDIRECT,
      mode: "sign-up",
    },
    {
      randomBytes: (length) => new Uint8Array(length).fill(1),
      digest: async () => new Uint8Array(32).fill(2).buffer,
      async openAuthSession() {
        return { type: "cancel" };
      },
    },
  );

  assert.deepEqual(result, { createdSessionId: null });
  assert.equal(activated, false);
});