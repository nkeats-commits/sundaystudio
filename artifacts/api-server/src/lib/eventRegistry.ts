/**
 * Re-exports the shared event registry from @workspace/events so server
 * code can import from this local path without knowing about the lib layout.
 *
 * Single source of truth lives in lib/events/src/index.ts — consumed by
 * both this server and the worship-flow admin UI.
 */
export { EVENTS, EVENT_CATALOG, type EventName, type EventMeta, type EventCategory, EVENT_CATEGORIES } from "@workspace/events";
