---
name: Development schema drift
description: How to interpret API validation failures when the local database is behind the checked-in Drizzle schema
---

When API errors point at stale shared-package declarations, rebuild the workspace libraries before changing feature code. For development schema sync, compare the checked-in migrations and actual database metadata, then review every proposed change. Never push from a partial schema file: Drizzle can treat omitted tables as drops. If a push proposes a differently named constraint, check whether an equivalent index or constraint already enforces the same rule before adding another one.

**Why:** During trial-schema repair, rebuilding shared declarations cleared the API type errors. A partial-schema push proposed deleting 11 populated tables, while the full push flagged a differently named unique index that already enforced the help-article slug rule.

**How to apply:** Use the complete configured schema for Drizzle pushes, avoid force mode, and prefer the existing reviewed migration or narrowly scoped DDL when an unrelated diff blocks a safe sync. Verify API typechecking and database-backed tests after the change.