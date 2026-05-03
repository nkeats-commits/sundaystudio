import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getUncachableStripeClient } from "./stripeClient";

/**
 * Idempotent seed for the single WorshipFlow Pro product + $9.99/mo price.
 *
 * Run with: pnpm --filter @workspace/scripts run seed-billing
 *
 * Safe to run multiple times — it searches Stripe by name first.
 *
 * After resolving the price id this script writes it to
 * `.local/billing-config.json` (relative to the repo root). The API
 * server reads this file as a deterministic source of truth so that
 * `/api/billing/checkout-session` no longer has to wait on the
 * stripe-replit-sync mirror to populate. The file is also a convenient
 * place for an operator to copy the value from when setting the
 * production `STRIPE_PRICE_ID` environment variable.
 */
const PRODUCT_NAME = "WorshipFlow Pro";
const MONTHLY_AMOUNT_CENTS = 999;

async function main() {
  const stripe = await getUncachableStripeClient();

  // 1) Find or create product
  const found = await stripe.products.search({
    query: `name:'${PRODUCT_NAME}' AND active:'true'`,
  });
  let product = found.data[0];
  if (!product) {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description:
        "Full access to every WorshipFlow generator, the Service Builder, " +
        "the Library, and the Sermon Builder. Cancel anytime.",
      metadata: { tier: "pro" },
    });
    console.log(`Created product ${product.id}`);
  } else {
    console.log(`Found existing product ${product.id}`);
  }

  // 2) Find or create the $9.99/month recurring price
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  let monthly = prices.data.find(
    (p) =>
      p.recurring?.interval === "month" &&
      p.unit_amount === MONTHLY_AMOUNT_CENTS &&
      p.currency === "usd",
  );
  if (monthly) {
    console.log(`Monthly price already exists: ${monthly.id}`);
  } else {
    monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: MONTHLY_AMOUNT_CENTS,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log(`Created monthly price ${monthly.id}`);
  }

  // 3) Persist the resolved ids to a config file the API server reads.
  // Path is relative to the repo root (where pnpm runs from), not this
  // script's __dirname, so it lands in the workspace's `.local/`.
  const configPath = resolve(process.cwd(), "../.local/billing-config.json");
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify(
      { productId: product.id, priceId: monthly.id, amountCents: MONTHLY_AMOUNT_CENTS, currency: "usd" },
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${configPath}`);
  console.log(
    "For production, also set the STRIPE_PRICE_ID environment variable to:",
    monthly.id,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
