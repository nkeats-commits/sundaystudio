---
name: Profile save semantics
description: The distinction between abbreviated onboarding saves and full profile edits.
---

Abbreviated onboarding saves must omit blank optional fields so they cannot erase richer profile data. Full Profile edits send explicit empty strings, nulls, or empty arrays when the user intentionally clears a value.

**Why:** The onboarding wizard exposes only a subset of profile fields, while the full Profile page is the user-controlled editing surface. Treating both payloads as complete snapshots caused returning users to lose saved context.

**How to apply:** Preserve omitted optional properties in the API update path, and keep explicit clear values supported for full-profile requests.