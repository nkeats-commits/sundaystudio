import { useEffect, useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Save, Loader2, BookOpen, Copy, AlertCircle, CalendarPlus, ArrowRight } from 'lucide-react';
import { useCreateLibraryItem, getListLibraryItemsQueryKey, type GeneratedLiturgy, type LibraryItem } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useJobGenerate } from '../hooks/useJobGenerate';
import { ProfileRequiredBanner } from '../components/ProfileRequiredGate';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { AddToServiceDialog } from '../components/AddToServiceDialog';
import { useLocation } from 'wouter';

const LITURGY_PHASES = [
  'Reading your theme and scripture…',
  'Drawing on your tradition and season…',
  'Shaping the liturgical language…',
  'Finishing your liturgy…',
];

export default function LiturgyGenerator() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    kind: 'call_to_worship' as const,
    theme: '',
    scripture: '',
    season: 'Ordinary Time',
    tone: 'warm, pastoral, theologically grounded',
    format: 'call_response' as 'call_response' | 'leader_only',
    alignmentNotes: '',
  });
  const ALIGNMENT_MAX = 4000;
  
  const generate = useJobGenerate<GeneratedLiturgy>('/api/generate/liturgy');
  const createLibraryItem = useCreateLibraryItem();
  const queryClient = useQueryClient();
  const lastSubmittedRef = useRef<typeof formData | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  useEffect(() => {
    if (!generate.isPending) { setPhaseIdx(0); return; }
    const t = setInterval(() => setPhaseIdx((i) => (i + 1) % LITURGY_PHASES.length), 3000);
    return () => clearInterval(t);
  }, [generate.isPending]);
  const { ready: profileReady } = useChurchProfileReady();
  const { allowed: subAllowed } = useSubscriptionStatus();
  // Saved library item for the current generation, keyed by reset on each
  // new generation so we never link a stale item from the previous draft.
  const [savedItem, setSavedItem] = useState<LibraryItem | null>(null);
  const [addToServiceOpen, setAddToServiceOpen] = useState(false);
  // Tracks the in-flight create-library-item promise so concurrent Save +
  // Add-to-service clicks share one network call instead of double-saving.
  const savePromiseRef = useRef<Promise<LibraryItem> | null>(null);

  // Centralized so both initial submit and "Try again" go through the
  // same profile gate; never short-circuit it from a caller.
  const runGeneration = (body?: typeof formData) => {
    if (!profileReady) {
      toast.error("Set up your profile first.", {
        description: "It powers tradition-aware generation.",
      });
      return;
    }
    const payload = body ?? lastSubmittedRef.current ?? formData;
    lastSubmittedRef.current = payload;
    setSavedItem(null);
    savePromiseRef.current = null;
    const trimmedAlignment = payload.alignmentNotes.trim();
    const requestBody = {
      kind: payload.kind,
      theme: payload.theme,
      scripture: payload.scripture || undefined,
      season: payload.season,
      tone: payload.tone,
      format: payload.format,
      ...(trimmedAlignment ? { alignmentNotes: trimmedAlignment.slice(0, ALIGNMENT_MAX) } : {}),
    };
    generate.mutate(requestBody).catch((err: Error) => {
      toast.error(err.message || "Generation failed. Please try again.");
    });
  };

  const buildLibraryPayload = () => ({
    kind: 'liturgy' as const,
    title: generate.data!.title,
    content: generate.data as any,
    tags: [formData.kind.replace(/_/g, ' '), formData.season],
  });

  const ensureSaved = (): Promise<LibraryItem> => {
    if (savedItem) return Promise.resolve(savedItem);
    if (savePromiseRef.current) return savePromiseRef.current;
    if (!generate.data) return Promise.reject(new Error('Nothing to save yet'));
    const promise = (async () => {
      try {
        const item = await createLibraryItem.mutateAsync({ data: buildLibraryPayload() });
        queryClient.invalidateQueries({ queryKey: getListLibraryItemsQueryKey() });
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
    if (!formData.theme) {
      toast.error("Please provide a theme or topic.");
      return;
    }
    runGeneration({ ...formData });
  };

  const handleSave = () => {
    if (!generate.data || savedItem) return;
    ensureSaved()
      .then(() => toast.success("Saved to Library"))
      .catch((err: Error) => toast.error(err.message || "Could not save"));
  };

  const handleCopy = () => {
    if (!generate.data) return;
    navigator.clipboard.writeText(generate.data.title + '\n\n' + generate.data.body);
    toast.success("Copied to clipboard");
  };

  return (
    <AppLayout title="Liturgy Generator">
      <ProfileRequiredBanner variant="inline" />
      <div className="flex flex-col md:flex-row gap-8 h-auto min-h-[calc(100vh-8rem)]">

        {/* FORM */}
        <div className="w-full md:w-1/3 flex flex-col space-y-6">
          <div className="pb-4 border-b border-[var(--worship-border)]">
            <h2 className="text-xl font-serif text-[var(--worship-navy)]">Generate Liturgy</h2>
            <p className="text-sm text-[var(--worship-slate)] mt-1">Thoughtful words for worship.</p>
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">LITURGY TYPE</label>
              <select 
                value={formData.kind} 
                onChange={e => setFormData({...formData, kind: e.target.value as any})}
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              >
                <option value="call_to_worship">Call to Worship</option>
                <option value="opening_prayer">Opening Prayer</option>
                <option value="confession">Prayer of Confession</option>
                <option value="assurance">Assurance of Pardon</option>
                <option value="prayer_of_the_people">Prayer of the People</option>
                <option value="communion">Communion Liturgy</option>
                <option value="benediction">Benediction</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">THEME / TOPIC *</label>
              <input 
                type="text" 
                value={formData.theme}
                onChange={e => setFormData({...formData, theme: e.target.value})}
                placeholder="e.g. Grace, repentance, joy, advent hope"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">SCRIPTURE (OPTIONAL)</label>
              <input 
                type="text" 
                value={formData.scripture}
                onChange={e => setFormData({...formData, scripture: e.target.value})}
                placeholder="e.g. Romans 8:1-11"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">SEASON</label>
              <input 
                type="text" 
                value={formData.season}
                onChange={e => setFormData({...formData, season: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">TONE</label>
              <input 
                type="text" 
                value={formData.tone}
                onChange={e => setFormData({...formData, tone: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">FORMAT</label>
              <div role="radiogroup" aria-label="Output format" className="grid grid-cols-2 gap-1 p-1 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)]">
                {([
                  { value: 'call_response', label: 'Call & response', hint: 'Leader / People' },
                  { value: 'leader_only', label: 'Leader speaks', hint: 'Single voice' },
                ] as const).map(opt => {
                  const active = formData.format === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFormData({ ...formData, format: opt.value })}
                      data-testid={`format-${opt.value}`}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        active
                          ? 'bg-white text-[var(--worship-navy)] shadow-sm border border-[var(--worship-border)]'
                          : 'text-[var(--worship-slate)] hover:text-[var(--worship-navy)]'
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-[10px] font-normal text-[var(--worship-muted-slate)] mt-0.5">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--worship-slate)]">ALIGNMENT NOTES (OPTIONAL)</label>
                <span className={`text-[10px] ${formData.alignmentNotes.length > ALIGNMENT_MAX ? 'text-red-600' : 'text-[var(--worship-muted-slate)]'}`}>
                  {formData.alignmentNotes.length}/{ALIGNMENT_MAX}
                </span>
              </div>
              <textarea
                value={formData.alignmentNotes}
                onChange={e => setFormData({ ...formData, alignmentNotes: e.target.value.slice(0, ALIGNMENT_MAX) })}
                placeholder="Paste sermon notes, song lyrics, or any text the liturgy should echo. The AI will weave its imagery and themes into the result."
                rows={4}
                data-testid="input-alignment-notes"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm leading-relaxed resize-y"
              />
              <p className="text-[10px] text-[var(--worship-muted-slate)] mt-1 italic">
                Song lyrics will be paraphrased, not copied verbatim, to honor copyright.
              </p>
            </div>

            {!subAllowed ? (
              <button
                type="button"
                onClick={() => setLocation('/pricing')}
                className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--worship-gold)' }}
              >
                Subscribe to unlock <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={generate.isPending || !profileReady}
                title={!profileReady ? "Finish your profile to enable AI generation" : undefined}
                className="w-full py-3 rounded-xl font-medium text-white worship-btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generate.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> Weaving words...</> : "Generate Liturgy"}
              </button>
            )}
          </form>
        </div>

        {/* OUTPUT */}
        <div className="w-full md:w-2/3 bg-white rounded-2xl border border-[var(--worship-border)] shadow-sm relative min-h-[400px]">
          {!generate.data && !generate.isPending && !generate.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
               <BookOpen className="w-12 h-12 text-[var(--worship-gold)] opacity-50 mb-4" />
               <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">Awaiting context</h3>
               <p className="text-[var(--worship-slate)] max-w-sm text-sm">Fill out the form and generate to see a beautifully drafted piece of liturgy.</p>
            </div>
          )}

          {generate.isPending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[var(--worship-cream)]/80 backdrop-blur-sm rounded-2xl z-10">
              <div className="w-full max-w-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 font-semibold text-sm text-[var(--worship-navy)]">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    {LITURGY_PHASES[phaseIdx % LITURGY_PHASES.length]}
                  </div>
                  <button
                    type="button"
                    onClick={() => generate.reset()}
                    className="text-xs text-[var(--worship-slate)] hover:text-[var(--worship-navy)] px-2 py-1 rounded hover:bg-[var(--worship-sand)] transition-colors shrink-0"
                  >
                    Cancel
                  </button>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden mb-4" style={{ backgroundColor: 'var(--worship-sand)' }}>
                  <div style={{ height: '100%', width: '38%', backgroundColor: 'var(--worship-gold)', borderRadius: '9999px', animation: 'genProgressSlide 1.8s ease-in-out infinite' }} />
                </div>
                <p className="text-xs italic leading-relaxed text-center" style={{ color: 'var(--worship-slate)' }}>
                  Taking time to be thorough — this usually takes 20–30 seconds.
                </p>
              </div>
            </div>
          )}

          {generate.error && !generate.isPending && !generate.data && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
              <AlertCircle className="w-12 h-12 text-red-500 opacity-80 mb-4" />
              <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">Generation failed</h3>
              <p className="text-[var(--worship-slate)] max-w-sm text-sm mb-5">{generate.error.message}</p>
              <button
                onClick={() => runGeneration()}
                className="px-5 py-2.5 rounded-lg font-medium text-sm worship-btn-primary text-white"
              >
                Try again
              </button>
            </div>
          )}

          {generate.data && !generate.isPending && (
            <div className="p-4 sm:p-8 flex flex-col h-full">
              <div className="flex flex-wrap justify-between items-start mb-4 sm:mb-8 gap-3">
                <h2 className="text-xl sm:text-2xl font-serif text-[var(--worship-navy)] min-w-0">{generate.data.title}</h2>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button onClick={handleCopy} className="p-2 rounded-lg border border-[var(--worship-border)] text-[var(--worship-slate)] hover:bg-slate-50 transition-colors" title="Copy">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={handleSave} disabled={createLibraryItem.isPending || !!savedItem || !subAllowed} title={!subAllowed ? "Subscribe to save items" : undefined} className="px-4 py-2 rounded-lg font-medium text-sm worship-btn-gold flex items-center gap-2 disabled:opacity-50">
                    <Save className="w-4 h-4" /> {createLibraryItem.isPending ? "Saving..." : savedItem ? "Saved" : "Save"}
                  </button>
                  <button onClick={() => setAddToServiceOpen(true)} className="px-4 py-2 rounded-lg font-medium text-sm border border-[var(--worship-border)] text-[var(--worship-navy)] hover:bg-[var(--worship-cream)] flex items-center gap-2" data-testid="button-add-to-service">
                    <CalendarPlus className="w-4 h-4" /> Add to service
                  </button>
                </div>
              </div>

              {(generate.data as GeneratedLiturgy & { recommendedScripture?: { reference: string; rationale: string } }).recommendedScripture && (
                <div className="mb-6 p-4 rounded-lg border border-[var(--worship-gold)] bg-[var(--worship-pale-gold)]/40">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h4 className="text-[10px] uppercase tracking-wider font-bold text-[var(--worship-gold)] mb-1">Suggested scripture</h4>
                      <p className="font-serif text-base text-[var(--worship-navy)]">
                        {(generate.data as GeneratedLiturgy & { recommendedScripture?: { reference: string; rationale: string } }).recommendedScripture!.reference}
                      </p>
                      <p className="text-xs text-[var(--worship-slate)] mt-1 italic">
                        {(generate.data as GeneratedLiturgy & { recommendedScripture?: { reference: string; rationale: string } }).recommendedScripture!.rationale}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const ref = (generate.data as GeneratedLiturgy & { recommendedScripture?: { reference: string; rationale: string } }).recommendedScripture!.reference;
                        setFormData({ ...formData, scripture: ref });
                        toast.success("Scripture added to the form. Click Generate to anchor on it.");
                      }}
                      data-testid="button-use-scripture"
                      className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-[var(--worship-gold)] text-[var(--worship-navy)] hover:bg-[var(--worship-pale-gold)] transition-colors"
                    >
                      Use this scripture
                    </button>
                  </div>
                </div>
              )}

              <div className="prose prose-sm max-w-none flex-1">
                <pre className="font-serif text-base leading-relaxed text-[var(--worship-charcoal)] whitespace-pre-wrap font-medium bg-transparent p-0 border-0 m-0">
                  {generate.data.body}
                </pre>
              </div>

              {generate.data.notes && (
                <div className="mt-8 p-4 bg-[var(--worship-cream)] rounded-lg border-l-2 border-[var(--worship-gold)]">
                  <h4 className="text-xs font-semibold text-[var(--worship-slate)] uppercase mb-1">Pastoral Notes</h4>
                  <p className="text-sm italic font-serif text-[var(--worship-charcoal)]">{generate.data.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
      {generate.data && (
        <AddToServiceDialog
          open={addToServiceOpen}
          onClose={() => setAddToServiceOpen(false)}
          kind="liturgy"
          ensureSaved={ensureSaved}
        />
      )}
    </AppLayout>
  );
}
