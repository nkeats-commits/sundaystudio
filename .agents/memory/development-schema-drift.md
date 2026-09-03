---
name: Development schema drift
description: How to interpret API validation failures when the local database is behind the checked-in Drizzle schema
---

When route tests fail because the development database lacks columns or tables already represented in the checked-in schema, treat that as environment drift rather than changing unrelated feature code or forcing a migration.

**Why:** The dashboard work exposed missing existing trial-email columns in the development database, which caused unrelated API tests and the new database-backed dashboard regression to fail before the route ran.

**How to apply:** Run typechecks, builds, and isolated frontend tests normally; report the database-backed test as blocked and leave schema synchronization to the dedicated database-maintenance task.