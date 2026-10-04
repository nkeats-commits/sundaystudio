import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  Flame,
  Heart,
  Music2,
  Plus,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import "./landing-field-guide.css";

type ViewKey = "Arc" | "Songs" | "Words";

const serviceMoments = [
  { time: "10:00", label: "Gather", title: "Welcome & call to worship", kind: "OPENING", icon: Flame },
  { time: "10:06", label: "Sing", title: "Come Thou Fount", kind: "SONG", icon: Music2 },
  { time: "10:18", label: "Listen", title: "A table in the wilderness", kind: "MESSAGE", icon: BookOpen },
  { time: "10:42", label: "Respond", title: "Prayer of trust", kind: "LITURGY", icon: Heart },
];

const viewContent: Record<ViewKey, { eyebrow: string; title: string; body: string; note: string }> = {
  Arc: {
    eyebrow: "THE THREAD",
    title: "From scarcity to enough",
    body: "Let the room begin with the ache of not-enough. The songs make space for it; the table becomes the answer.",
    note: "A gentle turn, not a hard pivot.",
  },
  Songs: {
    eyebrow: "A FIRST SONG",
    title: "Come Thou Fount",
    body: "A familiar melody with language of wandering and return. It gives the congregation a way into this week's theme.",
    note: "Key of D · 74 BPM · familiar",
  },
  Words: {
    eyebrow: "CALL TO WORSHIP",
    title: "When the ground feels bare…",
    body: "…you still meet us here. When our hands are empty, you remind us that your mercy is morning enough.",
    note: "Psalm 23 · responsive reading",
  },
};

export default function LandingFieldGuide() {
  const [view, setView] = useState<ViewKey>("Arc");
  const [selected, setSelected] = useState(2);
  const [sermon, setSermon] = useState("A table in the wilderness");
  const [scripture, setScripture] = useState("John 6:1–14");
  const [generated, setGenerated] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [notice, setNotice] = useState("");

  const current = useMemo(() => viewContent[view], [view]);

  const handleGenerate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGenerated(true);
    setSaved(false);
    setNotice("A fresh service arc is ready to shape.");
    window.setTimeout(() => setNotice(""), 3200);
  };

  const startPlanning = () => {
    setShowSetup(true);
  };

  return (
    <main className="field-guide">
      <header className="fg-topbar">
        <a className="fg-brand" href="#top" aria-label="WorshipFlow home">
          <span className="fg-brand-mark"><Flame size={19} strokeWidth={1.8} /></span>
          <span>Worship<span className="fg-brand-light">Flow</span></span>
          <span className="fg-brand-divider" />
          <span className="fg-brand-caption">SUNDAY STUDIO</span>
        </a>
        <nav className="fg-nav" aria-label="Main navigation">
          <a href="#studio">The studio</a>
          <a href="#method">Our approach</a>
          <button className="fg-nav-login" onClick={() => setNotice("Sign in is ready for your team workspace.")}>Sign in</button>
          <button className="fg-nav-cta" onClick={startPlanning}>Plan this Sunday <ArrowRight size={15} /></button>
        </nav>
      </header>

      <section className="fg-intro" id="top">
        <div className="fg-intro-copy">
          <div className="fg-overline"><span className="fg-overline-line" /> A BETTER WAY TO BEGIN THE WEEK</div>
          <h1>Make room<br />for <em>meaning.</em></h1>
          <p className="fg-intro-text">Start with the message. Find the thread. Build a service that helps people feel the good news—not just hear it.</p>
          <button className="fg-text-link" onClick={() => document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" })}>
            Step into the Sunday studio <ArrowDown size={16} />
          </button>
        </div>
        <aside className="fg-intro-note">
          <span className="fg-note-index">FIELD NOTE 04 / 12</span>
          <div className="fg-note-rule" />
          <p>“The order of a service is a kind of theology. What comes first tells us what matters.”</p>
          <span className="fg-note-attribution">A THOUGHT FOR THE PLANNER</span>
          <div className="fg-sun-mark" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div>
        </aside>
      </section>

      <section className="fg-studio-section" id="studio">
        <div className="fg-section-heading">
          <div>
            <div className="fg-overline fg-overline-light"><span className="fg-overline-line" /> YOUR WEEKLY WORKSPACE</div>
            <h2>Sunday, taking shape.</h2>
          </div>
          <span className="fg-edition"><span className="fg-live-dot" /> A WORKING PLAN · 01</span>
        </div>

        <form className="fg-brief" onSubmit={handleGenerate}>
          <label className="fg-field">
            <span>THIS WEEK'S MESSAGE</span>
            <input value={sermon} onChange={(event) => setSermon(event.target.value)} aria-label="This week's message" />
          </label>
          <div className="fg-field-separator" />
          <label className="fg-field fg-scripture">
            <span>ANCHOR TEXT</span>
            <input value={scripture} onChange={(event) => setScripture(event.target.value)} aria-label="Anchor text" />
          </label>
          <button className="fg-shape-button" type="submit">
            {generated ? <Check size={16} /> : <Sparkles size={16} />}
            {generated ? "Arc refreshed" : "Find the thread"}
          </button>
        </form>

        <div className="fg-workbench">
          <div className="fg-flow-column">
            <div className="fg-workbench-top">
              <div>
                <span className="fg-mini-label">SUNDAY, MAY 18</span>
                <h3>Gathered at the table</h3>
              </div>
              <button className="fg-icon-button" aria-label="Share plan" onClick={() => {
                setNotice("Plan link copied to your clipboard.");
                window.setTimeout(() => setNotice(""), 3000);
              }}><Share2 size={16} /></button>
            </div>
            <div className="fg-timeline">
              {serviceMoments.map((moment, index) => {
                const Icon = moment.icon;
                return (
                  <button
                    className={`fg-moment ${selected === index ? "is-selected" : ""}`}
                    key={moment.label}
                    onClick={() => setSelected(index)}
                    type="button"
                  >
                    <span className="fg-moment-time">{moment.time}</span>
                    <span className="fg-moment-marker"><Icon size={15} /></span>
                    <span className="fg-moment-copy">
                      <span className="fg-moment-kind">{moment.kind}</span>
                      <span className="fg-moment-title">{moment.title}</span>
                    </span>
                    {selected === index && <span className="fg-moment-check"><Check size={12} /></span>}
                  </button>
                );
              })}
              <button className="fg-add-moment" onClick={() => {
                setNotice("New moment added to your Sunday outline.");
                window.setTimeout(() => setNotice(""), 3000);
              }} type="button"><Plus size={14} /> Add a moment</button>
            </div>
            <div className="fg-duration"><Clock3 size={14} /> ESTIMATED SERVICE <b>58 MIN</b><span>·</span> 4 MOMENTS</div>
          </div>

          <aside className="fg-insight">
            <div className="fg-insight-head">
              <span className="fg-insight-kicker"><Sparkles size={13} /> THE PASTORAL THREAD</span>
              <button className="fg-help-button" aria-label="About the pastoral thread" onClick={() => setNotice("A pastoral thread connects the message, music, and moments of response.")}><CircleHelp size={16} /></button>
            </div>
            <div className="fg-tabs" role="tablist" aria-label="Plan preview">
              {(["Arc", "Songs", "Words"] as ViewKey[]).map((tab) => (
                <button type="button" key={tab} role="tab" aria-selected={view === tab} className={view === tab ? "is-active" : ""} onClick={() => setView(tab)}>{tab}</button>
              ))}
            </div>
            <div className="fg-insight-body" key={view}>
              <span className="fg-mini-label">{current.eyebrow}</span>
              <h4>{view === "Arc" && generated ? `A thread for ${sermon || "this Sunday"}` : current.title}</h4>
              <p>{view === "Arc" && generated ? `Begin with ${scripture || "your anchor text"}; let the service move from honest hunger toward shared abundance.` : current.body}</p>
              <div className="fg-insight-foot"><span className="fg-foot-rule" /> {current.note}</div>
            </div>
            <div className="fg-insight-actions">
              <button onClick={() => {
                setSaved(!saved);
                setNotice(saved ? "Removed from your saved plans." : "Sunday plan saved to your library.");
                window.setTimeout(() => setNotice(""), 3000);
              }} className="fg-save-button">{saved ? <Check size={15} /> : <Heart size={15} />}{saved ? "Saved to library" : "Save this plan"}</button>
              <button className="fg-edit-button" onClick={() => setNotice("Your plan is ready to edit in the Sunday studio.")}>Edit plan <ArrowRight size={14} /></button>
            </div>
          </aside>
        </div>
        <div className="fg-workbench-caption"><span>01 — MESSAGE</span><span>02 — SERVICE ARC</span><span>03 — TEAM READY</span></div>
      </section>

      <section className="fg-method" id="method">
        <div className="fg-method-lead">
          <span className="fg-overline"><span className="fg-overline-line" /> NOT ANOTHER CHECKLIST</span>
          <h2>Plan the <em>why,</em><br />then the what.</h2>
          <p>Good planning isn't about filling every slot. It's noticing what this particular Sunday is asking of you—and giving your team a clear way in.</p>
          <button className="fg-text-link fg-method-link" onClick={startPlanning}>Try it with your message <ArrowRight size={16} /></button>
        </div>
        <div className="fg-method-steps">
          <article className="fg-method-step">
            <span className="fg-step-number">01</span>
            <div><h3>Bring the real context.</h3><p>Your passage, tradition, and the people in the room are the beginning—not an afterthought.</p></div>
            <FileText size={19} />
          </article>
          <article className="fg-method-step">
            <span className="fg-step-number">02</span>
            <div><h3>Find the connective tissue.</h3><p>See how songs, spoken words, and silence can carry one clear idea through the hour.</p></div>
            <Music2 size={19} />
          </article>
          <article className="fg-method-step">
            <span className="fg-step-number">03</span>
            <div><h3>Make it yours, together.</h3><p>Keep the wisdom of your team in the plan. Revise, share, and lead with room to breathe.</p></div>
            <Users size={19} />
          </article>
        </div>
      </section>

      <footer className="fg-footer">
        <a className="fg-brand fg-footer-brand" href="#top"><span className="fg-brand-mark"><Flame size={17} /></span><span>Worship<span className="fg-brand-light">Flow</span></span></a>
        <span>A little more room for what matters.</span>
        <button onClick={() => setNotice("We'd love to hear what your team is planning.")}>Talk with us <ArrowRight size={14} /></button>
      </footer>

      {notice && <div className="fg-toast" role="status"><Check size={15} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {showSetup && (
        <div className="fg-modal-backdrop" onClick={() => setShowSetup(false)} role="presentation">
          <section className="fg-modal" role="dialog" aria-modal="true" aria-labelledby="fg-modal-title" onClick={(event) => event.stopPropagation()}>
            <button className="fg-modal-close" aria-label="Close setup" onClick={() => setShowSetup(false)}><X size={18} /></button>
            <span className="fg-overline"><span className="fg-overline-line" /> START WITH THIS SUNDAY</span>
            <h2 id="fg-modal-title">What are you carrying into the room?</h2>
            <p>A message, a passage, even a half-formed thought is enough to begin.</p>
            <label className="fg-modal-input">MESSAGE OR THEME<input value={sermon} onChange={(event) => setSermon(event.target.value)} autoFocus /></label>
            <label className="fg-modal-input">SCRIPTURE<input value={scripture} onChange={(event) => setScripture(event.target.value)} /></label>
            <button className="fg-modal-submit" onClick={() => {
              setGenerated(true);
              setShowSetup(false);
              document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
              setNotice("Your Sunday workspace is ready.");
              window.setTimeout(() => setNotice(""), 3200);
            }}>Open my Sunday studio <ArrowRight size={16} /></button>
            <span className="fg-modal-foot"><ChevronDown size={13} /> Nothing is final until you make it yours.</span>
          </section>
        </div>
      )}
    </main>
  );
}