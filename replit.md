# WorshipFlow

## Overview

WorshipFlow is an AI worship-planning tool for Christian pastors and worship leaders. Built as a pnpm monorepo with a contract-first OpenAPI workflow.

Brand: warm pastoral aesthetic — navy `#1F2A44`, gold `#C99A3D`, cream `#F8F4EA`, Playfair Display + Inter.

## Artifacts

- `artifacts/worship-flow` (web): React + Vite client. Wouter routing, TanStack Query, Clerk auth via proxy, shadcn/Radix primitives. All UI tokens defined in `src/index.css` against the worship palette.
- `artifacts/api-server` (api): Express + Drizzle + Anthropic Claude. Mounted at `/api`. Clerk middleware (proxy pattern) gates all routes except `/api/healthz`.
- `artifacts/mockup-sandbox`: Original design mockups for the worship-flow app (`src/components/mockups/worship-flow/`). Source of truth for the approved visual direction.

## Shared libs

- `lib/api-spec` — OpenAPI 3.1 spec. Source of truth for the API contract. `pnpm --filter @workspace/api-spec run codegen` regenerates Zod schemas + React Query hooks.
- `lib/api-zod` — generated Zod schemas.
- `lib/api-client-react` — generated React Query hooks (Orval).
- `lib/db` — Drizzle schema (`users`, `church_profiles`, `service_plans`, `library_items`).
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
- `/library` — saved AI outputs by kind
- `/church` — pastor's church profile (used as Anthropic context)
- `/settings` — sign out

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

## Environment

- `DATABASE_URL` — PostgreSQL (Replit-managed)
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY` (via `@workspace/integrations-anthropic-ai`)
- `SESSION_SECRET`
- `PORT`, `BASE_PATH` — wired by the artifact workflow per service
