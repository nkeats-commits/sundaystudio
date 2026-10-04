import React, { useState } from 'react';
import { ArrowDownRight, ArrowRight, Check, CheckCircle2, Cross, Heart, Lightbulb, Music2, Plus, Sparkles, Trash2 } from 'lucide-react';
import './LandingSundayDesk.css';

type Song = { id: string; title: string; artist: string; moment: string };
const suggestions: Song[] = [
  { id: 'wide', title: 'All Who Are Thirsty', artist: 'Brenton Brown', moment: 'Gathering · 74 BPM' },
  { id: 'table', title: 'Come to the Table', artist: 'Sidewalk Prophets', moment: 'Response · 78 BPM' },
  { id: 'grace', title: 'Build My Life', artist: 'Pat Barrett', moment: 'Sending · 68 BPM' },
];

const openingItems = [
  { title: 'Welcome & quieting', kind: 'Gather · 2 min', time: '9:00' },
  { title: 'All Who Are Thirsty', kind: 'Gathering song · E', time: '9:03' },
  { title: 'Prayer of approach', kind: 'Liturgy · 3 min', time: '9:08' },
  { title: 'Luke 14:15–24', kind: 'Scripture reading', time: '9:12' },
];

export default function LandingSundayDesk() {
  const [theme, setTheme] = useState('Welcome');
  const [scripture, setScripture] = useState('Luke 14:15–24');
  const [tone, setTone] = useState('Room to breathe');
  const [songs, setSongs] = useState<Song[]>([{ ...suggestions[0] }]);
  const [saved, setSaved] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [extraMoment, setExtraMoment] = useState(false);
  const [toast, setToast] = useState('');

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2300);
  };
  const jumpToStudio = () => document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' });
  const toggleSong = (song: Song) => {
    setSongs(current => current.some(item => item.id === song.id)
      ? current.filter(item => item.id !== song.id)
      : [...current, song]);
    setSaved(false);
  };
  const addMoment = () => {
    setExtraMoment(value => !value);
    setSaved(false);
  };
  const createDraft = () => {
    setDrafted(true);
    setSongs(current => current.some(item => item.id === 'table') ? current : [...current, suggestions[1]]);
    setSaved(false);
    notify('A first musical arc is ready to shape.');
  };
  const orderedPlan = [...openingItems, ...songs.slice(1).map(song => ({ title: song.title, kind: song.moment, time: '9:18' }))];

  return (
    <main className="sunday-desk">
      <div className="sd-shell">
        <nav className="sd-nav" aria-label="Main navigation">
          <a className="sd-brand" href="#top" aria-label="Sunday Studio home">
            <span className="sd-brand-mark"><Cross size={18} strokeWidth={1.7} /></span>
            <span className="sd-brand-name">sunday<em>studio</em></span>
          </a>
          <div className="sd-navlinks">
            <a href="#studio">The studio</a>
            <a href="#approach">Our approach</a>
            <a href="#footer">For your team</a>
            <button className="sd-button sd-button-primary sd-button-small" onClick={jumpToStudio}>Build a Sunday <ArrowRight size={14} /></button>
          </div>
        </nav>

        <section className="sd-hero" id="top">
          <div className="sd-hero-copy">
            <div className="sd-kicker">A quieter kind of preparation</div>
            <h1 className="sd-serif">Start with the <span>message.</span><br />Find the music.</h1>
            <p>Sunday Studio helps worship leaders shape a service around what matters—then gives the whole team a clear, thoughtful place to begin.</p>
            <div className="sd-hero-actions">
              <button className="sd-button sd-button-primary" onClick={jumpToStudio}>Try a Sunday brief <ArrowDownRight size={15} /></button>
              <button className="sd-text-button" onClick={() => notify('Your first plan is waiting just below.')}>Take a look <ArrowRight size={13} /></button>
            </div>
            <div className="sd-note"><CheckCircle2 size={14} /> A useful first draft. Always yours to change.</div>
          </div>

          <div className="sd-preview-wrap" aria-label="Example Sunday service plan">
            <div className="sd-preview">
              <div className="sd-preview-top"><span className="sd-preview-title">This Sunday, in outline</span><span className="sd-status"><i /> In progress</span></div>
              <div className="sd-context">
                <span className="sd-context-mark"><img src="/__mockup/images/landing-sunday-desk-editorial.png" alt="" /></span>
                <div className="sd-context-copy"><small>Message / Luke 14:15–24</small><strong>The table is wide enough</strong><em>Hospitality · belonging · invitation</em></div>
              </div>
              <div className="sd-mini-plan">
                <span className="sd-mini-time">09:00</span><div className="sd-mini-item"><strong>Make a little room</strong><span>WELCOME &amp; GATHERING</span></div>
                <span className="sd-mini-time">09:12</span><div className="sd-mini-item"><strong>Come to the table</strong><span>SCRIPTURE &amp; RESPONSE</span></div>
                <span className="sd-mini-time">09:34</span><div className="sd-mini-item"><strong>Carry the invitation</strong><span>BLESSING &amp; SENDING</span></div>
              </div>
              <div className="sd-preview-foot"><span>3 moments · 1 connected arc</span><span><Heart size={12} /> Made for your people</span></div>
            </div>
          </div>
        </section>

        <div className="sd-chapter">
          <span>Not another song list</span>
          <p>Begin with the sermon. Let every moment carry the same thread.</p>
          <strong>Prepare with purpose ↓</strong>
        </div>
      </div>

      <section className="sd-studio-section" id="studio">
        <div className="sd-shell">
          <div className="sd-studio-heading">
            <div><div className="sd-kicker">Your Sunday, taking shape</div><h2 className="sd-serif">Give the message<br />a musical shape.</h2></div>
            <p>Start with what you’re teaching. We’ll help you find a thoughtful arc—not a finished script you have to undo.</p>
          </div>
          <div className="sd-workspace">
            <aside className="sd-workspace-aside">
              <div className="sd-field"><label className="sd-label" htmlFor="message-theme">This week’s message</label><input id="message-theme" value={theme} onChange={event => { setTheme(event.target.value); setSaved(false); }} aria-label="This week's message" /></div>
              <div className="sd-field"><label className="sd-label" htmlFor="scripture-passage">Scripture</label><input className="sd-scripture-input" id="scripture-passage" value={scripture} onChange={event => { setScripture(event.target.value); setSaved(false); }} /></div>
              <span className="sd-label">The room should feel…</span>
              <div className="sd-tone-list" role="group" aria-label="Choose service atmosphere">
                {['Room to breathe', 'Joyful & open', 'Quiet & contemplative'].map(option => (
                  <button className={`sd-tone${tone === option ? ' active' : ''}`} key={option} onClick={() => { setTone(option); setSaved(false); }}>
                    <span className="sd-tone-dot" />{option}
                  </button>
                ))}
              </div>
              <div className="sd-brief-foot">A good plan leaves room<br />for the Holy Spirit—and people.</div>
            </aside>

            <section className="sd-plan" aria-label="Service plan">
              <div className="sd-plan-top"><h3 className="sd-serif">{drafted ? 'A first draft for Sunday' : 'A first shape'}</h3><span className="sd-count">{orderedPlan.length + (extraMoment ? 1 : 0)} MOMENTS</span></div>
              <div className="sd-timeline">
                {orderedPlan.map((item, index) => (
                  <div className="sd-row" key={`${item.title}-${index}`}>
                    <span className="sd-row-time">{item.time}</span>
                    <div className="sd-row-body"><span className="sd-row-index">{String(index + 1).padStart(2, '0')}</span><div className="sd-row-info"><strong>{item.title}</strong><span>{item.kind}</span></div>
                      {index > 3 && <button className="sd-row-remove" aria-label={`Remove ${item.title}`} onClick={() => toggleSong(songs.find(song => song.title === item.title) ?? suggestions[1])}><Trash2 size={13} /></button>}
                    </div>
                  </div>
                ))}
                {extraMoment && <div className="sd-row"><span className="sd-row-time">9:29</span><div className="sd-row-body"><span className="sd-row-index">{String(orderedPlan.length + 1).padStart(2, '0')}</span><div className="sd-row-info"><strong>A breath before the word</strong><span>Quiet reflection · 2 min</span></div><button className="sd-row-remove" aria-label="Remove quiet reflection" onClick={addMoment}><Trash2 size={13} /></button></div></div>}
              </div>
              <button className="sd-add-moment" onClick={addMoment}>{extraMoment ? <Check size={13} /> : <Plus size={13} />}{extraMoment ? 'Quiet reflection added' : 'Add a quiet reflection'}</button>
              <div className="sd-plan-actions">
                <button className={`sd-save${saved ? ' is-saved' : ''}`} onClick={() => { setSaved(value => !value); notify(saved ? 'Plan unsaved.' : 'Plan saved to your Sunday shelf.'); }}><Heart size={14} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Saved to your shelf' : 'Save this shape'}</button>
                <button className="sd-button sd-button-primary sd-button-small" onClick={createDraft}><Sparkles size={13} />{drafted ? 'Refresh the draft' : 'Find the arc'}</button>
              </div>
            </section>

            <aside className="sd-song-panel">
              <div className="sd-song-panel-head"><h3 className="sd-serif">Songs to consider</h3><button onClick={() => { setSongs(current => current.some(song => song.id === 'grace') ? current.filter(song => song.id !== 'grace') : [...current, suggestions[2]]); setSaved(false); }}>Try a different one</button></div>
              <p className="sd-song-note">A few starting points for “{theme || 'your message'}” · {tone.toLowerCase()}</p>
              <div className="sd-song-options">
                {suggestions.map(song => {
                  const isAdded = songs.some(item => item.id === song.id);
                  return <div className="sd-song-option" key={song.id}>
                    <span className="sd-song-art"><Music2 size={15} /></span>
                    <span className="sd-song-info"><strong>{song.title}</strong><span>{song.artist} · {song.moment}</span></span>
                    <button className={`sd-song-add${isAdded ? ' added' : ''}`} aria-label={`${isAdded ? 'Remove' : 'Add'} ${song.title}`} onClick={() => toggleSong(song)}>{isAdded ? <Check size={13} /> : <Plus size={13} />}</button>
                  </div>;
                })}
              </div>
              <div className="sd-ai-note"><Lightbulb size={13} /><span>These are invitations, not answers. Keep what sounds like your congregation.</span></div>
            </aside>
          </div>
        </div>
      </section>

      <section className="sd-shell sd-after" id="approach">
        <div className="sd-after-copy"><div className="sd-kicker">A service is more than its parts</div><h2 className="sd-serif">One thread.<br />All the way through.</h2><p>Bring the sermon, the songs, and the spoken moments into conversation. Then hand a clear, living plan to the people who will make it real.</p></div>
        <div className="sd-arc">
          <div className="sd-arc-item"><span>01 / LISTEN</span><strong>Find the thread</strong><p>Start with scripture, theme, and the heart of this week’s message.</p></div>
          <div className="sd-arc-item"><span>02 / SHAPE</span><strong>Build the arc</strong><p>Gather songs and words around one idea your people can carry.</p></div>
          <div className="sd-arc-item"><span>03 / SHARE</span><strong>Bring the team in</strong><p>Make the plan together. Arrive on Sunday with room to be present.</p></div>
        </div>
      </section>

      <section className="sd-close">
        <div className="sd-shell sd-close-inner"><h2>Make space for the work only you can do.</h2><button className="sd-button" onClick={jumpToStudio}>Shape a Sunday <ArrowRight size={15} /></button></div>
      </section>
      <footer className="sd-shell sd-footer" id="footer">
        <span className="sd-footer-brand"><Cross size={13} /> sundaystudio · for the people who lead us in song.</span>
        <span><a href="#top">Back to the beginning ↑</a>　·　 made for Sunday, and every day before it.</span>
      </footer>
      {toast && <div className="sd-toast" role="status">{toast}</div>}
    </main>
  );
}