# Sunday Studio

## Overview

Sunday Studio is an AI worship-planning tool for Christian pastors and worship leaders. Built as a pnpm monorepo with a contract-first OpenAPI workflow.

Brand: warm pastoral aesthetic — navy `#111b34`, gold `#c5a471`, cream `#fbf8f4`, sand `#e8d8c0`, border `#ddd0be`, Playfair Display + Inter.

## Artifacts

- `artifacts/worship-flow` (web): React + Vite client. Wouter routing, TanStack Query, Clerk auth via proxy, shadcn/Radix primitives. All UI tokens defined in `src/index.css` against the worship palette.
- `artifacts/api-server` (api): Express + Drizzle + Anthropic Claude. Mounted at `/api`. Clerk middleware (proxy pattern) gates all routes except `/api/healthz`.
- `artifacts/mockup-sandbox`: Original design mockups for the worship-flow app (`src/components/mockups/worship-flow/`). Source of truth for the approved visual direction.

## Shared libs

- `lib/api-spec` — OpenAPI 3.1 spec. Source of truth for the API contract. `pnpm --filter @workspace/api-spec run codegen` regenerates Zod schemas + React Query hooks.
- `lib/api-zod` — generated Zod schemas.
- `lib/api-client-react` — generated React Query hooks (Orval).
- `lib/db` — Drizzle schema (`users`, `church_profiles`, `service_plans`, `library_items`, `sermons`, `sermon_resources`, `sermon_exports`). `library_items.isRepertoire` (boolean, default false) marks songs as part of the user's personal repertoire.
- `lib/integrations-anthropic-ai` — Anthropic SDK wrapper.

## Routes

Public:
- `/` — landing page (signed-in users redirect to `/dashboard`)
- `/sign-in/*?`, `/sign-up/*?` — Clerk components themed with shadcn theme + worship variables

Signed-in (wrapped in `RequireSignedIn`):
- `/dashboard` — overview from `GET /api/dashboard`
- `/service-builder` — generate full service plans, persist via `POST /api/service-plans`
- `/services`, `/services/:id` — saved service plans CRUD
- `/generators/{liturgy,songs,speaking-moment,devotional}` — single-purpose AI tools, save outputs to library
- `/sermons`, `/sermons/new`, `/sermons/:id` — Sermon Builder (3-panel: context | tabs for Study, Big Idea, Outline, Manuscript, Applications, Illustrations, Worship Integration). Each tab streams from a dedicated SSE generator and PATCHes the sermon row.
- `/resources` — Resource Library (commentary excerpts attachable to sermons; the AI sees `{ title, author, excerpt }` only).
- `/library` — saved AI outputs by kind
- `/church` — pastor's church profile (used as Anthropic context)
- `/settings` — account info, billing link, **Scholarly Sources** panel (per-source toggles), sign out

### Cross-feature linking (Task #9)

Each `ServicePlanItem` may carry `linkedKind` (`'sermon' | 'library_item'`), `linkedId`, and `linkedTitle` — a soft FK that points back to a saved sermon or library item. The slot's `body`/`title` remain a snapshot so the service plan stays self-contained even if the source is later edited or deleted.

- `POST /api/sermons/:id/build-service` composes a service plan from a sermon's `worshipIntegration` block and links the sermon slot back to it.
- `GET /api/sermons/:id/linked-services` and `GET /api/library/:id/linked-services` reverse-look up service plans containing the link via a jsonb `@>` containment query (scoped to `userId`).
- `SlotPicker` (in `src/components/SlotPicker.tsx`) is the modal that lets a pastor swap any service slot for a saved sermon or library item; `slotPickerSupported(kind)` is the parent's gate (slot kinds like `offering` have no sensible source). `LinkedPill` is the bronze pill rendered next to a linked slot title.
- ServiceDetail PUTs the whole `content` blob and seeds the cache via `setQueryData` from the mutation response to avoid back-to-back overwrite races. After every link/unlink it invalidates every `/linked-services` query so reverse-lookup badges on Sermon Archive / Library refresh.

### Song Repertoire (Task #11)

- Songs in `library_items` can be flagged `isRepertoire=true` (server enforces songs-only). The Library has an "Our Repertoire" tab with an inline add form, a "Paste a list" modal (parses `Title`, `Title - Artist`, `Title — Artist` lines), and a star toggle on every song card. Bulk import dedupes case-insensitively against the user's existing repertoire titles.
- New endpoints in `routes/library.ts`: `PATCH /library/{id}/repertoire`, `POST /library/repertoire/bulk-import`. `GET /library` accepts `repertoire=true` for the filtered view (sorted alphabetically).
- Song Assistant has a 3-state "Use my repertoire" segmented control: **Prefer** (default — bias toward repertoire, fill gaps from elsewhere), **Strict** (only repertoire titles; disabled when 0), **Off**. Strict is downgraded to Prefer on submit when the repertoire is empty so the server can emit its informative notice.
- Repertoire helper lives in `artifacts/api-server/src/lib/repertoire.ts`. `/generate/songs` injects mode-specific prompt blocks and a server-side transform on `streamGenerate` filters Strict-mode results to repertoire titles only and annotates `inRepertoire` on every kept song; `notice` is emitted when Strict is short or Prefer was requested with an empty repertoire. `/generate/service-plan` and `/generate/sermon-to-service` always inject Prefer-mode context (no UI control).
- `streamGenerate` (`lib/sseStream.ts`) gained a generic `T` parameter and an optional `transform(parsed)` hook that runs after schema validation, before the `done` event.

### Scholarly Sources (Task #56)

Per-user opt-in registry of bundled public-domain commentaries that the Sermon Builder consults silently to ground its output.

- **Schema**: `user_source_preferences` (`user_id` PK, `enabled_source_ids` text[], timestamps). Migration `lib/db/drizzle/0002_add_user_source_preferences.sql` is idempotent.
- **Registry**: `artifacts/api-server/src/lib/scholarlySources.ts` loads `data/commentaries/<id>/MANIFEST.json` for each source. v1 ships `matthew-henry-concise` covering 66 books / 1068 chapters of authentic Henry text ingested from CCEL via `scripts/src/ingest-mhcc.ts` (run with `pnpm --filter @workspace/scripts run ingest-mhcc`). The loader skips any manifest-only source so pastors never see a toggle that contributes no excerpts. Six additional manifests (jamieson-fausset-brown, barnes-notes, keil-delitzsch, pulpit-commentary, john-gill, adam-clarke) are kept on disk for future seeding. Default enabled set is `[matthew-henry-concise]`.
- **Lookup**: `parsePassageRef` accepts `"Romans 8:28"`, `"1 John 4"`, `"John 3:16-21"`, `"Ps 23"`, `"Romans 8:28-9:3"` and uses `BOOK_ALIASES`. `lookupCommentary` returns up to a 1500-char excerpt per source per chapter.
- **Merge**: `lib/scholarlyMerge.ts.mergeScholarlyResources(userId, ctx)` runs after every `hydrateSeriesContext` call in `routes/generateSermon.ts`. It prepends synthetic resources tagged `[Public-Domain Source] <Source title> — <Book> <Chapter>` to `ctx.resources[]`, so the existing `resourceBlurb` channel + `SERMON_GROUND_RULES` automatically prevent fabrication. Returns `{ count, consultedSources: [{id,title,author}] }`; the study route uses `runJob`'s transform hook to attach `consultedSources` to `SermonStudyOutput` so the client can render a deterministic "Sources consulted" footer. Task #7 ("My Library") will reuse the merge mechanism for user-uploaded content.
- **Endpoints**: `GET /api/sources` returns `{ sources, enabledSourceIds, defaults }`; `PUT /api/sources/preferences` validates ids against the registry. Both Clerk-authed. Defined in `routes/sources.ts`.
- **UI**: Settings page renders `<ScholarlySourcesPanel/>` (per-source toggle pills, optimistic with monotonic-token race protection). Sermon Builder header renders `<ScholarlySourcesChip/>` showing "X of Y scholarly sources active" linked to /settings.

### Sermon AI safety

- `SERMON_GROUND_RULES` (in `routes/generateSermon.ts`) is included in every sermon prompt: no fabricated commentary quotes, no scholar attribution unless from user-supplied resources, mark unverifiable claims with `verifyBeforeUsing: true`, no extended verbatim copyrighted material.
- `streamGenerate` in `lib/sseStream.ts` accepts an optional zod response schema and validates the model's parsed output before emitting the `done` event — rejects malformed shapes as SSE `error`.
- `POST/PATCH /sermons` validate that every `attachedResourceIds` entry belongs to `req.userId` (multi-tenant guard).

## Auth

- Clerk via proxy. ClerkProvider in `App.tsx` configured with `proxyUrl`, paths derived from `import.meta.env.BASE_URL`, and shadcn theme + worship `variables` for warm card styling.
- Server: `clerkProxyMiddleware` mounted before body parsing, then `clerkMiddleware({ publishableKey, secretKey })`. `requireAuth` middleware upserts the user from session claims into the `users` table on first request.
- Browser carries Clerk cookies automatically — no `setAuthTokenGetter` needed (web app, not Expo).

## AI generation

All generation endpoints use `generateJson` (`artifacts/api-server/src/lib/anthropicJson.ts`) with `claude-sonnet-4-6`, max_tokens 8192, system prompt warm/pastoral. Each prompt includes `churchContextBlurb(churchProfile)` so output is personalized.

## Conventions

- Frontend uses **only** hooks from `@workspace/api-client-react` (never raw fetch).
- After mutations, invalidate the relevant query keys via `getXQueryKey` helpers.
- Server logging: `req.log` in handlers, singleton `logger` elsewhere — never `console.log`.
- Express types augmented in `requireAuth.ts` (`req.userId`).
- Tailwind v4: `@layer theme, base, clerk, components, utilities;` MUST precede `@import "tailwindcss";`. Vite plugin uses `tailwindcss({ optimize: false })` for Clerk theme compatibility.

## Resend Automations (email lifecycle events)

`lib/events/src/index.ts` is the single source of truth for all 15 event names and human-readable metadata. Both `artifacts/api-server` and `artifacts/worship-flow` import from `@workspace/events`.

`trackEvent()` in `artifacts/api-server/src/lib/emailClient.ts` calls `POST https://api.resend.com/v1/events` directly via `fetch` — **not** `resend.events.track()`. The Resend Node SDK v4 does not expose an `events.track()` method; the REST endpoint is the supported path and uses the same `{ event, email, data }` payload shape documented in Resend's Automations guide.

One-time events use an atomic `UPDATE users SET stamp = now() WHERE stamp IS NULL RETURNING` claim. If `trackEvent()` returns `false` (credentials present but delivery failed) the stamp is reverted so the next request retries. Trial cron emails (`trial_expiring`, `trial_expired`) gate their stamp write on `delivered === true`.

Admin reference: `/admin/email-events` lists all events with copyable Resend event name strings. Per-user stamp status (8 one-time events including `trial_started` derived from `trialStartedAt`) is visible in `/admin/users/:id`.

## Environment

- `DATABASE_URL` — PostgreSQL (Replit-managed)
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY` (via `@workspace/integrations-anthropic-ai`)
- `SESSION_SECRET`
- `PORT`, `BASE_PATH` — wired by the artifact workflow per service
