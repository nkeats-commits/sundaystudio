import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { App as CapacitorApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { appUrlToPath } from "./deepLinks";
import {
  dismissForNativeBack,
  isNativeApp,
  nativeAppLinkHosts,
  openExternalUrl,
} from "./nativeRuntime";

function isDialogOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"][data-state="open"]'));
}

export function NativeAppBridge() {
  const [location, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const stateRef = useRef({ location, isSignedIn, setLocation });

  useEffect(() => {
    stateRef.current = { location, isSignedIn, setLocation };
  }, [location, isSignedIn, setLocation]);

  useEffect(() => {
    if (!isNativeApp()) return;

    let disposed = false;
    const handles: PluginListenerHandle[] = [];
    const keepHandle = async (pending: Promise<PluginListenerHandle>) => {
      try {
        const handle = await pending;
        if (disposed) void handle.remove();
        else handles.push(handle);
      } catch (error) {
        console.warn("Could not subscribe to a native app event.", error);
      }
    };

    const navigateAppUrl = (url: string) => {
      const path = appUrlToPath(url, nativeAppLinkHosts);
      if (path) stateRef.current.setLocation(path);
    };

    void CapacitorApp.getLaunchUrl()
      .then((launch) => {
        if (launch?.url && !disposed) navigateAppUrl(launch.url);
      })
      .catch((error) => console.warn("Could not read the app launch URL.", error));

    void keepHandle(
      CapacitorApp.addListener("appUrlOpen", ({ url }) => navigateAppUrl(url)),
    );
    void keepHandle(
      CapacitorApp.addListener("backButton", () => {
        if (dismissForNativeBack()) return;
        if (isDialogOpen()) {
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Escape",
              bubbles: true,
              cancelable: true,
            }),
          );
          return;
        }

        const current = stateRef.current;
        if (window.history.length > 1) {
          window.history.back();
        } else if (current.location !== "/dashboard") {
          current.setLocation(current.isSignedIn ? "/dashboard" : "/");
        } else {
          void CapacitorApp.exitApp();
        }
      }),
    );
    void keepHandle(
      CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          void queryClient.invalidateQueries({ refetchType: "active" });
        }
      }),
    );
    void import("@capacitor/browser")
      .then(({ Browser }) =>
        keepHandle(
          Browser.addListener("browserFinished", () => {
            void queryClient.invalidateQueries({ refetchType: "active" });
          }),
        ),
      )
      .catch((error) =>
        console.warn("Could not subscribe to browser close events.", error),
      );

    void Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch((error) =>
      console.warn("Could not configure keyboard resizing.", error),
    );
    void StatusBar.setStyle({ style: Style.Light }).catch((error) =>
      console.warn("Could not configure the status bar.", error),
    );
    void StatusBar.setBackgroundColor({ color: "#111b34" }).catch(() => {
      // iOS controls the status bar background through the web view.
    });

    const handleExternalLinks = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      let target: URL;
      try {
        target = new URL(anchor.href);
      } catch {
        return;
      }
      const isCurrentWebView =
        target.origin === window.location.origin ||
        target.hostname === "localhost";
      if (isCurrentWebView) {
        event.preventDefault();
        stateRef.current.setLocation(
          `${target.pathname}${target.search}${target.hash}`,
        );
        return;
      }

      const path = appUrlToPath(target.href, nativeAppLinkHosts);
      if (path) {
        event.preventDefault();
        stateRef.current.setLocation(path);
        return;
      }

      if (target.protocol !== "https:" && target.protocol !== "http:") return;

      event.preventDefault();
      void openExternalUrl(target.href).catch(() => {
        toast.error("Could not open that link.");
      });
    };

    document.addEventListener("click", handleExternalLinks, true);
    return () => {
      disposed = true;
      document.removeEventListener("click", handleExternalLinks, true);
      handles.forEach((handle) => void handle.remove());
    };
  }, [queryClient]);

  return null;
}