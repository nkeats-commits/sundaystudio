#!/bin/bash
set -e
pnpm install --frozen-lockfile
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/drizzle/0018_pastoral_assistant_chat.sql
pnpm --filter @workspace/db run push
