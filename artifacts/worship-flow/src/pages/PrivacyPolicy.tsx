import { Link } from "wouter";
import { ArrowLeft, Flame } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--worship-cream)', color: 'var(--worship-navy)' }}>
      {/* Header */}
      <header
        className="border-b px-8 py-4 flex items-center justify-between"
        style={{ backgroundColor: 'var(--worship-white)', borderColor: 'var(--worship-border)' }}
      >
        <Link href="/" className="flex items-center gap-2">
          <Flame className="w-5 h-5" style={{ color: 'var(--worship-gold)' }} />
          <span className="font-semibold text-lg" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
            Sunday Studio
          </span>
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm hover:underline"
          style={{ color: 'var(--worship-muted-slate)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-8 py-16">
        <p className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--worship-gold)' }}>
          Legal
        </p>
        <h1
          className="text-4xl font-medium mb-3"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}
        >
          Privacy Policy
        </h1>
        <p className="text-sm mb-12" style={{ color: 'var(--worship-muted-slate)' }}>
          Effective date: May 15, 2026 · Last updated: May 15, 2026
        </p>

        <div className="prose-worship space-y-10 text-base leading-relaxed" style={{ color: 'var(--worship-slate)' }}>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              1. Who We Are
            </h2>
            <p>
              Sunday Studio ("we," "our," or "us") is a ministry preparation platform designed for
              pastors, worship leaders, and church teams. This Privacy Policy explains how we collect,
              use, and protect your information when you use our service at{' '}
              <a
                href="https://sundaystudio.app"
                className="underline"
                style={{ color: 'var(--worship-navy)' }}
              >
                sundaystudio.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              2. Information We Collect
            </h2>
            <p className="mb-4">We collect the following categories of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Account information</strong> — your name,
                email address, and authentication credentials managed through Clerk.
              </li>
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Church profile data</strong> — the church
                name, denomination, theology, and other profile details you choose to provide to personalize
                your experience.
              </li>
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Content you create</strong> — service
                plans, sermons, liturgy drafts, song lists, devotionals, and other content generated or
                saved within Sunday Studio.
              </li>
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Integration data</strong> — if you
                connect Planning Center Services, we access your song library and service type information
                to power the sync feature. We do not store your Planning Center password.
              </li>
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Usage and log data</strong> — pages
                visited, features used, and error logs. This data is used to improve the product and
                diagnose issues.
              </li>
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Payment information</strong> — billing
                is handled entirely by Stripe. We do not store your credit card number or payment details.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              3. How We Use Your Information
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide, personalize, and improve the Sunday Studio service.</li>
              <li>To generate AI-assisted content tailored to your church, theology, and voice.</li>
              <li>To process payments and manage your subscription.</li>
              <li>To send transactional emails (account notices, trial reminders) via Resend.</li>
              <li>To diagnose errors and maintain the security of the platform.</li>
            </ul>
            <p className="mt-4">
              We do not sell your personal data. We do not use your sermon or service plan content to
              train AI models without your explicit consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              4. AI-Generated Content
            </h2>
            <p className="mb-4">
              Sunday Studio uses Anthropic's Claude to generate content. When you use a generator, your
              inputs (theme, scripture, church context) are sent to Anthropic's API to produce a response.
              This processing is governed by{' '}
              <a
                href="https://www.anthropic.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: 'var(--worship-navy)' }}
              >
                Anthropic's Privacy Policy
              </a>
              .
            </p>
            <p>
              We include scholarly commentary excerpts (public-domain sources) in certain sermon
              generation prompts to ground the output. These are pre-loaded texts — no personal data
              is included in that context.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              5. Third-Party Services
            </h2>
            <p className="mb-4">We use the following third-party services to operate Sunday Studio:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong style={{ color: 'var(--worship-navy)' }}>Clerk</strong> — authentication and user management</li>
              <li><strong style={{ color: 'var(--worship-navy)' }}>Stripe</strong> — payment processing</li>
              <li><strong style={{ color: 'var(--worship-navy)' }}>Anthropic</strong> — AI content generation</li>
              <li><strong style={{ color: 'var(--worship-navy)' }}>Resend</strong> — transactional email</li>
              <li><strong style={{ color: 'var(--worship-navy)' }}>Planning Center</strong> — optional song library sync</li>
              <li><strong style={{ color: 'var(--worship-navy)' }}>Replit</strong> — hosting and infrastructure</li>
            </ul>
            <p className="mt-4">
              Each provider processes data according to their own privacy policies. We choose providers
              with strong privacy commitments and SOC 2 compliance where available.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              6. Data Retention
            </h2>
            <p>
              We retain your account data and content as long as your account is active. If you delete
              your account, we will delete your personal data and content within 30 days, except where
              we are required to retain it for legal or financial record-keeping purposes (such as
              billing history).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              7. Your Rights
            </h2>
            <p className="mb-4">Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your data.</li>
              <li>Object to or restrict certain processing.</li>
              <li>Export your data in a portable format.</li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:hello@sundaystudio.app" className="underline" style={{ color: 'var(--worship-navy)' }}>
                hello@sundaystudio.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              8. Security
            </h2>
            <p>
              We use HTTPS for all data in transit, encrypted database connections, and token-based
              authentication. Access tokens for third-party integrations (like Planning Center) are
              stored encrypted. We follow industry-standard practices to protect your data, but no
              system is perfectly secure — please use a strong, unique password for your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              9. Children
            </h2>
            <p>
              Sunday Studio is intended for adults (18+) and church ministry professionals. We do not
              knowingly collect personal information from children under 13. If you believe a child has
              created an account, please contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              10. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will update the
              "Last updated" date above and, for material changes, notify you by email. Continued use
              of Sunday Studio after any change constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              11. Contact
            </h2>
            <p>
              Questions about this Privacy Policy? Reach us at{' '}
              <a href="mailto:hello@sundaystudio.app" className="underline" style={{ color: 'var(--worship-navy)' }}>
                hello@sundaystudio.app
              </a>
              .
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer
        className="border-t mt-16 px-8 py-8 text-sm text-center"
        style={{ borderColor: 'var(--worship-border)', color: 'var(--worship-muted-slate)' }}
      >
        <span>© {new Date().getFullYear()} Sunday Studio · Built for the Church.</span>
        <span className="mx-4">·</span>
        <Link href="/terms" className="hover:underline">Terms of Service</Link>
      </footer>
    </div>
  );
}
