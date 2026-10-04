import { useState, type FormEvent } from 'react';
import { BookOpen, Calendar, CheckCircle2, ChevronRight, Flame, Layers, Mic, Music, Users } from 'lucide-react';
import './LandingFieldnote.css';

type DialogKind = 'signup' | 'signin' | 'privacy' | 'terms';
type DialogState = { kind: DialogKind; plan?: string } | null;

const features = [
  { icon: Layers, title: 'Worship Service Builder', desc: 'Shape a thoughtful arc, from the first welcome to the final blessing.' },
  { icon: Music, title: 'Song Selection Assistant', desc: 'Find songs that speak to the scripture, theme, and people in your room.' },
  { icon: BookOpen, title: 'Liturgy Generator', desc: 'Write prayers, calls to worship, and benedictions with a human voice.' },
  { icon: Mic, title: 'Speaking Moments', desc: 'Find the right words for communion, offering, and the spaces between.' },
  { icon: Users, title: 'Team Devotionals', desc: 'Make rehearsal a place for your people to pause and be present.' },
  { icon: Calendar, title: 'Seasonal Planning', desc: 'Look ahead to Advent, Lent, Easter, and the Sundays in between.' },
];
const steps = [
  { title: 'Bring your context', desc: "Start with the sermon, scripture, and the traditions that make your church yours." },
  { title: 'Find the through-line', desc: 'Gather songs, liturgy, and moments into a service that feels connected.' },
  { title: 'Make it your own', desc: 'Shape every suggestion with your team, then save and share the plan.' },
];
const plans = [
  { name: 'Free', price: '$0', desc: 'A little more room to think for solo leaders.', items: ['3 service plans / month', 'Basic song suggestions', 'Standard liturgy templates'] },
  { name: 'Pro', price: '$19', desc: 'A full creative desk for weekly planning.', items: ['Unlimited service plans', 'Advanced AI song assistant', 'Custom liturgy generation', 'Team devotionals', 'Export options'], featured: true },
  { name: 'Church', price: '$49', desc: 'One shared workspace for the whole team.', items: ['Everything in Pro', 'Up to 10 team members', 'Shared team workspace', 'Saved church profiles', 'Priority support'] },
];

export function LandingFieldnote() {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [submitted, setSubmitted] = useState(false);
  const openDialog = (kind: DialogKind, plan?: string) => {
    setSubmitted(false);
    setDialog({ kind, plan });
  };
  const closeDialog = () => setDialog(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };
  const isInfo = dialog?.kind === 'privacy' || dialog?.kind === 'terms';
  const dialogTitle = dialog?.kind === 'signin' ? 'Welcome back.' : dialog?.kind === 'privacy' ? 'Your trust matters.' : dialog?.kind === 'terms' ? 'A few ground rules.' : 'Make room to plan.';

  return (
    <main className="fieldnote">
      <header className="fn-topbar">
        <a href="#top" className="fn-brand" aria-label="WorshipFlow home">
          <span className="fn-brand-mark"><Flame size={19} strokeWidth={2.1} /></span>
          <span className="fn-brand-name">WorshipFlow</span>
        </a>
        <nav className="fn-nav" aria-label="Main navigation">
          <a href="#features">The toolkit</a>
          <a href="#pricing">Plans</a>
          <button type="button" onClick={() => openDialog('signin')}>Sign in</button>
          <button type="button" className="fn-pill" onClick={() => openDialog('signup', 'Pro')}>Start planning <ChevronRight size={15} /></button>
        </nav>
      </header>

      <section className="fn-hero" id="top">
        <div className="fn-hero-inner">
          <p className="fn-eyebrow">A weekly practice, made lighter</p>
          <h1 className="fn-serif">Plan worship with care.<br />Lead with <em>room to breathe.</em></h1>
          <p className="fn-hero-copy">A thoughtful workspace for the people who hold Sunday together. Bring your sermon, your songs, and your team into one shared plan.</p>
          <div className="fn-hero-actions">
            <button type="button" className="fn-pill" onClick={() => openDialog('signup', 'Pro')}>Start a free plan <ChevronRight size={16} /></button>
            <a className="fn-pill fn-pill-light" href="#steps">Take a look around</a>
          </div>
          <div className="fn-proof">
            <span className="fn-proof-stamp"><CheckCircle2 size={16} /></span>
            <span>Made for real churches, real teams, and real Sundays.</span>
          </div>
        </div>
      </section>

      <section className="fn-section fn-story">
        <div className="fn-wrap">
          <p className="fn-kicker">The heart of the work</p>
          <h2>You're not just picking songs.<br />You're pastoring a room.</h2>
          <p>Every Sunday matters. But the pressure of planning week after week can crowd out the calling itself. WorshipFlow gathers scattered ideas into a service with a clear center—so you can spend less time chasing details and more time caring for people.</p>
        </div>
      </section>

      <section className="fn-section fn-features" id="features">
        <div className="fn-wrap">
          <div className="fn-heading">
            <p className="fn-kicker">A place for the whole week</p>
            <h2>Good work, gathered in one place.</h2>
            <p>Small, useful tools for the moments that make a service feel whole.</p>
          </div>
          <div className="fn-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article className="fn-feature" key={feature.title}>
                  <div className="fn-icon"><Icon size={20} strokeWidth={1.8} /></div>
                  <h3>{feature.title}</h3>
                  <p>{feature.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="fn-section fn-steps" id="steps">
        <div className="fn-wrap">
          <div className="fn-heading">
            <p className="fn-kicker">From blank page to Sunday</p>
            <h2>Start with what matters.</h2>
          </div>
          <div className="fn-step-grid">
            {steps.map((step, index) => (
              <article className="fn-step" key={step.title}>
                <div className="fn-step-no">{String(index + 1).padStart(2, '0')}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="fn-section fn-pricing" id="pricing">
        <div className="fn-wrap">
          <div className="fn-heading">
            <p className="fn-kicker">A plan that fits your practice</p>
            <h2>Clear, simple, and honest.</h2>
            <p>Start small. Bring the team along when you're ready.</p>
          </div>
          <div className="fn-price-grid">
            {plans.map((plan) => (
              <article className={`fn-price${plan.featured ? ' featured' : ''}`} key={plan.name}>
                {plan.featured && <span className="fn-ribbon">Most loved</span>}
                <h3>{plan.name}</h3>
                <div className="fn-price-number"><strong>{plan.price}</strong><span>/ month</span></div>
                <p className="fn-price-desc">{plan.desc}</p>
                <ul>{plan.items.map((item) => <li key={item}><CheckCircle2 size={15} /><span>{item}</span></li>)}</ul>
                <button type="button" className="fn-pill" onClick={() => openDialog('signup', plan.name)}>
                  {plan.name === 'Pro' ? 'Try Pro free' : plan.name === 'Church' ? 'Choose Church' : 'Get started'} <ChevronRight size={15} />
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="fn-final">
        <p className="fn-kicker">A quieter kind of Sunday prep</p>
        <h2>Stop starting from scratch every week.</h2>
        <button type="button" className="fn-pill" onClick={() => openDialog('signup', 'Pro')}>Make your first plan <ChevronRight size={16} /></button>
      </section>

      <footer className="fn-footer">
        <div className="fn-footer-brand"><Flame className="fn-footer-mark" size={15} /><span>© 2025 WorshipFlow · Built for the Church</span></div>
        <nav aria-label="Footer">
          <button type="button" onClick={() => openDialog('privacy')}>Privacy</button>
          <button type="button" onClick={() => openDialog('terms')}>Terms</button>
          <a href="mailto:hello@worshipflow.app">Contact</a>
        </nav>
      </footer>

      {dialog && (
        <div className="fn-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section className="fn-dialog" role="dialog" aria-modal="true" aria-labelledby="fn-dialog-title">
            <button className="fn-dialog-close" type="button" onClick={closeDialog} aria-label="Close dialog">×</button>
            <p className="fn-kicker">{dialog.kind === 'signin' ? 'Your workspace' : isInfo ? 'WorshipFlow' : `A good place to begin${dialog.plan ? ` · ${dialog.plan}` : ''}`}</p>
            <h2 id="fn-dialog-title">{dialogTitle}</h2>
            {isInfo ? (
              <p>{dialog.kind === 'privacy' ? 'Your plans and notes belong to your ministry. We keep your information private and never sell your data.' : 'Use WorshipFlow as a thoughtful planning companion. You remain the editor, pastor, and final voice in every service.'}</p>
            ) : submitted ? (
              <p className="fn-success">{dialog.kind === 'signin' ? 'Sign-in link requested. Check your inbox to continue.' : 'You’re on the list. We’ll be in touch with a good place to begin.'}</p>
            ) : (
              <>
                <p>{dialog.kind === 'signin' ? 'Enter your email and we’ll send you a sign-in link.' : 'Tell us where to send your invitation. Your first plan is on us.'}</p>
                <form onSubmit={submit}>
                  <label>Email address<input type="email" name="email" required placeholder="you@yourchurch.org" /></label>
                  {dialog.kind === 'signup' && <label>Church or ministry<input type="text" name="church" placeholder="A name for your workspace" /></label>}
                  <button type="submit" className="fn-pill">{dialog.kind === 'signin' ? 'Send sign-in link' : 'Get started'} <ChevronRight size={15} /></button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}