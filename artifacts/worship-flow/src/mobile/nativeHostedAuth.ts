import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import {
  hostedAuthCallbackMatches,
  type HostedAuthBrowserResult,
} from "./clerkHostedAuth";

const AUTH_SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const CANCEL_SETTLE_DELAY_MS = 700;

/**
 * Open Clerk Account Portal in the native browser and wait for its app-scheme
 * return. Callback URLs are consumed here and never become app routes.
 */
export async function openClerkHostedAuthInBrowser(
  authUrl: string,
  redirectUrl: string,
): Promise<HostedAuthBrowserResult> {
  const parsedAuthUrl = new URL(authUrl);
  if (parsedAuthUrl.protocol !== "https:") {
    throw new Error("Clerk returned a non-HTTPS hosted-auth URL.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const listenerHandles: PluginListenerHandle[] = [];

    const cleanup = () => {
      if (cancellationTimer) clearTimeout(cancellationTimer);
      if (timeout) clearTimeout(timeout);
      listenerHandles.forEach((handle) => void handle.remove());
    };

    const finish = (result: HostedAuthBrowserResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (result.type === "success") {
        void Browser.close().catch(() => {
          // The platform may already have dismissed its browser surface.
        });
      }
      resolve(result);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    void (async () => {
      try {
        listenerHandles.push(
          await App.addListener("appUrlOpen", ({ url }) => {
            if (hostedAuthCallbackMatches(url, redirectUrl)) {
              finish({ type: "success", url });
            }
          }),
        );
        listenerHandles.push(
          await Browser.addListener("browserFinished", () => {
            if (cancellationTimer) clearTimeout(cancellationTimer);
            cancellationTimer = setTimeout(
              () => finish({ type: "cancel" }),
              CANCEL_SETTLE_DELAY_MS,
            );
          }),
        );
        timeout = setTimeout(
          () => finish({ type: "cancel" }),
          AUTH_SESSION_TIMEOUT_MS,
        );
        await Browser.open({
          url: parsedAuthUrl.href,
          toolbarColor: "#111b34",
        });
      } catch (error) {
        fail(error);
      }
    })();
  });
}