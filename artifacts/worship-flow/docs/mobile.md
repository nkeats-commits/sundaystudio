# Sunday Studio for iOS and Android

The mobile apps package the existing Vite/React workspace with Capacitor. They
use the same screens, Clerk web session, API, and saved user data as the web
app; there is no separate mobile database or offline-editing mode.

## Requirements

- Node.js and pnpm matching the workspace toolchain.
- Xcode and the iOS Simulator on macOS for iOS builds. A physical-device build
  also requires an Apple development team and signing profile.
- Android Studio, Android SDK Platform Tools, and a JDK supported by the
  generated Gradle project for Android builds.
- A public HTTPS API/app origin. For the current published Sunday Studio app,
  set `VITE_API_BASE_URL=https://sundaystudio.app`. If the website uses another
  host, set `VITE_APP_URL` to that HTTPS origin as well. Both values are
  public origins only (no path, credentials, query, or fragment).
- The app's existing public Clerk publishable key in
  `VITE_CLERK_PUBLISHABLE_KEY`. Do not put a Clerk secret key or session token
  in the mobile bundle.

Set `CAPACITOR_APP_ID` before creating native projects if the app's bundle
identifier/package name needs to differ from `app.sundaystudio.app`. This
identifier must remain stable after registering the app with Clerk and before
creating signed store builds.

## Create or refresh native projects

Run commands from the workspace root:

```sh
VITE_API_BASE_URL=https://sundaystudio.app \
VITE_APP_URL=https://sundaystudio.app \
pnpm --filter @workspace/worship-flow build:mobile

# Run each once, only if its platform directory does not exist yet.
pnpm --filter @workspace/worship-flow cap:add:ios
pnpm --filter @workspace/worship-flow cap:add:android

# After a web or plugin change:
VITE_API_BASE_URL=https://sundaystudio.app \
VITE_APP_URL=https://sundaystudio.app \
pnpm --filter @workspace/worship-flow build:mobile
pnpm --filter @workspace/worship-flow cap:sync
```

The mobile build script sets the Vite port and `/` base required by the
standalone app bundle. `VITE_API_BASE_URL` is mandatory for that build; using a
relative `/api` URL in a bundled WebView would send authenticated API requests
to the local app shell instead of Sunday Studio's server.

## Run on a simulator or device

```sh
pnpm --filter @workspace/worship-flow cap:open:ios
pnpm --filter @workspace/worship-flow cap:open:android
```

In Xcode, select an iOS simulator or signed test device and run the `App`
scheme. In Android Studio, select an emulator or USB-connected device and run
the `app` configuration. The CLI alternatives are
`pnpm --filter @workspace/worship-flow cap:run:ios` and
`pnpm --filter @workspace/worship-flow cap:run:android`.

The projects register the `sundaystudio://` URL scheme. Use
`sundaystudio://open/<path>` to route to an app page. HTTPS links are routed
inside the app only when their hostname matches `VITE_APP_URL` (or
`VITE_API_BASE_URL` when no separate app URL is configured). Other HTTPS links
open in the system browser. The scheme is not a verified Universal Link or
Android App Link; those require domain association files and signing details.

## Mobile behavior and testing

- API requests use the existing Clerk `getToken()` getter, which asks Clerk for
  a current session token when a request is made. The app does not copy tokens
  into local storage, preferences, or deep-link URLs.
- Planning Center authorization and Stripe checkout open in the platform
  browser. Closing the browser or returning to Sunday Studio invalidates active
  API queries so connection and subscription status refresh.
- Android back closes the open navigation drawer or dialog, navigates to the
  previous app route, and returns to the dashboard before offering to exit.
- Keyboard resizing and safe-area insets are enabled. HTML file inputs remain
  available for document selection. Copy uses the native clipboard plugin.
- Service-plan and generated-content export uses a temporary text/Markdown file
  and the system share sheet. The native shell does not call `window.print()`;
  users can share the export to a compatible app to print or save it.
- Generation jobs continue using the existing server job API. When the app
  resumes, active data queries refresh and job polling continues.

Before a release, exercise these flows on both platforms:

1. Sign in and sign out; verify protected API calls use a current Clerk token.
2. Open the dashboard, create/edit a service plan, save generated content to
   the Library, and reopen saved content.
3. Start a content-generation job, navigate elsewhere while it runs, then
   return to the completed result.
4. Select a document, copy text, and share a plan and generated-content export.
5. Connect Planning Center, cancel a Stripe checkout, and complete a test
   checkout; close the system browser and confirm the app refreshes.
6. On Android, use system Back with the drawer open, with a dialog open, and on
   nested service pages. On both platforms, test forms while the keyboard is
   open and confirm content remains reachable around the safe areas.
7. Repeat the tests after force-quitting the app and after reopening a
   `sundaystudio://` link.

## Clerk OAuth support boundary

The WebView retains the current `@clerk/react` sign-in and sign-up components,
and API requests continue to use their Clerk session tokens. OAuth services
can reject authentication from embedded WebViews. Clerk's documented native
hosted-auth flow activates a session through its iOS or Android SDK; this
Capacitor shell does not yet bridge those native SDKs into the React auth
provider. Do not add a token to a callback URL or create a second credential
store as a workaround. Verify the enabled Clerk sign-in methods on real
devices before offering them in a release; if a provider blocks the WebView,
add Clerk's supported native hosted-auth bridge, register each bundle ID and
package name in Clerk's Native Applications settings, and test the returned
session on both platforms.

## Release preparation

For each release build, use the production HTTPS origins, run the mobile build
and `cap:sync` commands above, and test the resulting native projects on target
devices. Configure iOS bundle signing/provisioning in Xcode and Android
application signing in Android Studio or Gradle. Keep signing credentials out
of source control. Store listing, signing credentials, and app-store submission
are intentionally not part of this workspace setup.