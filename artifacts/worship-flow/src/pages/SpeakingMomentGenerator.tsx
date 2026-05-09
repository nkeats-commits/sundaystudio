import { useEffect, useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Save, Loader2, Mic, Copy, AlertCircle, CalendarPlus, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { useCreateLibraryItem, getListLibraryItemsQueryKey, type GeneratedSpeakingMoment, type LibraryItem } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useJobGenerate } from '../hooks/useJobGenerate';
import { ProfileRequiredBanner } from '../components/ProfileRequiredGate';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { AddToServiceDialog } from '../components/AddToServiceDialog';

const SPEAKING_PHASES = [
  'Reading your topic and tone…',
  'Shaping the pastoral voice…',
  'Drafting the speaking moment…',
  'Polishing the language…',
];

export default function SpeakingMomentGenerator() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    kind: 'welcome' as const,
    topic: '',
    scripture: '',
    durationSeconds: 60,
    tone: 'warm, pastoral, inviting',
    alignmentNotes: '',
  });
  const ALIGNMENT_MAX = 4000;
  
  const generate = useJobGenerate<GeneratedSpeakingMoment>('/api/generate/speaking-moment');
  const createLibraryItem = useCreateLibraryItem();
  const queryClient = useQueryClient();
  const lastSubmittedRef = useRef<typeof formData | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  useEffect(() => {
    if (!generate.isPending) { setPhaseIdx(0); return; }
    const t = setInterval(() => setPhaseIdx((i) => (i + 1) % SPEAKING_PHASES.length), 3000);
    return () => clearInterval(t);
  }, [generate.isPending]);
  const { ready: profileReady } = useChurchProfileReady();
  const { allowed: subAllowed } = useSubscriptionStatus();
  const [savedItem, setSavedItem] = useState<LibraryItem | null>(null);
  const [addToServiceOpen, setAddToServiceOpen] = useState(false);
  // Shared in-flight save promise so Save + Add-to-service can't double-create.
  const savePromiseRef = useRef<Promise<LibraryItem> | null>(null);

  const runGeneration = (body?: typeof formData) => {
    if (!profileReady) {
      toast.error("Set up your profile first.", {
        description: "Tone and pastoral voice depend on it.",
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
      topic: payload.topic || undefined,
      scripture: payload.scripture || undefined,
      durationSeconds: payload.durationSeconds,
      tone: payload.tone,
      ...(trimmedAlignment ? { alignmentNotes: trimmedAlignment.slice(0, ALIGNMENT_MAX) } : {}),
    };
    generate.mutate(requestBody).catch((err: Error) => {
      toast.error(err.message || "Generation failed. Please try again.");
    });
  };

  const buildLibraryPayload = () => ({
    kind: 'speaking_moment' as const,
    title: generate.data!.title,
    content: generate.data as any,
    tags: [formData.kind.replace(/_/g, ' ')],
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
    <AppLayout title="Speaking Moments">
      <ProfileRequiredBanner variant="inline" />
      <div className="flex flex-col md:flex-row gap-8 h-auto min-h-[calc(100vh-8rem)]">

        {/* FORM */}
        <div className="w-full md:w-1/3 flex flex-col space-y-6">
          <div className="pb-4 border-b border-[var(--worship-border)]">
            <h2 className="text-xl font-serif text-[var(--worship-navy)]">Draft a Setup</h2>
            <p className="text-sm text-[var(--worship-slate)] mt-1">Words to frame moments of transition.</p>
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">MOMENT TYPE</label>
              <select 
                value={formData.kind} 
                onChange={e => setFormData({...formData, kind: e.target.value as any})}
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              >
                <option value="welcome">Welcome / Greeting</option>
                <option value="transition">Song Transition</option>
                <option value="communion_invitation">Communion Invitation</option>
                <option value="offering">Offering Setup</option>
                <option value="announcement">Announcement Segue</option>
                <option value="benediction">Sending / Benediction</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">TOPIC / THEME (OPTIONAL)</label>
              <input 
                type="text" 
                value={formData.topic}
                onChange={e => setFormData({...formData, topic: e.target.value})}
                placeholder="e.g. God's provision, welcoming guests"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">SCRIPTURE (OPTIONAL)</label>
              <input 
                type="text" 
                value={formData.scripture}
                onChange={e => setFormData({...formData, scripture: e.target.value})}
                placeholder="e.g. 2 Corinthians 9:7"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              />
            </div>

            <div>
              <div className="flex justify-between">
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">DURATION</label>
                <span className="text-xs text-[var(--worship-gold)] font-medium">{formData.durationSeconds}s</span>
              </div>
              <input 
                type="range" 
                min="30" max="180" step="15"
                value={formData.durationSeconds}
                onChange={e => setFormData({...formData, durationSeconds: parseInt(e.target.value)})}
                className="w-full accent-[var(--worship-gold)]"
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
              <div className="flex items-baseline justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--worship-slate)]">ALIGNMENT NOTES (OPTIONAL)</label>
                <span className={`text-[10px] ${formData.alignmentNotes.length > ALIGNMENT_MAX ? 'text-red-600' : 'text-[var(--worship-muted-slate)]'}`}>
                  {formData.alignmentNotes.length}/{ALIGNMENT_MAX}
                </span>
              </div>
              <textarea
                value={formData.alignmentNotes}
                onChange={e => setFormData({ ...formData, alignmentNotes: e.target.value.slice(0, ALIGNMENT_MAX) })}
                placeholder="Paste sermon notes, source text, or other material this moment should echo."
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
                {generate.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> Drafting...</> : "Generate Setup"}
              </button>
            )}
          </form>
        </div>

        {/* OUTPUT */}
        <div className="w-full md:w-2/3 bg-white rounded-2xl border border-[var(--worship-border)] shadow-sm relative min-h-[400px]">
          {!generate.data && !generate.isPending && !generate.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
               <Mic className="w-12 h-12 text-[var(--worship-gold)] opacity-50 mb-4" />
               <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">Awaiting context</h3>
               <p className="text-[var(--worship-slate)] max-w-sm text-sm">Design the moment before the moment.</p>
            </div>
          )}

          {generate.isPending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[var(--worship-cream)]/80 backdrop-blur-sm rounded-2xl z-10">
              <div className="w-full max-w-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 font-semibold text-sm text-[var(--worship-navy)]">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    {SPEAKING_PHASES[phaseIdx % SPEAKING_PHASES.length]}
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

              <div className="prose prose-sm max-w-none flex-1">
                <pre className="font-serif text-lg leading-relaxed text-[var(--worship-charcoal)] whitespace-pre-wrap font-medium bg-transparent p-0 border-0 m-0">
                  {generate.data.body}
                </pre>
              </div>

              {generate.data.deliveryNotes && (
                <div className="mt-8 p-4 bg-[var(--worship-cream)] rounded-lg border-l-2 border-[var(--worship-gold)]">
                  <h4 className="text-xs font-semibold text-[var(--worship-slate)] uppercase mb-1">Delivery Notes</h4>
                  <p className="text-sm text-[var(--worship-charcoal)]">{generate.data.deliveryNotes}</p>
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
          kind="speaking_moment"
          ensureSaved={ensureSaved}
        />
      )}
    </AppLayout>
  );
}
