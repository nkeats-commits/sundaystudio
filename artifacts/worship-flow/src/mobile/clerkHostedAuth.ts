import type { useClerk } from "@clerk/react";

export type HostedAuthMode = "sign-in" | "sign-up";
export type ClerkReactInstance = ReturnType<typeof useClerk>;
type ClerkClient = NonNullable<ClerkReactInstance["client"]>;
type HostedAuthClientJSON = {
  object: "client";
  sessions: Array<{ id: string }>;
};

export const CLERK_IOS_HOSTED_AUTH_REDIRECT =
  "app.sundaystudio.app://callback";
export const CLERK_ANDROID_HOSTED_AUTH_REDIRECT =
  "clerk://app.sundaystudio.app.hosted-callback";

type HostedAuthRequest = {
  method: "POST";
  path: "/client/hosted_auth" | "/client";
  body: Record<string, string>;
};

type HostedAuthResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: Headers;
  payload: {
    response?: { object?: string; url?: string } | HostedAuthClientJSON;
    errors?: Array<{ code?: string; long_message?: string }>;
  } | null;
};

type HostedAuthClerkInstance = {
  getFapiClient: () => {
    request: (request: HostedAuthRequest) => Promise<HostedAuthResponse>;
  };
  handleUnauthenticated?: () => Promise<unknown>;
};

export type HostedAuthBrowserResult =
  | { type: "success"; url: string }
  | { type: "cancel" };

export type HostedAuthPorts = {
  openAuthSession: (
    authUrl: string,
    redirectUrl: string,
  ) => Promise<HostedAuthBrowserResult>;
  randomBytes?: (length: number) => Uint8Array;
  digest?: (data: BufferSource) => Promise<ArrayBuffer>;
};

const nativeClientAccessors = new WeakMap<
  ClerkReactInstance,
  HostedAuthClerkInstance
>();

/**
 * Clerk React wraps the browser ClerkJS instance. Its native hosted-auth flow
 * needs the same ClerkJS FAPI client used by the React provider, so keep that
 * narrow runtime bridge here and fail clearly if Clerk changes the wrapper.
 */
function getHostedAuthClerk(clerk: ClerkReactInstance): HostedAuthClerkInstance {
  const cached = nativeClientAccessors.get(clerk);
  if (cached) return cached;

  const wrapped = clerk as ClerkReactInstance & {
    getFapiClient?: HostedAuthClerkInstance["getFapiClient"];
    clerkjs?: HostedAuthClerkInstance;
  };
  const instance: HostedAuthClerkInstance | undefined =
    typeof wrapped.getFapiClient === "function"
      ? (wrapped as HostedAuthClerkInstance)
      : wrapped.clerkjs;

  if (typeof instance?.getFapiClient !== "function") {
    throw new Error(
      "This Clerk React version does not expose the FAPI client needed for hosted authentication.",
    );
  }

  nativeClientAccessors.set(clerk, instance);
  return instance;
}

export function nativeHostedAuthRedirect(
  platform: "ios" | "android",
): string {
  return platform === "ios"
    ? CLERK_IOS_HOSTED_AUTH_REDIRECT
    : CLERK_ANDROID_HOSTED_AUTH_REDIRECT;
}

export function hostedAuthCallbackMatches(
  callbackUrl: string,
  redirectUrl: string,
): boolean {
  try {
    const callback = new URL(callbackUrl);
    const redirect = new URL(redirectUrl);
    return (
      callback.protocol === redirect.protocol &&
      callback.host === redirect.host &&
      callback.pathname === redirect.pathname
    );
  } catch {
    return false;
  }
}

export async function createHostedAuthPKCE(
  ports: Pick<HostedAuthPorts, "randomBytes" | "digest"> = {},
): Promise<{ state: string; codeVerifier: string; codeChallenge: string }> {
  const randomBytes =
    ports.randomBytes ?? ((length) => crypto.getRandomValues(new Uint8Array(length)));
  const digest =
    ports.digest ??
    ((data) => crypto.subtle.digest("SHA-256", data));
  const state = bytesToHex(randomBytes(32));
  const codeVerifier = bytesToHex(randomBytes(32));
  const challengeDigest = await digest(new TextEncoder().encode(codeVerifier));
  const codeChallenge = bytesToBase64Url(new Uint8Array(challengeDigest));
  return { state, codeVerifier, codeChallenge };
}

export async function startClerkHostedAuth(
  clerk: ClerkReactInstance,
  params: {
    redirectUrl: string;
    mode: HostedAuthMode;
  },
  ports: HostedAuthPorts,
): Promise<{ createdSessionId: string | null }> {
  if (!clerk.loaded || !clerk.client) {
    throw new Error("Clerk must be loaded before starting hosted authentication.");
  }
  if (!isCustomSchemeUrl(params.redirectUrl)) {
    throw new Error("Clerk hosted authentication requires an app callback URL.");
  }

  const hostedAuthClerk = getHostedAuthClerk(clerk);
  const pkce = await createHostedAuthPKCE(ports);
  const createParams = {
    redirectUrl: params.redirectUrl,
    codeChallenge: pkce.codeChallenge,
    mode: params.mode,
    state: pkce.state,
  };

  const createRequest = () =>
    hostedAuthClerk.getFapiClient().request({
      method: "POST",
      path: "/client/hosted_auth",
      body: createParams,
    });

  let createResponse = await createRequest();
  if (
    !createResponse.ok &&
    createResponse.status === 401 &&
    createResponse.payload?.errors?.some((error) => error.code === "signed_out")
  ) {
    createResponse = await createRequest();
  }
  if (!createResponse.ok) {
    throw hostedAuthError(createResponse);
  }

  const hostedAuth = createResponse.payload?.response;
  if (
    !hostedAuth ||
    hostedAuth.object !== "hosted_auth" ||
    typeof hostedAuth.url !== "string"
  ) {
    throw new Error("Clerk returned an invalid hosted-auth request.");
  }

  const browserResult = await ports.openAuthSession(
    hostedAuth.url,
    params.redirectUrl,
  );
  if (browserResult.type !== "success") {
    return { createdSessionId: null };
  }
  if (!hostedAuthCallbackMatches(browserResult.url, params.redirectUrl)) {
    throw new Error("The Clerk callback did not match the app that started sign-in.");
  }

  const callback = new URL(browserResult.url);
  if (callback.searchParams.get("state") !== pkce.state) {
    throw new Error("The Clerk callback state did not match the sign-in request.");
  }

  const rotatingTokenNonce = callback.searchParams.get("rotating_token_nonce");
  const createdSessionId = callback.searchParams.get("created_session_id");
  if (!rotatingTokenNonce || !createdSessionId) {
    throw new Error("The Clerk callback did not include a completed session.");
  }

  const completionResponse = await hostedAuthClerk.getFapiClient().request({
    method: "POST",
    path: "/client",
    body: {
      _method: "GET",
      rotatingTokenNonce,
      codeVerifier: pkce.codeVerifier,
    },
  });
  if (!completionResponse.ok) {
    if (completionResponse.status === 401) {
      await hostedAuthClerk.handleUnauthenticated?.();
    }
    throw hostedAuthError(completionResponse);
  }

  const clientJSON = completionResponse.payload?.response as
    | HostedAuthClientJSON
    | undefined;
  if (!clientJSON || clientJSON.object !== "client") {
    throw new Error("Clerk did not return the completed client session.");
  }

  applyHostedAuthClientJSON(clerk.client, clientJSON);
  if (!clientJSON.sessions.some((session) => session.id === createdSessionId)) {
    throw new Error("The Clerk response did not contain the created session.");
  }

  await clerk.setActive({ session: createdSessionId });
  return { createdSessionId };
}

export function applyHostedAuthClientJSON(
  client: ClerkClient,
  clientJSON: HostedAuthClientJSON,
): ClerkClient {
  const mutableClient = client as ClerkClient & {
    fromJSON?: (data: HostedAuthClientJSON) => ClerkClient;
  };
  if (typeof mutableClient.fromJSON !== "function") {
    throw new Error("Clerk could not update the active client after sign-in.");
  }
  return mutableClient.fromJSON(clientJSON);
}

function hostedAuthError(response: HostedAuthResponse): Error {
  return new Error(
    response.payload?.errors?.[0]?.long_message ||
      response.statusText ||
      "Clerk hosted authentication failed.",
  );
}

function isCustomSchemeUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol !== "http:" && protocol !== "https:";
  } catch {
    return false;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}