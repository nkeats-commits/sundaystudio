/**
 * Resend Automations event registry — shared between the API server and
 * the worship-flow admin UI so there is exactly one source of truth for
 * event names, categories, and human-readable metadata.
 *
 * Import in the server:   import { EVENTS, EVENT_CATALOG } from "@workspace/events";
 * Import in the client:   import { EVENTS, EVENT_CATALOG } from "@workspace/events";
 */

export const EVENTS = {
  // ── Account Lifecycle ────────────────────────────────────────────────────
  /** User signs up and their trial clock starts. Fires once on first login. */
  TRIAL_STARTED: "trial_started",
  /** Day-11 reminder: 3 days left in trial. Fires via the trial email cron. */
  TRIAL_EXPIRING: "trial_expiring",
  /** Day-14 expiry: trial has ended. Fires via the trial email cron. */
  TRIAL_EXPIRED: "trial_expired",
  /** User subscribes via Stripe (subscription.created webhook). */
  SUBSCRIPTION_STARTED: "subscription_started",
  /** User cancels their subscription (subscription.deleted webhook). */
  SUBSCRIPTION_CANCELED: "subscription_canceled",
  /**
   * User reactivates a previously canceled subscription. Fires on:
   *   1. status transition from an inactive state → active/trialing, OR
   *   2. cancel_at_period_end flipping true → false (un-cancel) while
   *      the status is already active/trialing.
   */
  SUBSCRIPTION_REACTIVATED: "subscription_reactivated",

  // ── Onboarding Milestones ────────────────────────────────────────────────
  /** Pastor saves a church profile for the first time. */
  CHURCH_PROFILE_COMPLETED: "church_profile_completed",
  /** First AI sermon study generation. */
  FIRST_SERMON_GENERATED: "first_sermon_generated",
  /** First service plan saved to the database. */
  FIRST_SERVICE_PLAN_SAVED: "first_service_plan_saved",
  /** First library item saved (any kind). */
  FIRST_LIBRARY_ITEM_SAVED: "first_library_item_saved",

  // ── Feature Adoption ─────────────────────────────────────────────────────
  /** Planning Center Services OAuth successfully completed. */
  PLANNING_CENTER_CONNECTED: "planning_center_connected",
  /** User enables at least one scholarly source for the first time. */
  SCHOLARLY_SOURCES_ENABLED: "scholarly_sources_enabled",
  /** First song added to the user's personal repertoire. */
  REPERTOIRE_FIRST_SONG_ADDED: "repertoire_first_song_added",

  // ── High-Intent Actions ──────────────────────────────────────────────────
  /** Pastor exports a sermon (any format). */
  SERMON_EXPORTED: "sermon_exported",
  /** Pastor exports a service plan (any format). */
  SERVICE_PLAN_EXPORTED: "service_plan_exported",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export type EventCategory =
  | "Account Lifecycle"
  | "Onboarding Milestones"
  | "Feature Adoption"
  | "High-Intent Actions";

/** Human-readable metadata for each event — consumed by the Admin reference page. */
export interface EventMeta {
  name: EventName;
  category: EventCategory;
  description: string;
  firesWhen: string;
  frequency: "Once" | "Per occurrence";
}

export const EVENT_CATALOG: EventMeta[] = [
  {
    name: EVENTS.TRIAL_STARTED,
    category: "Account Lifecycle",
    description: "User signed up and trial clock started",
    firesWhen: "First authenticated request after account creation",
    frequency: "Once",
  },
  {
    name: EVENTS.TRIAL_EXPIRING,
    category: "Account Lifecycle",
    description: "Trial is 3 days from expiry (day 11)",
    firesWhen: "Trial email cron — day 11 of trial",
    frequency: "Once",
  },
  {
    name: EVENTS.TRIAL_EXPIRED,
    category: "Account Lifecycle",
    description: "Trial period has ended (day 14+)",
    firesWhen: "Trial email cron — day 14 of trial",
    frequency: "Once",
  },
  {
    name: EVENTS.SUBSCRIPTION_STARTED,
    category: "Account Lifecycle",
    description: "User started a paid subscription",
    firesWhen: "Stripe customer.subscription.created webhook",
    frequency: "Per occurrence",
  },
  {
    name: EVENTS.SUBSCRIPTION_CANCELED,
    category: "Account Lifecycle",
    description: "User canceled their subscription",
    firesWhen: "Stripe customer.subscription.deleted webhook",
    frequency: "Per occurrence",
  },
  {
    name: EVENTS.SUBSCRIPTION_REACTIVATED,
    category: "Account Lifecycle",
    description: "User reactivated a previously canceled subscription",
    firesWhen:
      "Stripe subscription.updated: status inactive→active/trialing, or cancel_at_period_end true→false",
    frequency: "Per occurrence",
  },
  {
    name: EVENTS.CHURCH_PROFILE_COMPLETED,
    category: "Onboarding Milestones",
    description: "Pastor saved their church profile",
    firesWhen: "PUT /api/me/church — first profile save or update",
    frequency: "Once",
  },
  {
    name: EVENTS.FIRST_SERMON_GENERATED,
    category: "Onboarding Milestones",
    description: "First AI sermon study generated",
    firesWhen: "POST /api/generate/sermon-study",
    frequency: "Once",
  },
  {
    name: EVENTS.FIRST_SERVICE_PLAN_SAVED,
    category: "Onboarding Milestones",
    description: "First service plan saved to the database",
    firesWhen: "POST /api/service-plans",
    frequency: "Once",
  },
  {
    name: EVENTS.FIRST_LIBRARY_ITEM_SAVED,
    category: "Onboarding Milestones",
    description: "First library item saved (any kind)",
    firesWhen: "POST /api/library",
    frequency: "Once",
  },
  {
    name: EVENTS.PLANNING_CENTER_CONNECTED,
    category: "Feature Adoption",
    description: "Planning Center Services OAuth completed",
    firesWhen: "GET /api/integrations/pcs/callback (OAuth success)",
    frequency: "Once",
  },
  {
    name: EVENTS.SCHOLARLY_SOURCES_ENABLED,
    category: "Feature Adoption",
    description: "At least one scholarly source enabled",
    firesWhen: "PUT /api/sources/preferences (first time any source is enabled)",
    frequency: "Once",
  },
  {
    name: EVENTS.REPERTOIRE_FIRST_SONG_ADDED,
    category: "Feature Adoption",
    description: "First song added to the pastor's repertoire",
    firesWhen:
      "PATCH /api/library/:id/repertoire or POST /api/library/repertoire/bulk-import",
    frequency: "Once",
  },
  {
    name: EVENTS.SERMON_EXPORTED,
    category: "High-Intent Actions",
    description: "Pastor exported a sermon",
    firesWhen: "POST /api/sermons/:id/export",
    frequency: "Per occurrence",
  },
  {
    name: EVENTS.SERVICE_PLAN_EXPORTED,
    category: "High-Intent Actions",
    description: "Pastor exported a service plan",
    firesWhen: "POST /api/service-plans/:id/export",
    frequency: "Per occurrence",
  },
];

export const EVENT_CATEGORIES: EventCategory[] = [
  "Account Lifecycle",
  "Onboarding Milestones",
  "Feature Adoption",
  "High-Intent Actions",
];
