---
name: Profile save semantics
description: The distinction between abbreviated onboarding saves and full profile edits.
---

Abbreviated onboarding saves must omit blank optional fields so they cannot erase richer profile data. Full Profile edits send explicit empty strings, nulls, or empty arrays when the user intentionally clears a value.

**Why:** The onboarding wizard exposes only a subset of profile fields, while the full Profile page is the user-controlled editing surface. Treating both payloads as complete snapshots caused returning users to lose saved context.

**How to apply:** Preserve omitted optional properties in the API update path, and keep explicit clear values supported for full-profile requests.

A successfully persisted profile with both required names is also durable evidence that first-run onboarding is complete; later optional wizard steps must not be able to make the first-run prompt return.

**Why:** Treating profile persistence and onboarding completion as separate required requests allowed an interruption after the profile save to re-open onboarding on refresh or another device.

**How to apply:** Stamp first-run completion atomically with a usable profile save, while allowing the current in-progress wizard session to continue through optional steps.