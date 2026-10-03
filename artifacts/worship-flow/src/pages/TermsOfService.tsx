import { Link } from "wouter";
import { ArrowLeft, Flame } from "lucide-react";

export default function TermsOfService() {
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
          Terms of Service
        </h1>
        <p className="text-sm mb-12" style={{ color: 'var(--worship-muted-slate)' }}>
          Effective date: May 15, 2026 · Last updated: May 15, 2026
        </p>

        <div className="space-y-10 text-base leading-relaxed" style={{ color: 'var(--worship-slate)' }}>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              1. Acceptance of Terms
            </h2>
            <p>
              By creating an account or using Sunday Studio ("the Service"), you agree to these Terms
              of Service ("Terms"). If you do not agree, do not use the Service. These Terms form a
              binding agreement between you and Sunday Studio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              2. Description of Service
            </h2>
            <p>
              Sunday Studio is a ministry preparation platform that provides AI-assisted tools for
              sermon research and writing, service planning, liturgy drafting, song selection, and
              other church ministry tasks. The Service is intended for pastors, worship leaders,
              discipleship directors, and other church ministry professionals.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              3. Accounts
            </h2>
            <p className="mb-4">
              You must create an account to access most features. You are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Maintaining the confidentiality of your account credentials.</li>
              <li>All activity that occurs under your account.</li>
              <li>Providing accurate information when registering.</li>
            </ul>
            <p className="mt-4">
              You must be at least 18 years old to create an account. We reserve the right to
              terminate accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              4. Subscriptions and Billing
            </h2>
            <p className="mb-4">
              Sunday Studio is offered on a subscription basis. By subscribing, you agree to the
              following:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Free trial</strong> — A valid payment
                card is required to start a 14-day trial. You will not be charged during the trial.
                Unless you cancel before it ends, your card will be charged $9.99 and the subscription
                will renew monthly.
              </li>
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Billing</strong> — After the 14-day
                trial, continued access costs $9.99 per month. Billing is handled by Stripe and charged
                monthly until canceled.
              </li>
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Cancellation</strong> — You may cancel
                from the billing portal at any time. Cancel before the trial ends to avoid the first
                charge; after billing begins, access continues through the end of your current monthly
                billing period. We do not offer prorated refunds for partial periods.
              </li>
              <li>
                <strong style={{ color: 'var(--worship-navy)' }}>Price changes</strong> — We may change
                subscription pricing with at least 30 days' notice to your registered email address.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              5. Acceptable Use
            </h2>
            <p className="mb-4">You agree not to use Sunday Studio to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Generate content that is false, defamatory, or harmful to others.</li>
              <li>Violate any applicable laws or regulations.</li>
              <li>Attempt to gain unauthorized access to the Service or its infrastructure.</li>
              <li>Resell, sublicense, or commercially redistribute the Service without written permission.</li>
              <li>Use automated means to scrape, crawl, or extract content from the Service at scale.</li>
              <li>Impersonate any person or organization.</li>
            </ul>
            <p className="mt-4">
              We reserve the right to suspend or terminate your account if we determine, in our sole
              discretion, that you have violated these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              6. Your Content
            </h2>
            <p className="mb-4">
              You retain ownership of all content you create using Sunday Studio — your sermons, service
              plans, liturgy drafts, and other outputs. By using the Service, you grant us a limited,
              non-exclusive license to store and process your content solely to provide the Service to you.
            </p>
            <p>
              You are responsible for ensuring your inputs do not infringe third-party intellectual property
              rights. AI-generated outputs are provided as a starting point for your own ministry preparation
              and should be reviewed and adapted by you before use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              7. AI-Generated Content Disclaimer
            </h2>
            <p className="mb-4">
              Sunday Studio uses AI to assist with ministry preparation. Please be aware:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                AI-generated content may contain inaccuracies, omissions, or theological perspectives
                that differ from your tradition. Always review outputs before use.
              </li>
              <li>
                Sunday Studio is a tool to assist your preparation — it is not a replacement for your
                own pastoral judgment, theological training, or prayerful discernment.
              </li>
              <li>
                Commentary excerpts included in the Service are public-domain texts. We make no
                warranties about their completeness or current scholarly standing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              8. Third-Party Integrations
            </h2>
            <p>
              Sunday Studio integrates with third-party services including Planning Center Services,
              Stripe, Clerk, Anthropic, and Resend. Your use of these integrations is subject to each
              provider's own terms of service. We are not responsible for the availability, accuracy,
              or practices of third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              9. Intellectual Property
            </h2>
            <p>
              The Sunday Studio name, logo, product design, and underlying software are owned by Sunday
              Studio and protected by applicable intellectual property laws. Nothing in these Terms
              grants you a right to use our trademarks or branding without our prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              10. Disclaimers and Limitation of Liability
            </h2>
            <p className="mb-4">
              THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
              WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT AI-GENERATED
              CONTENT WILL BE ACCURATE OR SUITABLE FOR YOUR PURPOSES.
            </p>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY LAW, SUNDAY STUDIO'S LIABILITY FOR ANY CLAIM ARISING
              OUT OF YOUR USE OF THE SERVICE IS LIMITED TO THE AMOUNT YOU PAID US IN THE 12 MONTHS
              PRECEDING THE CLAIM. WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR
              CONSEQUENTIAL DAMAGES.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              11. Termination
            </h2>
            <p>
              Either party may terminate this agreement at any time. You may delete your account in
              your account settings. We may suspend or terminate your access for violation of these
              Terms, non-payment, or any other reason with reasonable notice. Upon termination, your
              right to use the Service ends and we will delete your data in accordance with our
              Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              12. Governing Law
            </h2>
            <p>
              These Terms are governed by the laws of the United States. Any disputes arising under
              these Terms will be resolved through binding arbitration in accordance with the American
              Arbitration Association's rules, except that either party may seek injunctive relief in
              a court of competent jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              13. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes by
              email or by posting a notice in the application. Continued use of the Service after
              changes take effect constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)', color: 'var(--worship-navy)' }}>
              14. Contact
            </h2>
            <p>
              Questions about these Terms? Contact us at{' '}
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
        <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
      </footer>
    </div>
  );
}
