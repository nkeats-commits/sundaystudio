---
name: Mobile keyboard viewport transitions
description: Preserve Assistant transcript position when mobile keyboards resize or pan the visible viewport.
---

Capture the transcript scroll position when a text field receives focus, before the keyboard-driven viewport resize can shift it. Restore that position after the viewport and layout have settled when the keyboard closes.

**Why:** Mobile browsers and WebViews may pan or resize the visible area before delivering the resize event, so saving only after that event can record the shifted position instead of the user's prior reading position.

**How to apply:** When changing keyboard-aware layouts, listen to both VisualViewport and window changes, retain the pre-keyboard transcript position, and verify it through a mobile browser or native device rather than relying only on DOM tests.