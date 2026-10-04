import { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardList,
  FileText,
  Mail,
  Music2,
  Users,
} from 'lucide-react';
import './LandingTeamWorkflow.css';

type ShareFormat = 'Markdown' | 'Plain text' | 'Email';

const SHARE_TEXT: Record<ShareFormat, string> = {
  Markdown: `SUNDAY GATHERING  /  9:30 AM
Theme: Mercy at the table
Scripture: Luke 14:7–14

01  Welcome & call to worship
     Reader · Psalm 34:1–8
02  Opening song
     Musicians · confirm key and arrangement
03  Scripture reading
     Reader · Luke 14:7–14
04  Message
     Sermon draft · pastoral review needed
05  Communion prayer
     Leader · invitation and table`,
  'Plain text': `Sunday Gathering — 9:30 AM
Theme: Mercy at the table
Scripture: Luke 14:7–14

Welcome & call to worship — Reader
Opening song — Musicians
Scripture reading — Reader
Message — Sermon draft; pastoral review needed
Communion prayer — Leader`,
  Email: `Subject: Sunday plan — Mercy at the table

Hello team,

Here is the working order for Sunday at 9:30. Our thread is Luke 14:7–14 and the invitation to make room at the table.

Readers: please review the call to worship and Scripture reading.
Musicians: please check the opening song arrangement.
Everyone: the sermon and prayer are drafts for pastoral review.

Thank you for helping the gathering feel clear and connected.`,
};

function BrandMark() {
  return (
    <span className="team-brand-mark" aria-hidden="true">
      <BookOpen size={15} strokeWidth={1.6} />
    </span>
  );
}

export default function LandingTeamWorkflow() {
  const [format, setFormat] = useState<ShareFormat>('Markdown');

  return (
    <main className="team-landing">
      <nav className="team-nav" aria-label="Main navigation">
        <a className="team-brand" href="#top" aria-label="Sunday Studio home">
          <BrandMark />
          <span className="team-serif">Sunday Studio</span>
        </a>
        <div className="team-nav-links">
          <a href="#workflow">The workflow</a>
          <a href="#church-context">Your church context</a>
          <a className="team-nav-cta" href="/sign-up">Start free trial</a>
        </div>
      </nav>

      <section className="team-hero" id="top">
        <div className="team-hero-copy">
          <div className="team-eyebrow">For the work behind Sunday</div>
          <h1 className="team-serif">Shape the message.<br /><em>Bring the team along.</em></h1>
          <p>
            Start with the passage and the people you serve. Shape a thoughtful draft,
            bring your pastoral judgment to it, then hand your readers, musicians, and
            volunteers a clear order to follow.
          </p>
          <div className="team-hero-actions">
            <a className="team-primary-cta" href="/sign-up">
              Start your 14-day free trial <ArrowRight size={15} />
            </a>
            <a className="team-secondary-link" href="#workflow">
              See the handoff <ArrowDown size={14} />
            </a>
          </div>
          <p className="team-trial-note">Card required <span>·</span> No charge today <span>·</span> Cancel before first charge</p>
        </div>

        <div className="team-plan-wrap" aria-label="Illustrative Sunday service plan">
          <article className="team-plan">
            <div className="team-plan-top">
              <div>
                <div className="team-plan-kicker">Illustrative sample · working plan</div>
                <div className="team-plan-title">Mercy at the table</div>
              </div>
              <span className="team-status"><i className="team-status-dot" /> Draft for review</span>
            </div>
            <div className="team-plan-meta">
              <span><strong>Passage</strong> &nbsp;Luke 14:7–14</span>
              <span><strong>Gathering</strong> &nbsp;9:30 AM</span>
            </div>
            {[
              ['01', 'Welcome & call to worship', 'Psalm 34:1–8', 'Reader'],
              ['02', 'Opening song', 'Arrangement to confirm', 'Musicians'],
              ['03', 'Scripture reading', 'Luke 14:7–14', 'Reader'],
              ['04', 'Message', 'Working sermon outline', 'Pastor'],
              ['05', 'Communion prayer', 'Invitation & table', 'Leader'],
            ].map(([number, title, detail, role]) => (
              <div className="team-plan-row" key={number}>
                <span className="team-plan-num">{number}</span>
                <span><strong>{title}</strong><small>{detail}</small></span>
                <span className="team-role">{role}</span>
              </div>
            ))}
            <div className="team-review-note">
              <Check size={13} />
              <span>A useful starting draft—not a substitute for your study, prayer, and final review.</span>
            </div>
          </article>
          <div className="team-float-label">
            <ClipboardList size={17} />
            <div><span>Ready to share</span><strong>One clear order of worship</strong></div>
          </div>
        </div>
      </section>

      <div className="team-band" aria-label="Sunday Studio ministry audiences">
        <div className="team-band-inner">
          <span className="team-band-label">Made for the people who prepare</span>
          <span className="team-band-line" />
          <div className="team-band-items">
            <span><BookOpen /> Pastors</span>
            <span><Music2 /> Worship leaders</span>
            <span><Users /> Ministry teams</span>
          </div>
        </div>
      </div>

      <section className="team-workflow" id="workflow">
        <div className="team-section-inner">
          <div className="team-section-heading">
            <div>
              <div className="team-eyebrow">A better path to the room</div>
              <h2>Good preparation travels beyond your desk.</h2>
            </div>
            <p>
              Sunday Studio gives ministry work a place to take shape before it becomes
              a plan people can serve from. The leader stays in the lead at every step.
            </p>
          </div>
          <div className="team-steps">
            <article className="team-step">
              <div className="team-step-num">01</div>
              <h3>Begin with what matters</h3>
              <p>Bring a Scripture passage, theme, sermon direction, or ministry need into a guided preparation workflow.</p>
              <span className="team-step-tag">Passage · season · purpose</span>
            </article>
            <article className="team-step">
              <div className="team-step-num">02</div>
              <h3>Shape the first draft</h3>
              <p>Develop sermon support, prayers, liturgy, devotionals, and service flow. Review every suggestion with pastoral judgment.</p>
              <span className="team-step-tag">Draft · discern · refine</span>
            </article>
            <article className="team-step">
              <div className="team-step-num">03</div>
              <h3>Give the team a clear plan</h3>
              <p>Share a readable order with the people serving—so each person can see the flow and prepare their part.</p>
              <span className="team-step-tag">Markdown · plain text · email</span>
            </article>
          </div>
        </div>
      </section>

      <section className="team-context" id="church-context">
        <div className="team-context-copy">
          <div className="team-eyebrow">The church behind the plan</div>
          <h2>Let your context shape the words.</h2>
          <p>
            A church has its own theological center, musical language, traditions,
            preaching voice, mission, and ministry focus. Your Church Profile gives
            Sunday Studio that context to personalize suggestions for the work in front of you.
          </p>
          <div className="team-context-note">
            <Check size={14} />
            <span>Personalized suggestions still need your review. You bring the discernment, local knowledge, and final voice.</span>
          </div>
        </div>
        <div className="team-profile-card" aria-label="Church Profile example">
          <div className="team-profile-head">
            <strong>Church Profile</strong>
            <span>Context for your drafts</span>
          </div>
          <p className="team-profile-lede">A few of the details that help suggestions fit your ministry.</p>
          <div className="team-profile-fields">
            <div className="team-profile-field"><small>Theology</small><strong>Church theological center</strong></div>
            <div className="team-profile-field"><small>Music style</small><strong>Musical language & range</strong></div>
            <div className="team-profile-field"><small>Traditions</small><strong>Practices & rhythms</strong></div>
            <div className="team-profile-field"><small>Preaching voice</small><strong>Tone & communication style</strong></div>
            <div className="team-profile-field"><small>Mission</small><strong>What your church is here to do</strong></div>
            <div className="team-profile-field"><small>Ministry focus</small><strong>Who you are serving now</strong></div>
          </div>
          <p className="team-profile-foot">Specific context helps move a draft closer to your church—not past the leader who knows it.</p>
        </div>
      </section>

      <section className="team-handoff">
        <div className="team-section-inner team-handoff-grid">
          <div className="team-handoff-copy">
            <div className="team-eyebrow">From preparation to people</div>
            <h2>Clear enough to carry into the room.</h2>
            <p>
              A plan is only helpful when the people serving can use it. Share the
              working order in a format that fits your existing team rhythm—without
              asking everyone to move into another live workspace.
            </p>
            <div className="team-handoff-roles">
              <span>For readers</span><span>For musicians</span><span>For volunteers</span>
            </div>
          </div>
          <div className="team-share-card">
            <div className="team-share-head">
              <strong>Share the working plan</strong>
              <small>Sunday · Mercy at the table</small>
            </div>
            <div className="team-format-tabs" role="tablist" aria-label="Choose a share format">
              {(['Markdown', 'Plain text', 'Email'] as ShareFormat[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={format === option}
                  onClick={() => setFormat(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="team-share-content" role="tabpanel" aria-live="polite">
              {SHARE_TEXT[format]}
            </div>
            <div className="team-share-foot">
              <span>Review the draft, then share the version your team needs.</span>
              <span className="team-share-action">{format === 'Email' ? <Mail size={12} /> : <FileText size={12} />} {format}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="team-final">
        <div className="team-eyebrow">Prepare with the whole room in mind</div>
        <h2>Make space for thoughtful work—and a clear handoff.</h2>
        <p>Start with your ministry context. Shape a draft you can stand behind. Share a plan the people serving can follow.</p>
        <a className="team-primary-cta" href="/sign-up">Start your 14-day free trial <ArrowRight size={15} /></a>
        <span className="team-final-note">Card required · No charge today · Cancel before first charge</span>
      </section>

      <footer className="team-footer">
        <a className="team-brand" href="#top"><BrandMark /><span className="team-serif">Sunday Studio</span></a>
        <span>For the work behind Sunday.</span>
      </footer>
    </main>
  );
}