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
} from 'lucide-react';
import { Link } from 'wouter';

const FEATURES = [
  {
    icon: Layers,
    title: 'Service Builder',
    desc: 'Design complete orders of worship — flow, transitions, and cues — from a single canvas.',
  },
  {
    icon: BookOpen,
    title: 'Liturgy Generator',
    desc: 'Write calls to worship, prayers, benedictions, and responsive readings in seconds.',
  },
  {
    icon: Music,
    title: 'Song Assistant',
    desc: 'Discover songs by scripture, theme, or season — filtered to your tradition.',
  },
  {
    icon: Mic,
    title: 'Speaking Moments',
    desc: 'Script communion, offering, and pastoral transitions that feel natural, not canned.',
  },
  {
    icon: Users,
    title: 'Team Devotionals',
    desc: 'Send theologically rich devotionals that spiritually prepare your team before they set foot on stage.',
  },
  {
    icon: Heart,
    title: 'Soul Care',
    desc: 'Formation content for leaders carrying heavy callings — not just sermon prep tools.',
  },
  {
    icon: FileText,
    title: 'Sermon Builder',
    desc: 'Research, outline, and write sermons with integrated biblical commentary and cross-references.',
  },
  {
    icon: Link2,
    title: 'Planning Center Sync',
    desc: 'Push finalized service plans directly to Planning Center Services — no copy-pasting.',
  },
];

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

      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ backgroundColor: 'var(--worship-cream)' }}>
        <div className="max-w-7xl mx-auto px-8 py-20 lg:py-28 grid lg:grid-cols-2 gap-16 items-center">

          {/* Left: copy */}
          <div>
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8"
              style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-navy)' }}
            >
              <span style={{ color: 'var(--worship-gold)' }}>✦</span>
              14-day free trial · No card required
            </div>

            <h1
              className="text-5xl lg:text-6xl font-medium leading-tight mb-6"
              style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
            >
              Plan worship with depth,{' '}
              <span style={{ color: 'var(--worship-gold)' }}>not panic.</span>
            </h1>

            <p className="text-lg leading-relaxed mb-10" style={{ color: 'var(--worship-slate)' }}>
              AI-powered tools for liturgy, songs, devotionals, sermon prep, and service flow — built for worship pastors and creative teams who want more than a song list.
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

            {/* Trust signals */}
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {[
                'Service Builder',
                'Sermon Builder',
                'Planning Center Sync',
                'Soul Care',
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--worship-muted-slate)' }}>
                  <Check className="w-4 h-4" style={{ color: 'var(--worship-gold)' }} />
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Right: hero photo */}
          <div className="relative hidden lg:block">
            <div
              className="relative rounded-3xl overflow-hidden shadow-2xl"
              style={{ aspectRatio: '4/3' }}
            >
              <img
                src="https://images.pexels.com/photos/17030042/pexels-photo-17030042/free-photo-of-a-group-of-people-standing-in-a-room-with-their-hands-raised.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Congregation in worship"
                className="w-full h-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top right, rgba(31,42,68,0.25) 0%, transparent 60%)' }}
              />
            </div>
            {/* Floating badge */}
            <div
              className="absolute -bottom-6 -left-6 rounded-2xl px-5 py-4 shadow-xl"
              style={{ backgroundColor: 'var(--worship-white)', border: '1px solid var(--worship-border)' }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--worship-muted-slate)' }}>
                This Sunday's service
              </p>
              <p className="text-sm font-semibold" style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}>
                Ready in 20 minutes ✓
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-white)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2
            className="text-4xl lg:text-5xl font-medium mb-6"
            style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
          >
            You're not just picking songs.{' '}
            <br className="hidden md:block" />
            You're pastoring a room.
          </h2>
          <p className="text-lg leading-relaxed" style={{ color: 'var(--worship-slate)' }}>
            Every Sunday matters. But the pressure of planning week after week can turn a sacred calling into a frantic scramble. WorshipFlow moves you from scattered ideas to theologically rich, cohesive service plans — so you can lead with peace, presence, and purpose.
          </p>
        </div>
      </section>

      {/* ── Sermon Builder Spotlight ── */}
      <section className="py-24 px-8 overflow-hidden" style={{ backgroundColor: 'var(--worship-cream)' }}>
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          {/* Photo */}
          <div className="relative rounded-3xl overflow-hidden shadow-xl" style={{ aspectRatio: '4/3' }}>
            <img
              src="https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=1200&q=80"
              alt="Pastor studying scripture"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(31,42,68,0.4))' }} />
          </div>

          {/* Copy */}
          <div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase mb-6"
              style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-gold)' }}
            >
              New · Sermon Builder
            </div>
            <h2
              className="text-4xl font-medium mb-5"
              style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
            >
              Preach with depth, not just bullet points.
            </h2>
            <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--worship-slate)' }}>
              The Sermon Builder brings biblical commentary, cross-references, and structured outlines right into your writing environment. Research and write in the same place — no more switching between tabs.
            </p>
            <ul className="space-y-4 mb-10">
              {[
                'Integrated Barnes, Matthew Henry, and Pulpit Commentary',
                'Outline builder with scripture-linked sections',
                'Series planning and sermon archive',
                'Resource library for ongoing research',
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
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 text-sm font-semibold"
              style={{ color: 'var(--worship-navy)' }}
            >
              Try the Sermon Builder free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── All Features ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-white)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="text-4xl font-medium mb-4"
              style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
            >
              Everything your team needs, in one place.
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--worship-slate)' }}>
              Purpose-built tools for worship pastors, creative directors, and the whole planning team.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1"
                style={{ backgroundColor: 'var(--worship-cream)', border: '1px solid var(--worship-border)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: 'var(--worship-pale-gold)' }}
                >
                  <Icon className="w-5 h-5" style={{ color: 'var(--worship-gold)' }} />
                </div>
                <h3
                  className="text-base font-semibold mb-2"
                  style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-sans)' }}
                >
                  {title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--worship-slate)' }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Worship Team Photo Section ── */}
      <section className="relative overflow-hidden" style={{ minHeight: '420px' }}>
        <img
          src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1920&q=80"
          alt="Worship band on stage"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, rgba(31,42,68,0.88) 0%, rgba(31,42,68,0.6) 60%, rgba(31,42,68,0.2) 100%)' }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-8 py-24 flex items-center" style={{ minHeight: '420px' }}>
          <div className="max-w-xl">
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-4"
              style={{ color: 'var(--worship-gold)' }}
            >
              Built for the whole creative team
            </p>
            <h2
              className="text-4xl font-medium text-white mb-6"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              One workspace from worship set to sermon close.
            </h2>
            <p className="text-lg leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Whether you're a solo worship pastor or leading a full creative team, WorshipFlow keeps everyone aligned — from song selection to speaking moments to the closing benediction.
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

      {/* ── How it works ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-navy)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="text-4xl font-medium text-white mb-4"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              From blank page to Sunday ready.
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)' }}>Three steps. One workspace.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                step: '1',
                title: 'Set your context',
                desc: 'Enter the sermon topic, scripture, and your church\'s tradition. WorshipFlow learns your voice.',
              },
              {
                step: '2',
                title: 'Generate with intention',
                desc: 'Songs, liturgy, speaking moments, devotionals — generated in seconds and fully editable.',
              },
              {
                step: '3',
                title: 'Lead with confidence',
                desc: 'Finalize your plan, sync to Planning Center, and walk into Sunday prepared.',
              },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mb-6"
                  style={{ backgroundColor: 'var(--worship-gold)', color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
                >
                  {s.step}
                </div>
                <h3 className="text-lg font-semibold mb-3 text-white">{s.title}</h3>
                <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: '1.7' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing CTA ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-cream)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8"
            style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-navy)' }}
          >
            One simple plan
          </div>
          <h2
            className="text-5xl font-medium mb-4"
            style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
          >
            Stop starting from scratch every week.
          </h2>
          <p className="text-lg mb-10" style={{ color: 'var(--worship-slate)' }}>
            Everything included. <strong style={{ color: 'var(--worship-navy)' }}>$9.99/month</strong> after your 14-day free trial. No card required to start.
          </p>

          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-full text-lg font-semibold worship-btn-primary shadow-xl mb-6"
          >
            Start Planning Free <ChevronRight className="w-5 h-5" />
          </Link>

          <p className="text-sm" style={{ color: 'var(--worship-muted-slate)' }}>
            14-day free trial · No card required · Cancel anytime
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="py-10 px-8"
        style={{ backgroundColor: 'var(--worship-white)', borderTop: '1px solid var(--worship-border)' }}
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
