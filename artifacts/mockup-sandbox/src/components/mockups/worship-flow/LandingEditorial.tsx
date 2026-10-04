import React from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Music2, PenLine } from 'lucide-react';
import './_group.css';
import './LandingEditorial.css';

const steps = [
  {
    number: '01',
    title: 'Carry the passage',
    copy: 'Begin with the text you have been sitting with. Sunday Studio gives you a ministry-specific place to explore sermon direction, Scripture themes, and the questions still following you.',
    icon: BookOpen,
    note: 'THE TEXT BEFORE THE TALK',
  },
  {
    number: '02',
    title: 'Find the thread',
    copy: 'Bring the sermon, prayers, readings, and service moments into view together. Look for the invitation that can hold the gathering without forcing every piece into the same shape.',
    icon: Music2,
    note: 'ONE CLEAR INVITATION',
  },
  {
    number: '03',
    title: 'Shape the words',
    copy: 'Work with a first draft, then bring your own study, theology, pastoral judgment, and knowledge of your people to every line before it is used.',
    icon: PenLine,
    note: 'A HUMAN VOICE, ALWAYS',
  },
];

function TrialLink({ light = false }: { light?: boolean }) {
  return (
    <a className={`le-trial-link${light ? ' le-trial-link--light' : ''}`} href="/sign-up">
      <span>Start your 14-day free trial</span>
      <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.8} />
    </a>
  );
}

export default function LandingEditorial() {
  return (
    <main className="landing-editorial">
      <header className="le-header">
        <a className="le-wordmark" href="/" aria-label="Sunday Studio home">
          <span className="le-mark" aria-hidden="true">S</span>
          <span>Sunday <i>Studio</i></span>
        </a>
        <div className="le-header-right">
          <span className="le-header-note">A quieter place to prepare</span>
          <TrialLink />
        </div>
      </header>

      <section className="le-hero">
        <div className="le-hero-copy">
          <p className="le-kicker"><span /> FOR THE WORK THAT LEADS TO SUNDAY</p>
          <h1>First, carry<br />the <em>passage.</em></h1>
          <p className="le-deck">
            Before the outline, the set list, the welcome. There is a text you keep returning to
            — and a people you are preparing to meet it.
          </p>
          <p className="le-support">
            Sunday Studio helps pastors, worship leaders, and ministry teams shape sermons,
            services, prayers, liturgy, devotionals, and the words in between.
          </p>
          <div className="le-hero-actions">
            <TrialLink />
            <span className="le-trial-detail">14 days free <b>·</b> Card required <b>·</b> No charge today</span>
          </div>
          <p className="le-review-note">Every draft is yours to review, discern, and make your own.</p>
        </div>

        <div className="le-hero-art" aria-label="An editorial illustration of notes gathered around a Scripture passage">
          <div className="le-art-topline"><span>WEEKLY NOTES</span><span>VOL. 01 / SUNDAY</span></div>
          <div className="le-paper">
            <div className="le-paper-index">ILLUSTRATIVE PASSAGE NOTE</div>
            <p className="le-scripture">“Let the same mind be in you that was in Christ Jesus.”</p>
            <p className="le-citation">PHILIPPIANS 2:5</p>
            <div className="le-rule" />
            <div className="le-margin-note">
              <span className="le-margin-star">✳</span>
              <span>What does humility<br />make possible here?</span>
            </div>
            <div className="le-pencil-line le-pencil-line--one" />
            <div className="le-pencil-line le-pencil-line--two" />
            <div className="le-paper-footer"><span>READ AGAIN, SLOWLY</span><span>01 — 03</span></div>
          </div>
          <div className="le-note-slip">
            <span className="le-note-slip-label">A THREAD TO FOLLOW</span>
            <span>Not grasping.<br /><i>Making room.</i></span>
            <span className="le-slip-mark" aria-hidden="true">↗</span>
          </div>
          <div className="le-hero-caption"><span className="le-caption-rule" /> A place to begin, not a voice to borrow.</div>
        </div>

        <a className="le-scroll-cue" href="#the-work">
          <span>THE WORK OF PREPARING</span>
          <ArrowDown aria-hidden="true" size={14} />
        </a>
      </section>

      <section className="le-intro" id="the-work">
        <div className="le-intro-index">A WEEK IN THE MAKING</div>
        <div className="le-intro-copy">
          <p className="le-intro-lede">The passage is open.<br />The room is already on your mind.</p>
          <p className="le-intro-body">
            A sermon takes shape beside a hospital visit, a rehearsal, a dozen small decisions
            about what to say and when. Preparation is not separate from pastoring. It is one
            of the ways we care for people before they arrive.
          </p>
        </div>
        <div className="le-intro-aside">
          <span className="le-aside-rule" />
          <p>Not more words for the sake of words.<br /><i>A clearer way into the work.</i></p>
        </div>
      </section>

      <section className="le-process" aria-labelledby="le-process-title">
        <div className="le-process-heading">
          <p className="le-kicker"><span /> A PRACTICE, NOT A SHORTCUT</p>
          <h2 id="le-process-title">From the text<br />to the gathering.</h2>
          <p>Keep the human work at the center. Let a guided workspace help you move through the pieces.</p>
        </div>
        <div className="le-steps">
          {steps.map(({ number, title, copy, icon: Icon, note }) => (
            <article className="le-step" key={number}>
              <div className="le-step-top">
                <span className="le-step-number">{number}</span>
                <Icon aria-hidden="true" size={19} strokeWidth={1.5} />
              </div>
              <h3>{title}</h3>
              <p>{copy}</p>
              <span className="le-step-note">{note}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="le-context">
        <div className="le-context-quote">
          <span className="le-context-label">YOUR CHURCH IS NOT A TEMPLATE</span>
          <p>Good preparation sounds like the people who will hear it.</p>
        </div>
        <div className="le-context-detail">
          <p>
            Your Church Profile can shape suggestions around your theology, music style,
            traditions, preaching voice, mission, and ministry focus. It gives the work
            context; you bring the discernment.
          </p>
          <div className="le-context-tags" aria-label="Church Profile details">
            <span>Theology</span><span>Traditions</span><span>Preaching voice</span><span>Mission</span>
          </div>
        </div>
      </section>

      <section className="le-ready">
        <div className="le-ready-number">SUNDAY, IN VIEW</div>
        <div className="le-ready-main">
          <p className="le-ready-overline">WHEN THE PIECES BEGIN TO CONNECT</p>
          <h2>Arrive ready<br />to <em>be present.</em></h2>
          <p className="le-ready-copy">
            Shape the sermon, prayer, service flow, and team materials with the people in mind.
            Then review, revise, and share what your team needs as Markdown, plain text, or email.
          </p>
          <TrialLink light />
          <p className="le-ready-terms">Card required. No charge today. Cancel before your first charge.</p>
        </div>
        <div className="le-ready-side">
          <div className="le-ready-mark" aria-hidden="true">S<span>.</span></div>
          <p>Prepare with care.<br /><i>Lead with presence.</i></p>
        </div>
      </section>

      <footer className="le-footer">
        <a className="le-wordmark" href="/" aria-label="Sunday Studio home">
          <span className="le-mark" aria-hidden="true">S</span>
          <span>Sunday <i>Studio</i></span>
        </a>
        <p>For the ones preparing a place for others.</p>
        <a className="le-footer-link" href="/sign-up">Begin your trial <ArrowRight aria-hidden="true" size={15} /></a>
      </footer>
    </main>
  );
}