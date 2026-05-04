import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { logger } from "./lib/logger";
import { getStripeSync, isStripeConfigured } from "./lib/stripeClient";
import { runTrialEmailCron } from "./lib/trialEmails";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Initialize Stripe schema + sync on startup.  Soft-fails when Stripe isn't
 * connected yet so the rest of the app keeps booting (trial users still
 * work; only paid features will show "Billing not configured").
 */
async function initStripe() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    logger.warn("DATABASE_URL missing; skipping Stripe init");
    return;
  }
  if (!(await isStripeConfigured())) {
    logger.warn(
      "Stripe integration not connected; skipping Stripe init. Connect Stripe to enable billing.",
    );
    return;
  }
  try {
    logger.info("Running stripe-replit-sync migrations");
    await runMigrations({ databaseUrl });
    const stripeSync = await getStripeSync();
    const replitDomains = process.env["REPLIT_DOMAINS"];
    if (replitDomains) {
      const base = `https://${replitDomains.split(",")[0]}`;
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${base}/api/stripe/webhook`,
      );
      logger.info(
        { url: (result as { url?: string } | null | undefined)?.url ?? "configured" },
        "Stripe webhook configured",
      );
    } else {
      logger.warn("REPLIT_DOMAINS missing; skipping managed webhook setup");
    }
    // Backfill in the background — don't block server boot.
    stripeSync
      .syncBackfill()
      .then(() => logger.info("Stripe data backfill complete"))
      .catch((err) => logger.error({ err }, "Stripe backfill failed"));
  } catch (err) {
    logger.error({ err }, "Stripe initialization failed; continuing without billing");
  }
}

await initStripe();

/**
 * Trial lifecycle email cron.
 * Runs once immediately on boot (catches any missed sends from downtime),
 * then every 24 hours. handle.unref() prevents the interval from keeping
 * the process alive in tests.
 */
function initTrialEmailCron() {
  const runSafe = () =>
    runTrialEmailCron().catch((err) =>
      logger.error({ err }, "Trial email cron failed"),
    );

  // Run once immediately (non-blocking — don't await so server boot isn't delayed)
  void runSafe();

  const handle = setInterval(runSafe, 24 * 60 * 60 * 1000);
  handle.unref();
  logger.info("Trial email cron scheduled (every 24 h)");
}

initTrialEmailCron();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
