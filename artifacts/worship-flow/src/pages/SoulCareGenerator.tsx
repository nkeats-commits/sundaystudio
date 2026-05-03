import { useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  Save,
  Loader2,
  Sprout,
  Copy,
  AlertCircle,
  CalendarPlus,
  Printer,
  User,
  Users,
} from 'lucide-react';
import {
  useCreateLibraryItem,
  getListLibraryItemsQueryKey,
  type GeneratedSoulCare,
  type LibraryItem,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useJobGenerate } from '../hooks/useJobGenerate';
import { ProfileRequiredBanner } from '../components/ProfileRequiredGate';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { AddToServiceDialog } from '../components/AddToServiceDialog';

type Audience = 'self' | 'team';

const SEASONS = [
  { value: 'burnout', label: 'Burnout / depleted' },
  { value: 'grief', label: 'Grief / loss' },
  { value: 'anticipation', label: 'Anticipation / longing' },
  { value: 'ordinary time', label: 'Ordinary time' },
  { value: 'post-Easter', label: 'Post-Easter' },
  { value: 'Advent waiting', label: 'Advent waiting' },
  { value: 'Lenten dryness', label: 'Lenten dryness' },
  { value: 'celebration', label: 'Celebration / gratitude' },
  { value: 'transition', label: 'Transition / change' },
  { value: 'conflict', label: 'Conflict / tension' },
];

const PRACTICES = [
  { value: 'auto', label: 'Let us choose for you' },
  { value: 'examen', label: 'Examen (Ignatian)' },
  { value: 'lectio_divina', label: 'Lectio Divina' },
  { value: 'centering_prayer', label: 'Centering Prayer' },
  { value: 'silence_solitude', label: 'Silence & Solitude' },
  { value: 'gratitude', label: 'Gratitude' },
  { value: 'lament', label: 'Lament' },
  { value: 'sabbath', label: 'Sabbath' },
  { value: 'breath_prayer', label: 'Breath Prayer' },
];

const INTENT_MAX = 4000;

export default function SoulCareGenerator() {
  const [formData, setFormData] = useState({
    audience: 'self' as Audience,
    intent: '',
    season: 'ordinary time',
    practiceTemplate: 'auto',
    durationMinutes: 25,
  });

  const generate = useJobGenerate<GeneratedSoulCare>('/api/generate/soul-care');
  const createLibraryItem = useCreateLibraryItem();
  const queryClient = useQueryClient();
  const lastSubmittedRef = useRef<typeof formData | null>(null);
  const { ready: profileReady } = useChurchProfileReady();
  const { allowed: subAllowed } = useSubscriptionStatus();
  const [savedItem, setSavedItem] = useState<LibraryItem | null>(null);
  const [addToServiceOpen, setAddToServiceOpen] = useState(false);
  const savePromiseRef = useRef<Promise<LibraryItem> | null>(null);

  const runGeneration = (body?: typeof formData) => {
    if (!profileReady) {
      toast.error('Set up your profile first.', {
        description: 'Helps tailor the session to your context.',
      });
      return;
    }
    const payload = body ?? lastSubmittedRef.current ?? formData;
    lastSubmittedRef.current = payload;
    setSavedItem(null);
    savePromiseRef.current = null;
    const trimmedIntent = payload.intent.trim();
    const requestBody = {
      audience: payload.audience,
      season: payload.season,
      practiceTemplate: payload.practiceTemplate,
      durationMinutes: payload.durationMinutes,
      ...(trimmedIntent
        ? { intent: trimmedIntent.slice(0, INTENT_MAX) }
        : {}),
    };
    generate.mutate(requestBody).catch((err: Error) => {
      toast.error(err.message || 'Generation failed. Please try again.');
    });
  };

  const buildLibraryPayload = () => ({
    kind: 'soul_care' as const,
    title: generate.data!.title,
    content: generate.data as unknown as Record<string, unknown>,
    tags: [
      formData.audience === 'self' ? 'personal' : 'team',
      generate.data!.practiceTradition,
      `${generate.data!.durationMinutes} min`,
      formData.season,
    ],
  });

  const ensureSaved = (): Promise<LibraryItem> => {
    if (savedItem) return Promise.resolve(savedItem);
    if (savePromiseRef.current) return savePromiseRef.current;
    if (!generate.data) return Promise.reject(new Error('Nothing to save yet'));
    const promise = (async () => {
      try {
        const item = await createLibraryItem.mutateAsync({
          data: buildLibraryPayload(),
        });
        queryClient.invalidateQueries({
          queryKey: getListLibraryItemsQueryKey(),
        });
        setSavedItem(item);
        return item;
      } finally {
        savePromiseRef.current = null;
      }
    })();
    savePromiseRef.current = promise;
    return promise;
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    runGeneration({ ...formData });
  };

  const handleSave = () => {
    if (!generate.data || savedItem) return;
    ensureSaved()
      .then(() => toast.success('Saved to Library'))
      .catch((err: Error) => toast.error(err.message || 'Could not save'));
  };

  const handlePrint = () => {
    if (!generate.data) return;
    const d = generate.data;
    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const paras = (s: string) =>
      s
        .split('\n\n')
        .map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`)
        .join('');
    const audienceLabel = formData.audience === 'self' ? 'Personal' : 'Team';
    const practicesHtml = d.practices
      .map(
        (p, i) => `
        <section class="practice">
          <div class="practice-head">
            <h3>${i + 1}. ${esc(p.name)}</h3>
            ${p.durationMinutes ? `<span class="dur">${p.durationMinutes} min</span>` : ''}
          </div>
          ${paras(p.instructions)}
        </section>`,
      )
      .join('');
    const promptsHtml =
      d.journalingPrompts && d.journalingPrompts.length > 0
        ? `
      <section class="prompts">
        <h2>Journaling Prompts</h2>
        <ol>${d.journalingPrompts.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
      </section>`
        : '';
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(d.title)}</title>
<style>
  @page { margin: 0.6in; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f2937; margin: 0; padding: 32px; line-height: 1.55; max-width: 7.5in; }
  h1 { font-size: 22pt; margin: 0 0 6px; color: #0f1d3d; font-weight: 600; }
  h2 { font-size: 11pt; margin: 0 0 8px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
  h3 { font-size: 13pt; margin: 0; color: #0f1d3d; font-weight: 600; }
  p { margin: 0 0 10px; font-size: 11pt; }
  .meta { font-size: 9pt; color: #6b7280; margin: 0 0 24px; }
  .badges { margin: 4px 0 24px; }
  .badge { display: inline-block; font-size: 8pt; padding: 2px 8px; border-radius: 999px; background: #f3e9c7; color: #8a6d1f; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-right: 6px; }
  .badge.alt { background: #f5f1e8; color: #4a5568; border: 1px solid #e5e7eb; }
  section { margin: 0 0 24px; page-break-inside: avoid; }
  .leader-notes { font-style: italic; color: #4a5568; background: #faf6ec; border-left: 2px solid #c9a443; padding: 10px 14px; font-size: 10pt; }
  .scripture { background: #faf6ec; border-left: 2px solid #c9a443; padding: 16px 18px; }
  .scripture .ref { font-size: 9pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin: 0 0 8px; }
  .scripture .text { font-style: italic; color: #0f1d3d; font-size: 13pt; margin: 0 0 10px; }
  .scripture .reflection { font-size: 10.5pt; }
  .practice { border-left: 2px solid #d6dbe5; padding-left: 14px; margin-bottom: 18px; }
  .practice-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; gap: 12px; }
  .dur { font-size: 9pt; color: #c9a443; font-weight: 600; white-space: nowrap; }
  .closing { background: #0f1d3d; color: #fff; padding: 18px 22px; border-radius: 6px; }
  .closing h2 { color: #efe1b6; }
  .closing p { font-style: italic; margin: 0; }
  .prompts ol { padding-left: 20px; }
  .prompts li { margin: 0 0 8px; padding-left: 4px; }
  .take-home { border-top: 1px solid #e5e7eb; padding-top: 14px; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <h1>${esc(d.title)}</h1>
  <div class="badges">
    <span class="badge">${esc(d.practiceTradition)}</span>
    <span class="badge alt">${d.durationMinutes} min</span>
    <span class="badge alt">${audienceLabel}</span>
  </div>
  <p class="meta">Soul Care · printed from WorshipFlow · ${esc(new Date().toLocaleDateString())}</p>
  ${d.leaderNotes ? `<div class="leader-notes">${esc(d.leaderNotes)}</div>` : ''}
  <section>
    <h2>Opening</h2>
    ${paras(d.opening)}
  </section>
  <section class="scripture">
    <p class="ref">Scripture — ${esc(d.scripture.reference)}</p>
    <p class="text">"${esc(d.scripture.text)}"</p>
    <p class="reflection">${esc(d.scripture.reflection)}</p>
  </section>
  <section>
    <h2>Guided Practice</h2>
    ${practicesHtml}
  </section>
  ${promptsHtml}
  <section class="closing">
    <h2>Closing</h2>
    <p>${esc(d.closing)}</p>
  </section>
  <section class="take-home">
    <h2>Take-home Practice</h2>
    <p>${esc(d.takeHomePractice)}</p>
  </section>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 100);
    });
  </script>
</body>
</html>`;
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Pop-up blocked. Please allow pop-ups to print.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const handleCopy = () => {
    if (!generate.data) return;
    const d = generate.data;
    const text = [
      d.title,
      `(${d.practiceTradition} · ${d.durationMinutes} min)`,
      '',
      d.leaderNotes ? `Leader notes:\n${d.leaderNotes}\n` : '',
      `Opening:\n${d.opening}`,
      '',
      `Scripture — ${d.scripture.reference}\n${d.scripture.text}\n\n${d.scripture.reflection}`,
      '',
      ...d.practices.map(
        (p) =>
          `${p.name}${p.durationMinutes ? ` (${p.durationMinutes} min)` : ''}\n${p.instructions}`,
      ),
      '',
      `Journaling Prompts:\n${d.journalingPrompts.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
      '',
      `Closing:\n${d.closing}`,
      '',
      `Take-home practice:\n${d.takeHomePractice}`,
    ].join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const audienceBtn = (value: Audience, label: string, Icon: typeof User) => {
    const active = formData.audience === value;
    return (
      <button
        type="button"
        onClick={() => setFormData({ ...formData, audience: value })}
        data-testid={`audience-${value}`}
        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          active
            ? 'border-[var(--worship-gold)] bg-[var(--worship-pale-gold)]/40 text-[var(--worship-navy)]'
            : 'border-[var(--worship-border)] bg-white text-[var(--worship-slate)] hover:bg-[var(--worship-cream)]'
        }`}
      >
        <Icon className="w-4 h-4" />
        {label}
      </button>
    );
  };

  return (
    <AppLayout title="Soul Care">
      <ProfileRequiredBanner variant="inline" />
      <div className="flex flex-col md:flex-row gap-8 h-auto min-h-[calc(100vh-8rem)]">
        {/* FORM */}
        <div className="w-full md:w-1/3 flex flex-col space-y-6">
          <div className="pb-4 border-b border-[var(--worship-border)]">
            <h2 className="text-xl font-serif text-[var(--worship-navy)]">
              Tend to the Soul
            </h2>
            <p className="text-sm text-[var(--worship-slate)] mt-1">
              A guided session in the historic Christian contemplative tradition —
              for yourself, or to lead with your team.
            </p>
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-2 text-[var(--worship-slate)]">
                WHO IS THIS FOR?
              </label>
              <div className="flex gap-2">
                {audienceBtn('self', 'Myself', User)}
                {audienceBtn('team', 'My team', Users)}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--worship-slate)]">
                  WHAT'S ON YOUR HEART? (OPTIONAL)
                </label>
                <span
                  className={`text-[10px] ${formData.intent.length > INTENT_MAX ? 'text-red-600' : 'text-[var(--worship-muted-slate)]'}`}
                >
                  {formData.intent.length}/{INTENT_MAX}
                </span>
              </div>
              <textarea
                value={formData.intent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    intent: e.target.value.slice(0, INTENT_MAX),
                  })
                }
                placeholder="Whatever you'd bring to a spiritual director — grief, weariness, a longing, a tension on the team, gratitude…"
                rows={5}
                data-testid="input-intent"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm leading-relaxed resize-y"
              />
              <p className="text-[10px] text-[var(--worship-muted-slate)] mt-1 italic">
                Held privately and not quoted back. It quietly shapes the
                session.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">
                SEASON / STATE
              </label>
              <select
                value={formData.season}
                onChange={(e) =>
                  setFormData({ ...formData, season: e.target.value })
                }
                data-testid="select-season"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm"
              >
                {SEASONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">
                PRACTICE TRADITION
              </label>
              <select
                value={formData.practiceTemplate}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    practiceTemplate: e.target.value,
                  })
                }
                data-testid="select-practice"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm"
              >
                {PRACTICES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between">
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">
                  LENGTH
                </label>
                <span className="text-xs text-[var(--worship-gold)] font-medium">
                  {formData.durationMinutes} min
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={formData.durationMinutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    durationMinutes: parseInt(e.target.value),
                  })
                }
                className="w-full accent-[var(--worship-gold)]"
              />
            </div>

            <button
              type="submit"
              disabled={generate.isPending || !profileReady || !subAllowed}
              title={
                !subAllowed
                  ? 'Subscribe to enable AI generation'
                  : !profileReady
                  ? 'Finish your profile to enable AI generation'
                  : undefined
              }
              data-testid="button-generate"
              className="w-full py-3 rounded-xl font-medium text-white worship-btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Preparing...
                </>
              ) : (
                'Generate Session'
              )}
            </button>
          </form>
        </div>

        {/* OUTPUT */}
        <div className="w-full md:w-2/3 bg-white rounded-2xl border border-[var(--worship-border)] shadow-sm relative min-h-[400px]">
          {!generate.data && !generate.isPending && !generate.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
              <Sprout className="w-12 h-12 text-[var(--worship-gold)] opacity-50 mb-4" />
              <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">
                Make a little space
              </h3>
              <p className="text-[var(--worship-slate)] max-w-sm text-sm">
                Soul care is the slow, steady work of letting God tend to you so
                you can tend to others. Begin when you're ready.
              </p>
            </div>
          )}

          {generate.isPending && (
            <div className="absolute inset-0 flex flex-col p-8 bg-[var(--worship-cream)]/80 backdrop-blur-sm rounded-2xl z-10">
              <div className="flex flex-col items-center text-center mb-4">
                <Loader2 className="w-10 h-10 animate-spin text-[var(--worship-gold)] mb-4" />
                <h3 className="font-serif text-xl text-[var(--worship-navy)]">
                  Preparing the session...
                </h3>
                {generate.partialText.length > 0 && (
                  <p className="text-xs text-[var(--worship-slate)] mt-2">
                    {generate.partialText.length} characters received
                  </p>
                )}
              </div>
              {generate.partialText.length > 0 && (
                <div className="flex-1 overflow-y-auto rounded-lg bg-white/70 border border-[var(--worship-border)] p-4 text-sm font-mono text-[var(--worship-charcoal)] whitespace-pre-wrap leading-relaxed">
                  {generate.partialText}
                </div>
              )}
            </div>
          )}

          {generate.error && !generate.isPending && !generate.data && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
              <AlertCircle className="w-12 h-12 text-red-500 opacity-80 mb-4" />
              <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">
                Generation failed
              </h3>
              <p className="text-[var(--worship-slate)] max-w-sm text-sm mb-5">
                {generate.error.message}
              </p>
              <button
                onClick={() => runGeneration()}
                className="px-5 py-2.5 rounded-lg font-medium text-sm worship-btn-primary text-white"
              >
                Try again
              </button>
            </div>
          )}

          {generate.data && !generate.isPending && (
            <div className="p-8 h-full flex flex-col max-h-[calc(100vh-10rem)] overflow-y-auto">
              <div className="flex justify-between items-start mb-6 gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-serif text-[var(--worship-navy)]">
                    {generate.data.title}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-bold">
                      {generate.data.practiceTradition}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--worship-cream)] text-[var(--worship-slate)] font-bold border border-[var(--worship-border)]">
                      {generate.data.durationMinutes} min
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--worship-cream)] text-[var(--worship-slate)] font-bold border border-[var(--worship-border)]">
                      {formData.audience === 'self' ? 'Personal' : 'Team'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg border border-[var(--worship-border)] text-[var(--worship-slate)] hover:bg-slate-50 transition-colors"
                    title="Copy"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handlePrint}
                    data-testid="button-print"
                    className="p-2 rounded-lg border border-[var(--worship-border)] text-[var(--worship-slate)] hover:bg-slate-50 transition-colors"
                    title="Print"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={createLibraryItem.isPending || !!savedItem || !subAllowed}
                    title={!subAllowed ? 'Subscribe to save items' : undefined}
                    className="px-4 py-2 rounded-lg font-medium text-sm worship-btn-gold flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />{' '}
                    {createLibraryItem.isPending
                      ? 'Saving...'
                      : savedItem
                        ? 'Saved'
                        : 'Save'}
                  </button>
                  <button
                    onClick={() => setAddToServiceOpen(true)}
                    className="px-4 py-2 rounded-lg font-medium text-sm border border-[var(--worship-border)] text-[var(--worship-navy)] hover:bg-[var(--worship-cream)] flex items-center gap-2"
                    data-testid="button-add-to-service"
                  >
                    <CalendarPlus className="w-4 h-4" /> Add to service
                  </button>
                </div>
              </div>

              <div className="space-y-8 text-[var(--worship-charcoal)] pb-8">
                {generate.data.leaderNotes && (
                  <div className="text-xs italic text-[var(--worship-slate)] bg-[var(--worship-cream)]/60 border-l-2 border-[var(--worship-gold)] pl-3 py-2">
                    {generate.data.leaderNotes}
                  </div>
                )}

                <section>
                  <h3 className="font-serif text-xs uppercase tracking-widest text-[var(--worship-slate)] mb-2">
                    Opening
                  </h3>
                  <div className="space-y-3 text-base leading-relaxed">
                    {generate.data.opening
                      .split('\n\n')
                      .map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                  </div>
                </section>

                <section className="p-5 bg-[var(--worship-cream)] rounded-xl border-l-2 border-[var(--worship-gold)]">
                  <p className="text-xs uppercase tracking-widest text-[var(--worship-slate)] font-semibold mb-2">
                    Scripture — {generate.data.scripture.reference}
                  </p>
                  <p className="font-serif italic text-lg leading-relaxed text-[var(--worship-navy)] mb-3">
                    "{generate.data.scripture.text}"
                  </p>
                  <p className="text-sm leading-relaxed">
                    {generate.data.scripture.reflection}
                  </p>
                </section>

                <section className="space-y-6">
                  <h3 className="font-serif text-xs uppercase tracking-widest text-[var(--worship-slate)]">
                    Guided Practice
                  </h3>
                  {generate.data.practices.map((practice, idx) => (
                    <div
                      key={idx}
                      className="border-l-2 border-[var(--worship-navy)]/20 pl-4"
                    >
                      <div className="flex items-baseline justify-between mb-2 gap-3">
                        <h4 className="font-serif text-lg text-[var(--worship-navy)]">
                          {idx + 1}. {practice.name}
                        </h4>
                        {practice.durationMinutes ? (
                          <span className="text-xs text-[var(--worship-gold)] font-medium shrink-0">
                            {practice.durationMinutes} min
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-3 text-base leading-relaxed">
                        {practice.instructions
                          .split('\n\n')
                          .map((p, i) => (
                            <p key={i}>{p}</p>
                          ))}
                      </div>
                    </div>
                  ))}
                </section>

                {generate.data.journalingPrompts &&
                  generate.data.journalingPrompts.length > 0 && (
                    <section className="pt-6 border-t border-[var(--worship-border)]">
                      <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-4">
                        Journaling Prompts
                      </h3>
                      <ol className="list-decimal pl-5 space-y-3 marker:text-[var(--worship-gold)] marker:font-medium">
                        {generate.data.journalingPrompts.map((q, i) => (
                          <li key={i} className="pl-2">
                            {q}
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}

                <section className="p-6 bg-[var(--worship-navy)] text-white rounded-xl">
                  <h3 className="font-serif text-lg text-[var(--worship-pale-gold)] mb-3">
                    Closing
                  </h3>
                  <p className="font-serif italic leading-relaxed">
                    {generate.data.closing}
                  </p>
                </section>

                <section>
                  <h3 className="font-serif text-xs uppercase tracking-widest text-[var(--worship-slate)] mb-2">
                    Take-home practice
                  </h3>
                  <p className="text-base leading-relaxed">
                    {generate.data.takeHomePractice}
                  </p>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
      {generate.data && (
        <AddToServiceDialog
          open={addToServiceOpen}
          onClose={() => setAddToServiceOpen(false)}
          kind="soul_care"
          ensureSaved={ensureSaved}
        />
      )}
    </AppLayout>
  );
}
