import { getUncachableStripeClient } from "./stripeClient";

/**
 * Idempotent seed for the single WorshipFlow Pro product + $9.99/mo price.
 *
 * Run with: pnpm --filter @workspace/scripts exec tsx src/seed-billing.ts
 *
 * Safe to run multiple times — it searches Stripe by name first.
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
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const monthly = prices.data.find(
    (p) =>
      p.recurring?.interval === "month" &&
      p.unit_amount === MONTHLY_AMOUNT_CENTS &&
      p.currency === "usd",
  );
  if (monthly) {
    console.log(`Monthly price already exists: ${monthly.id}`);
  } else {
    const created = await stripe.prices.create({
      product: product.id,
      unit_amount: MONTHLY_AMOUNT_CENTS,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log(`Created monthly price ${created.id}`);
  }

  console.log("Done. Webhooks will sync this to your local stripe schema.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
