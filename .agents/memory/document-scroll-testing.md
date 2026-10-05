---
name: Document scroll testing
description: How to validate shared document scrolling across the worship app.
---

Use Node/jsdom tests to protect the structural contract: route content should use the document scroll surface, while deliberately bounded areas such as sidebars retain their own scroll container. Verify actual wheel, touch, and viewport behavior in a browser or native device as well; jsdom does not compute real layout or scrolling.

**Why:** Scroll behavior depends on browser layout, viewport sizing, and WebView behavior that DOM-only tests cannot reproduce.

**How to apply:** When changing shared app-shell overflow or height rules, add lightweight structural regression assertions and separately exercise long authenticated pages, overlays, and native viewports. Browser tests for protected routes can use an isolated test-only Clerk facade and deterministic API fixtures while rendering the real app shell; never add an auth bypass to production configuration.

For expandable mobile navigation, assert that every group label fits while all groups are collapsed before opening any group. Opening earlier groups can push later labels below the viewport even when the initial drawer fits.

**Why:** A visibility assertion made after expanding a group measures the expanded scroll state, not whether the compact default fits on a phone.

**How to apply:** On short and standard phone sizes, verify the initial collapsed layout first, then expand sections and separately test that the scroll region reaches their links while the account block stays anchored.