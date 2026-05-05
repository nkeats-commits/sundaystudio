/**
 * Brand-consistent HTML email templates for trial lifecycle emails.
 *
 * All styles are inline — email clients strip <style> tags.
 * Font stack: Georgia (web-safe serif) mirrors Playfair Display.
 */

const NAVY = "#1F2A44";
const GOLD = "#C99A3D";
const CREAM = "#F8F4EA";
const PALE_GOLD = "#F3E7C6";
const SLATE = "#475569";
const WHITE = "#FFFDF8";

function wrap(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sunday Studio</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${WHITE};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background-color:${NAVY};padding:28px 40px;text-align:center;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:${WHITE};letter-spacing:-0.3px;">
                🔥 Sunday Studio
              </span>
            </td>
          </tr>

          <!-- Body -->
          ${body}

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;border-top:1px solid #E5E1D8;">
              <p style="margin:0;font-size:12px;color:${SLATE};line-height:1.6;">
                Sunday Studio · Built for the Church<br/>
                You're receiving this because you signed up for a free trial.<br/>
                To stop receiving these emails, reply with "unsubscribe".
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface TrialEmailData {
  firstName?: string | null;
  pricingUrl: string;
}

/** Day-11 reminder: 3 days left in trial */
export function trialReminderHtml({ firstName, pricingUrl }: TrialEmailData): string {
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  return wrap(`
    <!-- Main content -->
    <tr>
      <td style="padding:40px 40px 8px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">
          Your trial ends in 3 days
        </p>
        <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;color:${NAVY};line-height:1.3;">
          You've got 3 days left to lead well — don't let that stop.
        </h1>
        <p style="margin:0 0 16px;font-size:16px;color:${SLATE};line-height:1.7;">
          ${greeting}
        </p>
        <p style="margin:0 0 16px;font-size:16px;color:${SLATE};line-height:1.7;">
          Your Sunday Studio free trial wraps up in 3 days. If you've been using it to plan services, write sermons, or prepare your team — you know how much time it saves.
        </p>
        <p style="margin:0 0 32px;font-size:16px;color:${SLATE};line-height:1.7;">
          Subscribe now for <strong style="color:${NAVY};">$9.99/month</strong> and keep everything — your service plans, sermons, liturgy, devotionals, and soul care — right where you left it.
        </p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
          <tr>
            <td style="background-color:${NAVY};border-radius:50px;padding:0;">
              <a href="${pricingUrl}"
                 style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${WHITE};text-decoration:none;border-radius:50px;">
                Subscribe — $9.99/month →
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 12px;font-size:14px;color:${SLATE};line-height:1.6;">
          <strong style="color:${NAVY};">What you keep with a subscription:</strong>
        </p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;width:100%;">
          ${[
            "Unlimited service plans + AI generators",
            "Sermon Builder with biblical commentary & cross-references",
            "Liturgy, songs, speaking moments, devotionals, soul care",
            "Planning Center Services integration",
            "All your saved plans and content",
          ]
            .map(
              (f) => `
          <tr>
            <td style="padding:6px 0;vertical-align:top;">
              <span style="display:inline-block;width:20px;color:${GOLD};font-weight:700;">✓</span>
              <span style="font-size:14px;color:${SLATE};">${f}</span>
            </td>
          </tr>`,
            )
            .join("")}
        </table>
        <p style="margin:0 0 40px;font-size:13px;color:${SLATE};line-height:1.6;">
          No card required during your trial. Cancel any time from your billing portal.
        </p>
      </td>
    </tr>
    <!-- Gold accent strip -->
    <tr>
      <td style="padding:0 40px 40px;">
        <div style="background-color:${PALE_GOLD};border-radius:12px;padding:20px 24px;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:${NAVY};line-height:1.6;font-style:italic;">
            "Your best ministry is closer than you think."
          </p>
        </div>
      </td>
    </tr>
  `);
}

/** Day-14+ expiry: trial has ended */
export function trialExpiredHtml({ firstName, pricingUrl }: TrialEmailData): string {
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  return wrap(`
    <!-- Main content -->
    <tr>
      <td style="padding:40px 40px 8px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${SLATE};">
          Your trial has ended
        </p>
        <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;color:${NAVY};line-height:1.3;">
          Your people still need you on Sunday.
        </h1>
        <p style="margin:0 0 16px;font-size:16px;color:${SLATE};line-height:1.7;">
          ${greeting}
        </p>
        <p style="margin:0 0 16px;font-size:16px;color:${SLATE};line-height:1.7;">
          Your Sunday Studio trial has ended. Your saved plans and content are safe — you just won't be able to generate new content or create new services until you subscribe.
        </p>
        <p style="margin:0 0 32px;font-size:16px;color:${SLATE};line-height:1.7;">
          Subscribe for <strong style="color:${NAVY};">$9.99/month</strong> and pick up right where you left off. No new setup. No lost work.
        </p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
          <tr>
            <td style="background-color:${GOLD};border-radius:50px;padding:0;">
              <a href="${pricingUrl}"
                 style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${WHITE};text-decoration:none;border-radius:50px;">
                Subscribe Now →
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 40px;font-size:13px;color:${SLATE};line-height:1.6;">
          Cancel any time · Secure checkout via Stripe · $9.99/month
        </p>
      </td>
    </tr>
    <!-- Gold accent strip -->
    <tr>
      <td style="padding:0 40px 40px;">
        <div style="background-color:${PALE_GOLD};border-radius:12px;padding:20px 24px;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:${NAVY};line-height:1.6;font-style:italic;">
            "Plan worship with depth, not panic."
          </p>
        </div>
      </td>
    </tr>
  `);
}

export function trialReminderText({ firstName, pricingUrl }: TrialEmailData): string {
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  return `${greeting}

Your Sunday Studio free trial ends in 3 days.

Subscribe now for $9.99/month to keep your service plans, sermons, liturgy, devotionals, and soul care tools — right where you left them.

Subscribe here: ${pricingUrl}

No card was required during your trial. Cancel any time.

— The Sunday Studio Team`;
}

export function trialExpiredText({ firstName, pricingUrl }: TrialEmailData): string {
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  return `${greeting}

Your Sunday Studio free trial has ended.

Your saved content is still here — you just won't be able to generate new content until you subscribe. Subscribe for $9.99/month to pick up right where you left off.

Subscribe here: ${pricingUrl}

Cancel any time. Secure checkout via Stripe.

— The Sunday Studio Team`;
}
