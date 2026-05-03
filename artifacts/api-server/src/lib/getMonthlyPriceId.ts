import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const PRODUCT_NAME = "WorshipFlow Pro";

let _cachedConfigPriceId: string | null | undefined;
function getPriceIdFromConfigFile(): string | null {
  if (_cachedConfigPriceId !== undefined) return _cachedConfigPriceId;
  try {
    const configPath = resolve(
      process.cwd(),
      "../../.local/billing-config.json",
    );
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as { priceId?: unknown };
    _cachedConfigPriceId =
      typeof parsed.priceId === "string" ? parsed.priceId : null;
  } catch {
    _cachedConfigPriceId = null;
  }
  return _cachedConfigPriceId;
}

/**
 * Resolve the monthly Stripe price id for our single product.
 *
 * Sources, in order:
 *   1. `STRIPE_PRICE_ID` env var (preferred — printed by the seed script).
 *   2. `.local/billing-config.json` (written by the seed script for dev).
 *   3. The Stripe mirror tables matched by product name + monthly interval.
 *
 * Shared between the user-facing checkout flow (`routes/billing.ts`) and the
 * owner-only comp-subscription action (`routes/admin.ts`) so both look up
 * the price the same way.
 */
export async function getMonthlyPriceId(): Promise<string | null> {
  const fromEnv = process.env["STRIPE_PRICE_ID"]?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = getPriceIdFromConfigFile();
  if (fromFile) return fromFile;
  try {
    const result = await db.execute(sql`
      SELECT pr.id AS price_id
      FROM stripe.prices pr
      JOIN stripe.products p ON p.id = pr.product
      WHERE p.active = true
        AND pr.active = true
        AND p.name = ${PRODUCT_NAME}
        AND pr.recurring->>'interval' = 'month'
      ORDER BY pr.created DESC
      LIMIT 1
    `);
    const row = result.rows[0] as { price_id?: string } | undefined;
    return row?.price_id ?? null;
  } catch {
    return null;
  }
}
