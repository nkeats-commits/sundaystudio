export interface TrialNudgeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const TRIAL_NUDGE_TOAST_OPTIONS = {
  duration: 10_000,
  closeButton: true,
} as const;

/**
 * Claims a prompt for this user/action. The session cap prevents repeats in a
 * browser tab while the date cap prevents the same prompt returning tomorrow
 * in a new session. Storage errors intentionally fail open so a browser
 * privacy setting cannot block the upgrade path.
 */
export function claimTrialNudge({
  userId,
  nudgeKey,
  today,
  sessionStorage,
  localStorage,
}: {
  userId: string;
  nudgeKey: string;
  today: string;
  sessionStorage: TrialNudgeStorage;
  localStorage: TrialNudgeStorage;
}): boolean {
  try {
    const sessionKey = `ss-trial-nudge:${userId}:${nudgeKey}`;
    const dayKey = `ss-trial-nudge:${userId}:${nudgeKey}:day`;
    const alreadyShown =
      sessionStorage.getItem(sessionKey) === "1" ||
      localStorage.getItem(dayKey) === today;
    if (alreadyShown) return false;
    sessionStorage.setItem(sessionKey, "1");
    localStorage.setItem(dayKey, today);
    return true;
  } catch {
    return true;
  }
}

export const ACTIVE_TRIAL_SUBSCRIBE_COPY =
  "Subscribe — billing starts when your trial ends";

export const ACTIVE_TRIAL_CHARGE_COPY = {
  heading: (trialEndsAt: string) => `No charge until ${trialEndsAt}`,
  description:
    "Your first $9.99 charge is scheduled for that date. Cancel before then and you will not be charged.",
} as const;

export function trialBannerCopy(daysLeft: number | null | undefined): string {
  if (daysLeft == null) return "Your trial is active";
  if (daysLeft === 1) return "1 day left in your trial";
  return `${daysLeft} days left in your trial`;
}

export function getPricingReturnContext(location: string): {
  returnTo: string;
  hasReturnContext: boolean;
  returnLabel: string;
} {
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const rawReturnTo = params.get("returnTo");
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith("/") ? rawReturnTo : "/dashboard";
  return {
    returnTo,
    hasReturnContext: rawReturnTo !== null,
    returnLabel: returnTo === "/dashboard" ? "dashboard" : "where you were planning",
  };
}

export function pricingPathWithReturnTo(
  pathname: string,
  search = "",
): string {
  return `/pricing?returnTo=${encodeURIComponent(pathname + search)}`;
}

export function formatTrialEndDate(iso: string | null | undefined): string {
  if (!iso) return "the end of your trial";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}