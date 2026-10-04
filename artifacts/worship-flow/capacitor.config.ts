import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || "app.sundaystudio.app",
  appName: "Sunday Studio",
  webDir: "dist/public",
  android: {
    backgroundColor: "#fbf8f4",
    allowMixedContent: false,
  },
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
  },
  plugins: {
    Keyboard: {
      resize: "body",
      style: "DARK",
    },
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#fbf8f4",
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#111b34",
      overlaysWebView: false,
    },
  },
};

export default config;