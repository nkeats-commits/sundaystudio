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

## Clerk hosted authentication

The app keeps the existing `@clerk/react` provider and sign-in/sign-up screens.
On iOS and Android, the screens offer Clerk Account Portal in the platform
browser for social sign-in and sign-up; the embedded provider buttons are hidden
there because OAuth providers can reject WebViews. Email and password remain
available in the existing React UI. The app validates Clerk's callback state
and PKCE verifier, redeems the one-time hosted-auth nonce with Clerk, updates
the existing Clerk client, and activates the returned session. Callback data is
consumed by the bridge and is not routed through Wouter or browser history.

The browser flow keeps its PKCE verifier and state in memory until it completes.
No session token is placed in a callback URL or application-managed storage.
Clerk's own client/session handling and the existing fresh `getToken()` bearer
token getter remain responsible for session persistence and protected API
requests. A process killed before the user returns from the browser cannot
resume the in-progress flow; the user can start it again.

Before testing or publishing, configure both Clerk environments that the app
uses:

1. In Clerk's **Native applications** settings, enable the Native API and add
   the iOS bundle identifier `app.sundaystudio.app` and Android package name
   `app.sundaystudio.app`. Production validates these identifiers.
2. Keep the iOS callback scheme `app.sundaystudio.app` registered in
   `ios/App/App/Info.plist`; the callback is
   `app.sundaystudio.app://callback`.
3. Keep the Android intent filter for
   `clerk://app.sundaystudio.app.hosted-callback` in
   `android/app/src/main/AndroidManifest.xml`.
4. If `CAPACITOR_APP_ID` changes, update the Clerk Native applications entry
   and both native callback registrations to the same new application ID,
   rebuild/sync the native projects, and register that identifier before
   producing a production build.
5. Configure the provider credentials required by the Clerk environment.
   Account Portal uses each provider's web OAuth flow. Production Apple sign-in
   requires an Apple Services ID and key configured in Clerk.

Test the full browser return on a real iOS device and Android device (or
simulator with the provider's supported test setup):

1. Start sign-in and sign-up from the native app. Confirm Account Portal opens
   outside the embedded WebView and that cancelling returns without activating
   a session.
2. Complete each enabled OAuth provider. Confirm the app returns to the
   dashboard, `useAuth()` becomes signed in, and a protected API request uses
   a fresh `Authorization: Bearer` token.
3. Force-quit and relaunch after a completed sign-in. Confirm Clerk restores the
   session and a protected API request still gets a fresh bearer token.
4. Confirm neither callback values nor Clerk session tokens appear in app
   routes, browser history, or application-managed storage.

## Release preparation

For each release build, use the production HTTPS origins, run the mobile build
and `cap:sync` commands above, and test the resulting native projects on target
devices. Configure iOS bundle signing/provisioning in Xcode and Android
application signing in Android Studio or Gradle. Keep signing credentials out
of source control. Store listing, signing credentials, and app-store submission
are intentionally not part of this workspace setup.