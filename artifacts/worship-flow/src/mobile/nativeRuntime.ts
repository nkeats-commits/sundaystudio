import { Capacitor } from "@capacitor/core";
import { shareTextFileWithPorts } from "./exportFiles";
import { requireHttpsOrigin, resolveApiRequestUrl } from "./urls";

const buildEnv = (import.meta as ImportMeta & {
  env?: { VITE_API_BASE_URL?: string; VITE_APP_URL?: string };
}).env;
export const mobileApiBaseUrl = buildEnv?.VITE_API_BASE_URL
  ? requireHttpsOrigin(buildEnv.VITE_API_BASE_URL, "VITE_API_BASE_URL")
  : "";
const configuredMobileAppUrl = buildEnv?.VITE_APP_URL
  ? requireHttpsOrigin(buildEnv.VITE_APP_URL, "VITE_APP_URL")
  : mobileApiBaseUrl;

if (Capacitor.isNativePlatform() && !mobileApiBaseUrl) {
  throw new Error(
    "Native builds require VITE_API_BASE_URL to point to the deployed HTTPS API.",
  );
}

export const nativeAppLinkHosts = configuredMobileAppUrl
  ? [new URL(configuredMobileAppUrl).hostname.toLowerCase()]
  : [];

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** Resolve API routes for the bundled app without changing normal web routing. */
export function apiUrl(path: string): string {
  return resolveApiRequestUrl(path, isNativeApp(), mobileApiBaseUrl);
}

export async function openExternalUrl(url: string): Promise<void> {
  const parsed = new URL(url, window.location.href);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only web links can be opened outside Sunday Studio.");
  }

  if (isNativeApp()) {
    if (parsed.protocol !== "https:") {
      throw new Error("Mobile links must use HTTPS.");
    }
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: parsed.href, toolbarColor: "#111b34" });
    return;
  }

  window.location.assign(parsed.href);
}

export async function shareTextFile(
  title: string,
  text: string,
  filename: string,
): Promise<void> {
  const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);

  await shareTextFileWithPorts(title, text, filename, {
    async writeTextFile(safeFilename, contents) {
      const saved = await Filesystem.writeFile({
        path: safeFilename,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      return saved.uri;
    },
    async shareFile(uri, shareTitle) {
      await Share.share({
        title: shareTitle,
        files: [uri],
        dialogTitle: shareTitle,
      });
    },
  });
}

export async function copyText(text: string): Promise<void> {
  if (isNativeApp()) {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text });
    return;
  }
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable.");
  }
  await navigator.clipboard.writeText(text);
}

let nativeBackDismissHandler: (() => boolean) | null = null;

export function setNativeBackDismissHandler(
  handler: (() => boolean) | null,
): void {
  nativeBackDismissHandler = handler;
}

export function dismissForNativeBack(): boolean {
  return nativeBackDismissHandler?.() ?? false;
}