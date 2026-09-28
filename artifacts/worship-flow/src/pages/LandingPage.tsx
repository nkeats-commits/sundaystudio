import { useState } from 'react';
import {
  Flame,
  ChevronRight,
  ChevronDown,
  Music,
  Mic,
  Users,
  BookOpen,
  Layers,
  Heart,
  FileText,
  MessageCircle,
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
  { label: 'Discipleship Pastors', color: 'var(--worship-muted-warm)' },
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
    icon: MessageCircle,
    title: 'Small Group Questions',
    desc: 'Generate discussion questions tied to your sermon or theme — ready to hand off to your small group leaders.',
    badge: 'Discipleship',
  },
  {
    icon: Layers,
    title: 'Service Builder',
    desc: 'Design complete orders of worship from blank canvas to final flow — transitions, cues, and everything in between.',
    badge: 'Worship',
  },
];

const BADGE_COLORS: Record<string, string> = {
  Teaching: '#1F2A44',
  Worship: '#C99A3D',
  Discipleship: '#6E8B74',
  All: '#475569',
  Workflow: '#64748B',
};

const FAQS = [
  {
    q: 'How is this different from Planning Center?',
    a: `Planning Center helps you organize the service once the plan is ready. Sunday Studio helps you create and shape the plan before it gets there.\n\nYou can think of Planning Center as the place where you schedule people, songs, service orders, attachments, and details. Sunday Studio is where you work through the creative and pastoral preparation that happens before all of that: sermon ideas, Scripture themes, liturgy, prayers, devotionals, service direction, and worship flow.\n\nSunday Studio is not trying to replace Planning Center. It helps with the part Planning Center was not built to do: turning a passage, theme, or idea into thoughtful Sunday-ready content.`,
  },
  {
    q: 'How is this different from ChatGPT?',
    a: `Generic AI can give you words. Sunday Studio helps you prepare ministry resources within the actual rhythms of church leadership.\n\nYou do not have to become an expert prompt writer or spend half your time explaining what a call to worship is, how a service flows, what kind of devotional you need, or why tone matters in a pastoral setting.\n\nSunday Studio is built around sermons, worship services, liturgy, Scripture, devotionals, prayers, and weekly ministry prep. That means the experience is more guided, more focused, and more useful for church work. You are not starting with a blank chat box. You are starting with ministry-specific workflows that help you get to usable content faster.`,
  },
  {
    q: 'Can Sunday Studio help me plan sermons, worship services, devotionals, and liturgy in one place?',
    a: `Yes. Sunday Studio is designed to help church leaders move from scattered ideas to clear, ministry-ready resources.\n\nInstead of bouncing between a blank document, Bible study notes, worship themes, service elements, devotionals, and random AI prompts, Sunday Studio gives you a guided place to prepare the work you already carry every week.\n\nYou can use it to shape sermons, build service flows, write devotionals, craft prayers, create calls to worship, develop liturgy, and connect your Sunday around a passage, theme, or season.\n\nYou still lead. You still discern. You still pastor your people. Sunday Studio simply helps you get from "I have no idea where to start" to "I can work with this" a whole lot faster.`,
  },
  {
    q: 'Is this for pastors too, or just worship leaders?',
    a: `Sunday Studio is for pastors, worship leaders, and ministry leaders who carry the weight of preparing meaningful Sunday gatherings.\n\nIf you preach, it can help with sermon outlines, illustrations, devotional content, discussion questions, and passage-based planning.\n\nIf you lead worship, it can help with service themes, Scripture readings, prayers, transitions, calls to worship, and song-set direction.\n\nIf you oversee ministry teams, it can help create clarity around what you are trying to say, sing, pray, and invite people into.\n\nSunday Studio is not just a worship-planning tool. It is a ministry preparation assistant for the people who are responsible for making Sunday thoughtful, faithful, and connected.`,
  },
  {
    q: 'Can I trust it with Scripture and theology?',
    a: `That is exactly the right question to ask.\n\nSunday Studio is meant to support faithful ministry preparation, not replace your study, prayer, wisdom, or theological discernment. It helps you think, organize, draft, and refine. But you remain the pastor, leader, shepherd, and final voice. Every piece of content should be reviewed, edited, and shaped by you before it is used with your people.\n\nThe goal is not to hand your theology to AI. The goal is to give you a tool that helps you prepare more thoughtfully, ask better questions, explore stronger ideas, and build resources that you can evaluate through your own convictions, church context, and biblical understanding.\n\nSunday Studio gives you a strong starting point. You bring the pastoral judgment.`,
  },
  {
    q: 'Can I shape the tone and theological direction?',
    a: `Yes. Sunday Studio is built to help you shape content around your ministry context.\n\nA prayer for a reflective communion moment should not sound like a student ministry game night devotional. A sermon outline for a conservative evangelical church should not sound the same as a high-church liturgical reading. A Good Friday service should not feel like an Easter hype video accidentally wore black.\n\nTone matters. Theology matters. Context matters. Sunday Studio helps you guide the output based on what you are preparing, who you are leading, and how you want it to feel — whether you need something pastoral, reverent, warm, concise, thoughtful, celebratory, invitational, or Scripture-heavy.`,
  },
  {
    q: 'Will the content sound generic?',
    a: `Not if you use it the way it is meant to be used.\n\nSunday Studio is not designed to hand you bland, copy-and-paste ministry filler. It is designed to help you get a strong first draft that you can shape into something that sounds like you, fits your church, and serves your people.\n\nThe best ministry content still needs a human shepherd behind it. Your stories, convictions, tone, humor, pastoral instincts, and knowledge of your people matter. Sunday Studio helps you get unstuck and gives you language to work with. Then you make it personal, specific, and alive.\n\nThink of it less like a ghostwriter and more like a creative ministry assistant who helps you get the first layer down so you can do the deeper work.`,
  },
  {
    q: "Can it help me when I'm behind and staring at a blank page?",
    a: `Yes, and honestly, that is one of the moments Sunday Studio was made for.\n\nEvery ministry leader knows that feeling. Sunday is coming. The passage is open. The cursor is blinking. Your coffee is cold. Your brain has apparently left the building.\n\nSunday Studio helps you get moving. You can enter a passage, theme, service idea, or ministry need, and it will help you generate starting points, outlines, prayers, transitions, devotionals, or service direction. It does not do the ministry for you, but it helps break the paralysis of starting from nothing.\n\nSometimes the hardest part is not finishing. It is beginning. Sunday Studio gives you a faithful, practical place to begin.`,
  },
  {
    q: 'Will this save me time, or just give me more to edit?',
    a: `The goal is to save you meaningful time by helping you get to a better first draft faster.\n\nSunday Studio is not magic, and it should not replace your review process. But when used well, it can reduce the time you spend staring at a blank page, wrestling with phrasing, building from scratch, or trying to connect scattered ideas.\n\nInstead of spending an hour trying to write a prayer, transition, devotional, or service theme from nothing, you can start with a thoughtful draft and spend your best energy refining it.\n\nThe goal is not "no editing." The goal is better editing because you are no longer starting from zero.`,
  },
  {
    q: 'Does using AI make my ministry less personal or faithful?',
    a: `Not when the tool stays in the right place.\n\nA hammer does not build a house by itself. A commentary does not preach the sermon for you. A planning tool does not shepherd your church. And Sunday Studio does not replace your calling. It is a tool.\n\nYou bring the prayer, discernment, theology, relationships, lived experience, and pastoral care. Sunday Studio helps with structure, language, ideas, and preparation.\n\nUsing a tool to save time is not unfaithful. In many cases, it may help you give more attention to the parts of ministry that only you can do: caring for people, discerning what your church needs, praying honestly, studying deeply, and leading with presence.`,
  },
  {
    q: 'Can it help me create a full Sunday plan around a passage or theme?',
    a: `Yes. Sunday Studio can help you take a passage, theme, sermon direction, church season, or ministry emphasis and build a more cohesive Sunday around it.\n\nFor example, you could start with a passage like Philippians 2, a theme like humility, or a season like Advent. From there, Sunday Studio can help generate worship themes, Scripture readings, prayers, service transitions, devotional content, sermon support, and reflection ideas that all point in the same direction.\n\nThis helps Sunday feel less like a collection of separate pieces and more like one clear invitation. Not forced. Not overproduced. Just thoughtful, connected, Scripture-shaped planning.`,
  },
  {
    q: 'Can it help my services feel more cohesive?',
    a: `Yes. One of Sunday Studio's strengths is helping you connect the dots.\n\nMany services have good songs, a good sermon, a good prayer, and a good welcome, but they still feel disconnected — not because anyone did something wrong, but because nobody had time to ask, "What is the thread that holds this all together?"\n\nSunday Studio helps you identify that thread. It can help connect the passage, sermon direction, worship themes, prayers, readings, transitions, and devotional moments so the whole service feels more intentional.\n\nYour people may not notice every detail. But they can feel when a service is thoughtfully led.`,
  },
  {
    q: 'Can I use it alongside the tools I already have?',
    a: `Yes. Sunday Studio is meant to fit alongside your current workflow, not blow it up.\n\nYou can use it with Planning Center, Google Docs, Word, Notion, your sermon-writing process, your worship-planning meetings, or whatever system your church already uses.\n\nSunday Studio helps create and refine the content. Then you can copy, export, adapt, or move that content into the places where your team already works. You do not need to rebuild your entire ministry system to benefit from it. You just need a better way to get from idea to usable resource.`,
  },
  {
    q: 'Can I try it before asking my church to pay?',
    a: `Yes. And you should be able to.\n\nWe know church budgets can be complicated. Sometimes the person who needs the tool is not the person who approves the purchase. Sometimes you need to try something first before you can confidently tell your senior pastor, executive pastor, or finance team, "This would actually help us."\n\nThat is why a free trial matters. You can use Sunday Studio in your real weekly prep, see whether it saves time, test whether the content is useful, and decide if it belongs in your ministry rhythm before asking your church to invest.\n\nNo awkward pitch. No blind purchase. Try it first. See the value. Then decide.`,
  },
  {
    q: 'Will this help me lead better, not just work faster?',
    a: `That is the goal.\n\nSunday Studio is not built so you can crank out religious content at industrial speed. Nobody needs more rushed, generic, vaguely spiritual material floating around the church world.\n\nSunday Studio is built to help you prepare with more clarity, connection, and confidence. Yes, it can save time. But the deeper purpose is to help you use that time better — more time to think, more time to pray, more time to refine, more time to pastor actual humans instead of wrestling a blinking cursor until midnight.\n\nSunday Studio helps you move faster through the parts that drain your energy so you can give more attention to the parts that require your heart, wisdom, and leadership. Because the goal is not just a better workflow. The goal is better ministry.`,
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border-b"
      style={{ borderColor: 'var(--worship-border)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 py-6 text-left"
      >
        <span
          className="text-xl font-semibold leading-snug"
          style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
        >
          {q}
        </span>
        <ChevronDown
          className="w-5 h-5 shrink-0 mt-0.5 transition-transform duration-200"
          style={{
            color: 'var(--worship-gold)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      {open && (
        <div className="pb-6 space-y-3">
          {a.split('\n\n').map((para, i) => (
            <p key={i} className="text-base leading-relaxed" style={{ color: 'var(--worship-slate)' }}>
              {para}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

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
            Sunday Studio
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
              <span style={{ color: 'var(--worship-gold)' }}>Planning Center handles your logistics. </span>
              <span style={{ color: 'var(--worship-navy)' }}>Sunday Studio handles your content.</span>
            </h1>

            <p className="text-lg leading-relaxed mb-10" style={{ color: 'var(--worship-slate)' }}>
              Sunday Studio helps pastors and leaders research, write, and refine sermons, devotionals, songs, liturgies, prayers, worship moments, and teaching content — all personalized to your church, theology, mission, and voice.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-base font-semibold worship-btn-primary shadow-lg"
              >
                Try it for free <ChevronRight className="w-4 h-4" />
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
                8–10 hours <span style={{ color: 'var(--worship-gold)' }}>✓</span>
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
            >Sunday Studio is here to help</p>
            <h2
              className="text-4xl font-medium mb-5"
              style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
            >
              Built for every leader who prepares people to encounter God.
            </h2>
            <p className="text-base leading-relaxed mb-8" style={{ color: 'var(--worship-slate)' }}>
              We know what it feels like to walk into Sunday with more preparation to do than time allows. Sunday Studio was built by ministry leaders, for ministry leaders — combining AI with the structure your specific role actually needs, so your best work happens more often.
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
              Whether you're writing a sermon, planning a service, preparing your team, or simply trying to stay grounded — Sunday Studio has the tool.
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
                desc: 'Tell Sunday Studio what you\'re preparing — a sermon, a service, a team devotional. Add your scripture, theme, and tradition.',
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
              style={{ color: 'var(--worship-muted-warm)' }}
            >
              With Sunday Studio
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
                    <Check className="w-3 h-3" style={{ color: 'var(--worship-muted-warm)' }} />
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
      {/* ── FAQ ── */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-cream)' }}>
        <div className="max-w-3xl mx-auto">
          <p
            className="text-center text-sm font-semibold uppercase tracking-widest mb-4"
            style={{ color: 'var(--worship-gold)' }}
          >
            Questions
          </p>
          <h2
            className="text-4xl font-medium text-center mb-14"
            style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
          >
            Honest answers to real questions
          </h2>
          <div>
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
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
            Try Sunday Studio free for 14 days. Then just{' '}
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
              Sunday Studio
            </span>
            <span className="text-sm ml-2" style={{ color: 'var(--worship-muted-slate)' }}>
              © {new Date().getFullYear()} · Built for the Church.
            </span>
          </div>
          <div className="flex gap-8 text-sm" style={{ color: 'var(--worship-muted-slate)' }}>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:underline">Terms</Link>
            <a href="mailto:hello@sundaystudio.app" className="hover:underline">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
