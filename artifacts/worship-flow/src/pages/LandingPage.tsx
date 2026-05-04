import {
  Flame,
  ChevronRight,
  Music,
  Mic,
  Users,
  BookOpen,
  Layers,
  Heart,
  FileText,
  Link2,
  Check,
  ArrowRight,
  Clock,
  Lightbulb,
  Shield,
} from 'lucide-react';
import { Link } from 'wouter';

const ROLES = [
  { label: 'Teaching Pastors', color: 'var(--worship-navy)' },
  { label: 'Worship Leaders', color: 'var(--worship-gold)' },
  { label: 'Discipleship Pastors', color: 'var(--worship-muted-green)' },
  { label: 'Lay Leaders', color: 'var(--worship-slate)' },
];

const FEATURES = [
  {
    icon: FileText,
    title: 'Sermon Builder',
    desc: 'Research and write sermons with integrated biblical commentary, cross-references, and series planning — all in one place.',
    badge: 'Teaching',
  },
  {
    icon: Layers,
    title: 'Service Builder',
    desc: 'Design complete orders of worship from blank canvas to final flow — transitions, cues, and everything in between.',
    badge: 'Worship',
  },
  {
    icon: BookOpen,
    title: 'Liturgy Generator',
    desc: 'Write calls to worship, prayers, benedictions, and responsive readings that fit your text and tradition.',
    badge: 'Worship',
  },
  {
    icon: Music,
    title: 'Song Assistant',
    desc: 'Find the right songs by scripture, theme, and season — filtered to what actually fits your congregation.',
    badge: 'Worship',
  },
  {
    icon: Mic,
    title: 'Speaking Moments',
    desc: 'Script communion, offering, and pastoral transitions that feel natural — never canned or generic.',
    badge: 'All',
  },
  {
    icon: Users,
    title: 'Team Devotionals',
    desc: 'Prepare your volunteers and team members spiritually before they step onto the stage or into the room.',
    badge: 'Discipleship',
  },
  {
    icon: Heart,
    title: 'Soul Care',
    desc: 'Formation content for leaders carrying heavy callings. Because the shepherd needs tending too.',
    badge: 'All',
  },
  {
    icon: Link2,
    title: 'Planning Center Sync',
    desc: 'Push your finalized service plans directly to Planning Center Services. No copy-pasting, no re-entry.',
    badge: 'Workflow',
  },
];

const BADGE_COLORS: Record<string, string> = {
  Teaching: '#1F2A44',
  Worship: '#C99A3D',
  Discipleship: '#6E8B74',
  All: '#475569',
  Workflow: '#64748B',
};

export default function LandingPage() {
  return (
    <div className="worship-theme min-h-screen flex flex-col" style={{ backgroundColor: 'var(--worship-cream)' }}>
      {/* ── Navbar ── */}
      <nav
        className="flex items-center justify-between px-8 py-5 sticky top-0 z-50"
        style={{ backgroundColor: 'var(--worship-cream)', borderBottom: '1px solid var(--worship-border)' }}
      >
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5" style={{ color: 'var(--worship-gold)' }} />
          <span
            className="text-xl font-semibold tracking-tight"
            style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
          >
            WorshipFlow
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/sign-in"
            className="text-sm font-medium hidden sm:block"
            style={{ color: 'var(--worship-slate)' }}
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="px-5 py-2.5 rounded-full text-sm font-semibold worship-btn-primary"
          >
            Start free trial
          </Link>
        </div>
      </nav>
      {/* ── Hero — Character + Stakes ── */}
      <section className="relative overflow-hidden" style={{ backgroundColor: 'var(--worship-cream)' }}>
        <div className="max-w-7xl mx-auto px-8 py-20 lg:py-28 grid lg:grid-cols-2 gap-16 items-center">

          {/* Left: copy */}
          <div>
            {/* Audience badges */}
            <div className="flex flex-wrap gap-2 mb-8">
              {ROLES.map((r) => (
                <span
                  key={r.label}
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--worship-white)', color: r.color, border: '1px solid var(--worship-border)' }}
                >
                  {r.label}
                </span>
              ))}
            </div>

            <h1
              className="text-5xl lg:text-6xl font-medium leading-tight mb-6"
              style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
            >
              <span style={{ color: 'var(--worship-navy)' }}>Lead your people well </span>
              <span style={{ color: 'var(--worship-gold)' }}>in a fraction of the time.</span>
            </h1>

            <p className="text-lg leading-relaxed mb-10" style={{ color: 'var(--worship-slate)' }}>
              WorshipFlow gives teaching pastors, worship leaders, discipleship directors, and lay leaders AI-powered tools to prepare deeply — without giving up every free hour you have.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-base font-semibold worship-btn-primary shadow-lg"
              >
                Start Planning Free <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-base font-medium"
                style={{ backgroundColor: 'var(--worship-white)', color: 'var(--worship-navy)', border: '1px solid var(--worship-border)' }}
              >
                Sign In
              </Link>
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {['14-day free trial', 'No card required', 'Cancel anytime'].map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm" style={{ color: 'var(--worship-muted-slate)' }}>
                  <Check className="w-4 h-4" style={{ color: 'var(--worship-gold)' }} />
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Right: hero photo */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl" style={{ aspectRatio: '4/3' }}>
              <img
                src="https://images.pexels.com/photos/34612687/pexels-photo-34612687.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Person in worship"
                className="w-full h-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top right, rgba(31,42,68,0.25) 0%, transparent 60%)' }}
              />
            </div>
            <div
              className="absolute -bottom-6 -left-6 rounded-2xl px-5 py-4 shadow-xl"
              style={{ backgroundColor: 'var(--worship-white)', border: '1px solid var(--worship-border)' }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--worship-muted-slate)' }}>Average time saved weekly</p>
              <p className="text-lg font-bold" style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}>
                6–10 hours <span style={{ color: 'var(--worship-gold)' }}>✓</span>
              </p>
            </div>
          </div>
        </div>
      </section>
      {/* ── Problem — External + Internal + Philosophical ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-white)' }}>
        <div className="max-w-4xl mx-auto">
          <p
            className="text-center text-sm font-semibold uppercase tracking-widest mb-6"
            style={{ color: 'var(--worship-gold)' }}
          >
            The problem
          </p>
          <h2
            className="text-4xl lg:text-5xl font-medium text-center mb-16"
            style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
          >
            You carry a sacred calling. Your tools shouldn't make it harder.
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Clock,
                headline: 'Too much time, not enough depth',
                body: 'Sermon research pulls you into a dozen tabs. Service planning means a dozen spreadsheets. And it all has to happen again next week.',
              },
              {
                icon: Lightbulb,
                headline: 'The gap between good and great',
                body: 'You know what excellent ministry looks like — and you also know the distance between that and what you had time to prepare.',
              },
              {
                icon: Shield,
                headline: 'Your calling deserves better',
                body: 'Ministry leaders shouldn\'t have to choose between doing their best work and protecting their family, their health, and their soul.',
              },
            ].map(({ icon: Icon, headline, body }) => (
              <div
                key={headline}
                className="rounded-2xl p-7"
                style={{ backgroundColor: 'var(--worship-cream)', border: '1px solid var(--worship-border)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: 'var(--worship-pale-gold)' }}
                >
                  <Icon className="w-5 h-5" style={{ color: 'var(--worship-gold)' }} />
                </div>
                <h3
                  className="text-base font-semibold mb-3"
                  style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-sans)' }}
                >
                  {headline}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--worship-slate)' }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── Guide — Empathy + Authority ── */}
      <section className="py-24 px-8 overflow-hidden" style={{ backgroundColor: 'var(--worship-cream)' }}>
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          {/* Photo */}
          <div className="relative rounded-3xl overflow-hidden shadow-xl" style={{ aspectRatio: '4/3' }}>
            <img
              src="https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=1200&q=80"
              alt="Leader studying scripture"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(31,42,68,0.35))' }} />
          </div>

          {/* Copy */}
          <div>
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-6"
              style={{ color: 'var(--worship-gold)' }}
            >WorshipFlow is here to help</p>
            <h2
              className="text-4xl font-medium mb-5"
              style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
            >
              Built for every leader who prepares people to encounter God.
            </h2>
            <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--worship-slate)' }}>
              We know what it feels like to walk into Sunday with more preparation to do than time allows. WorshipFlow was built by ministry leaders, for ministry leaders — combining AI with the structure your specific role actually needs, so your best work happens more often.
            </p>
            <ul className="space-y-4">
              {[
                'Sermon Builder with biblical commentary and cross-references',
                'Worship planning from song selection to benediction',
                'Discipleship content and team devotionals',
                'Soul care tools for the leader, not just the program',
                'Planning Center integration — one less system to juggle',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: 'var(--worship-pale-gold)' }}
                  >
                    <Check className="w-3 h-3" style={{ color: 'var(--worship-gold)' }} />
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: 'var(--worship-charcoal)' }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      {/* ── All Features ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-white)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-4"
              style={{ color: 'var(--worship-gold)' }}
            >
              The full toolkit
            </p>
            <h2
              className="text-4xl font-medium mb-4"
              style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
            >Everything you need to thrive. In one workspace.</h2>
            <p className="text-base max-w-2xl mx-auto" style={{ color: 'var(--worship-slate)' }}>
              Whether you're writing a sermon, planning a service, preparing your team, or simply trying to stay grounded — WorshipFlow has the tool.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, badge }) => (
              <div
                key={title}
                className="rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1 flex flex-col"
                style={{ backgroundColor: 'var(--worship-cream)', border: '1px solid var(--worship-border)' }}
              >
                <div className="flex items-start justify-between mb-5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'var(--worship-pale-gold)' }}
                  >
                    <Icon className="w-5 h-5" style={{ color: 'var(--worship-gold)' }} />
                  </div>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: BADGE_COLORS[badge] + '18', color: BADGE_COLORS[badge] }}
                  >
                    {badge}
                  </span>
                </div>
                <h3
                  className="text-base font-semibold mb-2"
                  style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-sans)' }}
                >
                  {title}
                </h3>
                <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--worship-slate)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── Full-bleed photo band ── */}
      <section className="relative overflow-hidden" style={{ minHeight: '440px' }}>
        <img
          src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1920&q=80"
          alt="Congregation in worship"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, rgba(31,42,68,0.90) 0%, rgba(31,42,68,0.65) 55%, rgba(31,42,68,0.15) 100%)' }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-8 py-24 flex items-center" style={{ minHeight: '440px' }}>
          <div className="max-w-lg">
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-4"
              style={{ color: 'var(--worship-gold)' }}
            >
              The vision
            </p>
            <h2
              className="text-4xl font-medium mb-6"
              style={{ fontFamily: 'var(--font-serif)', color: '#ffffff' }}
            >
              Imagine walking into Sunday morning fully ready.
            </h2>
            <p className="text-lg leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.8)' }}>
              No last-minute scramble. No half-finished notes. Just a leader who prepared well — and has energy left to actually be present with their people.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold worship-btn-gold shadow-xl"
            >
              Start your free trial <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
      {/* ── Plan — How it works ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-navy)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-4"
              style={{ color: 'var(--worship-gold)' }}
            >
              The plan
            </p>
            <h2
              className="text-4xl font-medium"
              style={{ fontFamily: 'var(--font-serif)', color: '#ffffff' }}
            >
              Three steps to leading well.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                step: '1',
                title: 'Set your context',
                desc: 'Tell WorshipFlow what you\'re preparing — a sermon, a service, a team devotional. Add your scripture, theme, and tradition.',
              },
              {
                step: '2',
                title: 'Generate with depth',
                desc: 'In seconds, get a full draft: songs, liturgy, commentary, speaking moments, or a sermon outline — tailored to you.',
              },
              {
                step: '3',
                title: 'Refine and lead',
                desc: 'Edit what you want, keep what\'s good. Export to Planning Center or your own format. Walk in ready.',
              },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mb-6"
                  style={{ backgroundColor: 'var(--worship-gold)', color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
                >
                  {s.step}
                </div>
                <h3 className="text-lg font-semibold mb-3" style={{ color: '#ffffff' }}>{s.title}</h3>
                <p style={{ color: 'rgba(255,255,255,0.62)', lineHeight: '1.75' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── Success + Failure stakes ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-cream)' }}>
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8">
          {/* Success */}
          <div
            className="rounded-3xl p-8"
            style={{ backgroundColor: 'var(--worship-white)', border: '1px solid var(--worship-border)' }}
          >
            <p
              className="text-xs font-bold uppercase tracking-widest mb-6"
              style={{ color: 'var(--worship-muted-green)' }}
            >
              With WorshipFlow
            </p>
            <h3
              className="text-2xl font-medium mb-6"
              style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
            >
              Your ministry is what you always hoped it could be.
            </h3>
            <ul className="space-y-4">
              {[
                'Deep, researched sermons without the all-nighters',
                'Worship services that flow from Scripture to benediction',
                'A team that\'s spiritually prepared, not just logistically briefed',
                'Hours back every week to give to people, not prep',
                'A soul that\'s tended, not just a calendar that\'s full',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: '#3F6B4F22' }}
                  >
                    <Check className="w-3 h-3" style={{ color: 'var(--worship-muted-green)' }} />
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: 'var(--worship-charcoal)' }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Failure */}
          <div
            className="rounded-3xl p-8"
            style={{ backgroundColor: '#1F2A440A', border: '1px solid var(--worship-border)' }}
          >
            <p
              className="text-xs font-bold uppercase tracking-widest mb-6"
              style={{ color: 'var(--worship-muted-slate)' }}
            >
              Without it
            </p>
            <h3
              className="text-2xl font-medium mb-6"
              style={{ color: 'var(--worship-charcoal)', fontFamily: 'var(--font-serif)' }}
            >
              Another week of starting from scratch.
            </h3>
            <ul className="space-y-4">
              {[
                'Hours lost to scattered research and open tabs',
                'Services that feel assembled, not crafted',
                'Teams that are organized but not spiritually led',
                'Another Sunday where you wish you\'d had more time',
                'A leader running on empty — week after week',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 opacity-70">
                  <span className="text-sm mt-0.5" style={{ color: 'var(--worship-slate)' }}>—</span>
                  <span className="text-sm leading-relaxed" style={{ color: 'var(--worship-slate)' }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      {/* ── CTA ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-white)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8"
            style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-navy)' }}
          >
            One plan · Everything included
          </div>
          <h2
            className="text-5xl font-medium mb-5"
            style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
          >
            Your best ministry is closer than you think.
          </h2>
          <p className="text-lg mb-3" style={{ color: 'var(--worship-slate)' }}>
            Try WorshipFlow free for 14 days. Then just{' '}
            <strong style={{ color: 'var(--worship-navy)' }}>$9.99/month</strong> — for everything.
          </p>
          <p className="text-sm mb-10" style={{ color: 'var(--worship-muted-slate)' }}>
            No card required to start. Cancel any time.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 px-10 py-4 rounded-full text-lg font-semibold worship-btn-primary shadow-xl"
            >
              Start Planning Free <ChevronRight className="w-5 h-5" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-medium"
              style={{ color: 'var(--worship-slate)' }}
            >
              Already have an account <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
      {/* ── Footer ── */}
      <footer
        className="py-10 px-8"
        style={{ backgroundColor: 'var(--worship-cream)', borderTop: '1px solid var(--worship-border)' }}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4" style={{ color: 'var(--worship-gold)' }} />
            <span
              className="font-semibold"
              style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
            >
              WorshipFlow
            </span>
            <span className="text-sm ml-2" style={{ color: 'var(--worship-muted-slate)' }}>
              © {new Date().getFullYear()} · Built for the Church.
            </span>
          </div>
          <div className="flex gap-8 text-sm" style={{ color: 'var(--worship-muted-slate)' }}>
            <span className="hover:underline cursor-pointer">Privacy</span>
            <span className="hover:underline cursor-pointer">Terms</span>
            <span className="hover:underline cursor-pointer">Contact</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
