---
name: Clerk hosted auth in Capacitor
description: Constraints for keeping Clerk Account Portal hosted auth connected to the existing React provider in the native WebView.
---

Keep the hosted-auth exchange isolated from app routing and token storage. The Capacitor shell uses the existing React Clerk provider, so its hosted-auth adapter mirrors Clerk's official native PKCE/FAPI redemption sequence and currently reaches the underlying Clerk instance through the React wrapper's internal `clerkjs` field. That field and client `fromJSON` behavior are not a public compatibility contract; guard them and re-check Clerk's official implementation before upgrading or replacing the React SDK.

**Why:** The app must preserve its existing React auth state and fresh `getToken()` API path without creating a second credential store, while Clerk's public React surface does not include the native hosted-auth hook.

**How to apply:** Keep PKCE verifiers and state in memory, validate the exact app callback and state, consume the one-time nonce immediately, and activate the returned session through the existing provider. Clerk Native API and matching iOS/Android identifiers still need to be configured in the dashboard.