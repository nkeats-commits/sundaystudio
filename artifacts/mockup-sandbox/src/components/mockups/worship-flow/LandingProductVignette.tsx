import React from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Flame, Music2, PenLine, ScrollText, Sparkles } from 'lucide-react';
import './LandingProductVignette.css';

const profileContext = [
  ['Theology & tradition', 'Liturgical, welcoming'],
  ['Music style', 'Hymns + contemporary'],
  ['Preaching voice', 'Warm, plain-spoken'],
  ['Mission', 'Make room for every neighbor'],
];

const serviceElements = [
  {
    number: '01',
    kind: 'Gather',
    title: 'Call to worship',
    copy: 'A welcome shaped around Christ’s invitation: “Come to me, all you who are weary.”',
    icon: ScrollText,
  },
  {
    number: '02',
    kind: 'Respond',
    title: 'Prayer of approach',
    copy: 'A quiet, honest prayer that names weariness and makes space for rest.',
    icon: PenLine,
  },
  {
    number: '03',
    kind: 'Sing',
    title: 'Song direction',
    copy: 'Consider a familiar hymn of trust beside a gentle, contemporary response.',
    icon: Music2,
  },
];

export default function LandingProductVignette() {
  return (
    <main className="ss-landing">
      <header className="ss-nav">
        <a className="ss-brand" href="#top" aria-label="Sunday Studio home">
          <span className="ss-brand-mark"><Flame size={18} strokeWidth={1.7} /></span>
          <span>Sunday <em>Studio</em></span>
        </a>
        <nav className="ss-nav-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#for-your-week">For your week</a>
          <a className="ss-nav-cta" href="/sign-up">Start your free trial <ArrowUpRight size={14} /></a>
        </nav>
      </header>

      <section className="ss-hero" id="top">
        <div className="ss-hero-copy">
          <div className="ss-eyebrow"><span /> A studio for the work behind Sunday</div>
          <h1>Prepare with care.<br /><i>Lead with presence.</i></h1>
          <p className="ss-hero-deck">
            Sermons, services, prayers, and the words in between—Sunday Studio gives ministry leaders a thoughtful place to begin.
          </p>
          <div className="ss-hero-actions">
            <a className="ss-button" href="/sign-up">Start your 14-day free trial <ArrowRight size={16} /></a>
          </div>
          <p className="ss-trial-note">Card required · No charge today · Cancel before first charge</p>
          <div className="ss-audience">
            <span>For the people preparing the room</span>
            <div className="ss-audience-list">
              <b>Pastors</b><i></i><b>Worship leaders</b><i></i><b>Ministry teams</b>
            </div>
          </div>
        </div>

        <div className="ss-hero-art" aria-label="Illustrative Sunday Studio service planning interface">
          <div className="ss-art-orbit ss-orbit-one"></div>
          <div className="ss-art-orbit ss-orbit-two"></div>
          <div className="ss-art-caption">A passage becomes a place to begin</div>
          <article className="ss-product-card">
            <div className="ss-card-topline">
              <span className="ss-app-wordmark"><Flame size={14} /> Sunday Studio</span>
              <span className="ss-sample-tag"><span></span> Illustrative sample</span>
            </div>
            <div className="ss-plan-heading">
              <div>
                <span className="ss-label">PASSAGE TO SERVICE</span>
                <h2>Rest for the weary</h2>
                <p>Matthew 11:28–30 <span>·</span> A gathered Sunday</p>
              </div>
              <div className="ss-book-icon"><BookOpen size={19} strokeWidth={1.5} /></div>
            </div>
            <div className="ss-profile-mini">
              <div className="ss-profile-head">
                <span>PROFILE CONTEXT</span>
                <span className="ss-example">Example only</span>
              </div>
              <div className="ss-context-chips">
                <span>Liturgical, welcoming</span>
                <span>Hymns + contemporary</span>
                <span>Warm, plain-spoken</span>
              </div>
            </div>
            <div className="ss-flow-mini">
              <div className="ss-flow-head"><span>ONE POSSIBLE THREAD</span><span>01 — 03</span></div>
              <div className="ss-flow-row">
                <span className="ss-flow-number">01</span>
                <div><b>Gather</b><small>Come, all who are weary…</small></div>
                <span className="ss-row-line"></span>
              </div>
              <div className="ss-flow-row">
                <span className="ss-flow-number">02</span>
                <div><b>Pray</b><small>Name the weight. Make room for rest.</small></div>
                <span className="ss-row-line"></span>
              </div>
              <div className="ss-flow-row">
                <span className="ss-flow-number">03</span>
                <div><b>Sing</b><small>Familiar hymn · gentle response</small></div>
                <span className="ss-row-line"></span>
              </div>
            </div>
            <div className="ss-card-foot"><Sparkles size={13} /> A starting point for your discernment</div>
          </article>
          <div className="ss-art-note"><span>+</span> scripture at the center,<br />your people in view</div>
        </div>
        <a className="ss-scroll-cue" href="#how-it-works"><span>See the sample</span><ArrowDown size={14} /></a>
      </section>

      <section className="ss-disclaimer" aria-label="Illustrative example disclaimer">
        <span className="ss-disclaimer-mark">i</span>
        <p><strong>Illustrative sample — not a real church or saved/generated plan.</strong> The profile and service elements below are examples to show how ministry context can inform preparation.</p>
      </section>

      <section className="ss-vignette" id="how-it-works">
        <div className="ss-vignette-intro">
          <span className="ss-kicker">FROM PASSAGE TO PREPARATION</span>
          <h2>One text.<br /><i>A connected thread.</i></h2>
          <p>Start with Scripture and the shape of your ministry. Explore a possible direction for the gathering, then bring your study, judgment, and knowledge of your people to every line.</p>
          <div className="ss-passage-quote">
            <span>THE PASSAGE</span>
            <blockquote>“Come to me, all you who are weary and burdened, and I will give you rest.”</blockquote>
            <cite>Matthew 11:28 · NIV</cite>
          </div>
        </div>

        <div className="ss-service-board">
          <div className="ss-board-top">
            <div>
              <span className="ss-label">SERVICE THREAD · EXAMPLE</span>
              <h3>Rest for the weary</h3>
            </div>
            <div className="ss-board-stamp">Illustrative<br />only</div>
          </div>
          <div className="ss-theme-line"><span className="ss-theme-dot"></span><p>A possible invitation: bring your burdens honestly; receive Christ’s gentleness.</p></div>

          <div className="ss-profile-context">
            <div className="ss-context-title"><span>MINISTRY PROFILE CONTEXT</span><small>Illustrative sample</small></div>
            <div className="ss-profile-grid">
              {profileContext.map(([label, value]) => (
                <div className="ss-profile-field" key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
            <p className="ss-context-footnote">Examples of context a Church Profile can hold—not a promise about any particular output.</p>
          </div>

          <div className="ss-elements-title">
            <span>SERVICE ELEMENTS</span>
            <span className="ss-elements-rule"></span>
            <small>possible directions</small>
          </div>
          <div className="ss-elements-list">
            {serviceElements.map(({ number, kind, title, copy, icon: Icon }) => (
              <article className="ss-element" key={number}>
                <span className="ss-element-number">{number}</span>
                <div className="ss-element-kind"><Icon size={15} strokeWidth={1.6} /><span>{kind}</span></div>
                <div className="ss-element-copy"><h4>{title}</h4><p>{copy}</p></div>
                <span className="ss-element-arrow"><ArrowRight size={15} /></span>
              </article>
            ))}
          </div>
          <div className="ss-board-review"><Sparkles className="ss-review-mark" size={14} /><p><b>Your pastoral discernment stays in the room.</b><br />Review, revise, and make every resource your own before sharing it.</p></div>
        </div>
      </section>

      <section className="ss-week" id="for-your-week">
        <div className="ss-week-heading">
          <span className="ss-kicker">A WORKSPACE FOR THE WHOLE WEEK</span>
          <h2>More than the order of service.</h2>
          <p>Ministry preparation happens in many forms. Find a guided place to shape the words, questions, and resources your calling asks of you.</p>
        </div>
        <div className="ss-week-list">
          <div><span>01</span><b>Sermons &amp; Scripture study</b><p>Explore a passage, develop an outline, and work with commentary and cross-references.</p></div>
          <div><span>02</span><b>Prayers &amp; liturgy</b><p>Shape calls to worship, pastoral prayers, readings, and benedictions around your gathering.</p></div>
          <div><span>03</span><b>Devotionals &amp; reflection</b><p>Prepare formation resources for your congregation, small groups, or ministry team.</p></div>
          <div><span>04</span><b>Service flow &amp; team materials</b><p>Bring transitions and service direction together, then share materials as Markdown, plain text, or email.</p></div>
        </div>
      </section>

      <section className="ss-closing">
        <div className="ss-closing-rule"></div>
        <span className="ss-kicker">BEGIN WITH WHAT YOU’RE CARRYING</span>
        <h2>Bring the passage.<br /><i>Bring your pastoral voice.</i></h2>
        <p>Sunday Studio can help you find a thoughtful first draft. You bring the study, prayer, and discernment that make it yours.</p>
        <a className="ss-button ss-button-light" href="/sign-up">Start your 14-day free trial <ArrowRight size={16} /></a>
        <small>Card required · No charge today · Cancel before first charge</small>
      </section>

      <footer className="ss-footer">
        <a className="ss-brand" href="#top"><span className="ss-brand-mark"><Flame size={16} /></span><span>Sunday <em>Studio</em></span></a>
        <p>For the people preparing the room.</p>
        <span>Scripture first. People always.</span>
      </footer>
    </main>
  );
}