---
name: Trial conversion analytics
description: Durable funnel events and lifecycle delivery semantics for trial conversion work.
---

Product conversion reporting must not depend on Resend being configured or available: persist funnel events locally, mirror lifecycle events to Resend when possible, and only advance one-time email stamps after a successful handoff.

**Why:** Conversion experiments and operational recovery need a trustworthy local baseline, while failed lifecycle delivery must remain retryable.

**How to apply:** Keep product events idempotent at milestone boundaries, include trial-day and usage context, and treat prompt analytics as non-blocking telemetry.