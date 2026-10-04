---
name: Document scroll testing
description: How to validate shared document scrolling across the worship app.
---

Use Node/jsdom tests to protect the structural contract: route content should use the document scroll surface, while deliberately bounded areas such as sidebars retain their own scroll container. Verify actual wheel, touch, and viewport behavior in a browser or native device as well; jsdom does not compute real layout or scrolling.

**Why:** Scroll behavior depends on browser layout, viewport sizing, and WebView behavior that DOM-only tests cannot reproduce.

**How to apply:** When changing shared app-shell overflow or height rules, add lightweight structural regression assertions and separately exercise long authenticated pages, overlays, and native viewports.