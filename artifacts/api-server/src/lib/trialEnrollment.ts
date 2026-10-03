import { TRIAL_DAYS } from "./getAccessState";

const DAY_MS = 24 * 60 * 60 * 1000;
const ENROLLMENT_MARKER = "required_card";

export type TrialEnrollmentStatus = "pending" | "enrolled" | "expired";

export const CARD_REQUIRED_TRIAL_TERMS =
  "A card is required to start your 14-day trial. You will not be charged today. Your $9.99/month subscription begins after the trial; cancel before then to avoid the first charge.";

export const CARD_CHECKOUT_PAYMENT_OPTIONS = {
  payment_method_collection: "always" as const,
  payment_method_types: ["card" as const],
};

export function buildCardRequiredTrialOptions(userId: string) {
  const metadata = { userId, trialEnrollment: "required_card" };
  return {
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata,
    },
    metadata,
    custom_text: {
      submit: { message: CARD_REQUIRED_TRIAL_TERMS },
    },
  };
}

type StripeReference = string | { id: string } | null | undefined;

export function stripeReferenceId(reference: StripeReference): string | null {
  if (typeof reference === "string") return reference;
  return reference?.id ?? null;
}

export function isTrialEnrollmentEligible(
  status: TrialEnrollmentStatus,
): boolean {
  return status === "pending";
}

export function shouldStartCardTrial(
  accessStateKind: string,
  enrollmentStatus: TrialEnrollmentStatus,
): boolean {
  return (
    accessStateKind === "enrollment_required" &&
    isTrialEnrollmentEligible(enrollmentStatus)
  );
}

export interface TrialingSubscription {
  id: string;
  customer: StripeReference;
  status: string;
  trial_start: number | null;
  trial_end: number | null;
  default_payment_method: StripeReference;
  metadata: Record<string, string>;
}

export interface CheckoutSessionForEnrollment {
  id: string;
  url: string | null;
  status: string | null;
  mode: string | null;
  customer: StripeReference;
  subscription: StripeReference;
  payment_status: string;
  metadata: Record<string, string> | null;
}

export function isCardBackedTrialSubscription(
  subscription: TrialingSubscription,
): boolean {
  if (
    subscription.status !== "trialing" ||
    !subscription.default_payment_method ||
    subscription.trial_start == null ||
    subscription.trial_end == null
  ) {
    return false;
  }

  const trialDurationSeconds = subscription.trial_end - subscription.trial_start;
  const expectedDurationSeconds = TRIAL_DAYS * DAY_MS / 1000;
  return (
    subscription.trial_end * 1000 > Date.now() &&
    Math.abs(trialDurationSeconds - expectedDurationSeconds) <= 60
  );
}

/**
 * Validates the already-enrolled trial that support may extend. Unlike
 * enrollment, an existing trial may be longer than the original 14 days.
 */
export function isCurrentCardBackedTrialSubscription({
  subscription,
  customerId,
  trialStartedAt,
  trialEndsAt,
  now = Date.now(),
}: {
  subscription: TrialingSubscription;
  customerId: string;
  trialStartedAt: Date | string;
  trialEndsAt: Date | string;
  now?: number;
}): boolean {
  const startMs = new Date(trialStartedAt).getTime();
  const endMs = new Date(trialEndsAt).getTime();
  return (
    subscription.status === "trialing" &&
    !!subscription.default_payment_method &&
    stripeReferenceId(subscription.customer) === customerId &&
    subscription.trial_start != null &&
    subscription.trial_end != null &&
    Math.floor(startMs / 1000) === subscription.trial_start &&
    endMs === subscription.trial_end * 1000 &&
    endMs > now
  );
}

export function extendedTrialEnd(
  currentTrialEnd: number,
  days: 7 | 14 | 30,
  now = Date.now(),
): number | null {
  if (currentTrialEnd * 1000 <= now) return null;
  return currentTrialEnd + days * DAY_MS / 1000;
}

export function isConfirmedTrialCheckout({
  session,
  subscription,
  userId,
  customerId,
}: {
  session: CheckoutSessionForEnrollment;
  subscription: TrialingSubscription;
  userId: string;
  customerId: string;
}): boolean {
  return (
    session.status === "complete" &&
    session.mode === "subscription" &&
    session.payment_status === "no_payment_required" &&
    stripeReferenceId(session.customer) === customerId &&
    stripeReferenceId(session.subscription) === subscription.id &&
    session.metadata?.userId === userId &&
    session.metadata?.trialEnrollment === ENROLLMENT_MARKER &&
    subscription.metadata.userId === userId &&
    subscription.metadata.trialEnrollment === ENROLLMENT_MARKER &&
    stripeReferenceId(subscription.customer) === customerId &&
    isCardBackedTrialSubscription(subscription)
  );
}

export function reusableEnrollmentCheckoutUrl(
  sessions: CheckoutSessionForEnrollment[],
  userId: string,
  customerId: string,
): string | null {
  return (
    sessions.find(
      (session) =>
        session.status === "open" &&
        session.mode === "subscription" &&
        session.url &&
        stripeReferenceId(session.customer) === customerId &&
        session.metadata?.userId === userId &&
        session.metadata?.trialEnrollment === ENROLLMENT_MARKER,
    )?.url ?? null
  );
}