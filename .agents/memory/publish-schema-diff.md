---
name: Publish schema diff and migration files
description: Replit Publish compares live development and production schemas rather than replaying Drizzle migration SQL.
---

Replit Publish generates DDL from the introspected development-to-production schema difference; editing a Drizzle migration file (including `NOT VALID`) does not alter the Publish statement.

**Why:** A development migration file can successfully create a constraint locally while Publish still emits a plain `ADD CONSTRAINT` against production data, where existing orphan rows are validated and can make publishing fail.

**How to apply:** Inspect both databases and call the schema-diff explanation before changing migration text. If production data violates a desired new constraint, resolve that data issue through the approved production process; do not add deployment-time DDL or weaken the development schema just to make the diff disappear.