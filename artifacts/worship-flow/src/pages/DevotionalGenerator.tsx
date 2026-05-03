import { useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Save, Loader2, Users, Copy, AlertCircle, CalendarPlus } from 'lucide-react';
import { useCreateLibraryItem, getListLibraryItemsQueryKey, type GeneratedDevotional, type LibraryItem } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useJobGenerate } from '../hooks/useJobGenerate';
import { ProfileRequiredBanner } from '../components/ProfileRequiredGate';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';
import { AddToServiceDialog } from '../components/AddToServiceDialog';

export default function DevotionalGenerator() {
  const [formData, setFormData] = useState({
    theme: '',
    scripture: '',
    audience: 'worship team',
    durationMinutes: 10
  });
  
  const generate = useJobGenerate<GeneratedDevotional>('/api/generate/devotional');
  const createLibraryItem = useCreateLibraryItem();
  const queryClient = useQueryClient();
  const lastSubmittedRef = useRef<typeof formData | null>(null);
  const { ready: profileReady } = useChurchProfileReady();
  const [savedItem, setSavedItem] = useState<LibraryItem | null>(null);
  const [addToServiceOpen, setAddToServiceOpen] = useState(false);
  // Shared in-flight save promise so Save + Add-to-service can't double-create.
  const savePromiseRef = useRef<Promise<LibraryItem> | null>(null);

  const runGeneration = (body?: typeof formData) => {
    if (!profileReady) {
      toast.error("Set up your profile first.", {
        description: "Helps tailor the devotional to your team.",
      });
      return;
    }
    const payload = body ?? lastSubmittedRef.current ?? formData;
    lastSubmittedRef.current = payload;
    setSavedItem(null);
    savePromiseRef.current = null;
    generate.mutate(payload).catch((err: Error) => {
      toast.error(err.message || "Generation failed. Please try again.");
    });
  };

  const buildLibraryPayload = () => ({
    kind: 'devotional' as const,
    title: generate.data!.title,
    content: generate.data as any,
    tags: [formData.audience, `${formData.durationMinutes} min`],
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
      toast.error("Please provide a theme.");
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
    const text = `${generate.data.title}\n\n${generate.data.scripture}\n${generate.data.opening}\n\n${generate.data.body}\n\nDiscussion:\n${generate.data.discussionQuestions.join('\n')}\n\nPrayer:\n${generate.data.closingPrayer}`;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <AppLayout title="Team Devotionals">
      <ProfileRequiredBanner variant="inline" />
      <div className="flex flex-col md:flex-row gap-8 h-auto min-h-[calc(100vh-8rem)]">

        {/* FORM */}
        <div className="w-full md:w-1/3 flex flex-col space-y-6">
          <div className="pb-4 border-b border-[var(--worship-border)]">
            <h2 className="text-xl font-serif text-[var(--worship-navy)]">Lead Your Team</h2>
            <p className="text-sm text-[var(--worship-slate)] mt-1">Generate a short devotional for pre-service rehearsal.</p>
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">THEME / TOPIC *</label>
              <input 
                type="text" 
                value={formData.theme}
                onChange={e => setFormData({...formData, theme: e.target.value})}
                placeholder="e.g. Humility, Excellence vs Performance"
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
                placeholder="e.g. John 3:30"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">AUDIENCE</label>
              <input 
                type="text" 
                value={formData.audience}
                onChange={e => setFormData({...formData, audience: e.target.value})}
                placeholder="e.g. worship team, production volunteers"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              />
            </div>

            <div>
              <div className="flex justify-between">
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">LENGTH</label>
                <span className="text-xs text-[var(--worship-gold)] font-medium">{formData.durationMinutes} min</span>
              </div>
              <input 
                type="range" 
                min="5" max="30" step="5"
                value={formData.durationMinutes}
                onChange={e => setFormData({...formData, durationMinutes: parseInt(e.target.value)})}
                className="w-full accent-[var(--worship-gold)]"
              />
            </div>

            <button 
              type="submit"
              disabled={generate.isPending || !profileReady}
              title={!profileReady ? "Finish your profile to enable AI generation" : undefined}
              className="w-full py-3 rounded-xl font-medium text-white worship-btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generate.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> Preparing...</> : "Generate Devotional"}
            </button>
          </form>
        </div>

        {/* OUTPUT */}
        <div className="w-full md:w-2/3 bg-white rounded-2xl border border-[var(--worship-border)] shadow-sm relative min-h-[400px]">
          {!generate.data && !generate.isPending && !generate.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
               <Users className="w-12 h-12 text-[var(--worship-gold)] opacity-50 mb-4" />
               <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">Awaiting context</h3>
               <p className="text-[var(--worship-slate)] max-w-sm text-sm">Get your team's hearts ready before they pick up their instruments.</p>
            </div>
          )}

          {generate.isPending && (
            <div className="absolute inset-0 flex flex-col p-8 bg-[var(--worship-cream)]/80 backdrop-blur-sm rounded-2xl z-10">
               <div className="flex flex-col items-center text-center mb-4">
                 <Loader2 className="w-10 h-10 animate-spin text-[var(--worship-gold)] mb-4" />
                 <h3 className="font-serif text-xl text-[var(--worship-navy)]">Writing devotional...</h3>
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
            <div className="p-8 h-full flex flex-col max-h-[calc(100vh-10rem)] overflow-y-auto">
              <div className="flex justify-between items-start mb-8">
                <h2 className="text-2xl font-serif text-[var(--worship-navy)]">{generate.data.title}</h2>
                <div className="flex gap-2 shrink-0">
                  <button onClick={handleCopy} className="p-2 rounded-lg border border-[var(--worship-border)] text-[var(--worship-slate)] hover:bg-slate-50 transition-colors" title="Copy">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={handleSave} disabled={createLibraryItem.isPending || !!savedItem} className="px-4 py-2 rounded-lg font-medium text-sm worship-btn-gold flex items-center gap-2 disabled:opacity-50">
                    <Save className="w-4 h-4" /> {createLibraryItem.isPending ? "Saving..." : savedItem ? "Saved" : "Save"}
                  </button>
                  <button onClick={() => setAddToServiceOpen(true)} className="px-4 py-2 rounded-lg font-medium text-sm border border-[var(--worship-border)] text-[var(--worship-navy)] hover:bg-[var(--worship-cream)] flex items-center gap-2" data-testid="button-add-to-service">
                    <CalendarPlus className="w-4 h-4" /> Add to service
                  </button>
                </div>
              </div>

              <div className="space-y-8 text-[var(--worship-charcoal)] pb-8">
                
                {/* Scripture Blockquote */}
                <div className="p-5 bg-[var(--worship-cream)] rounded-xl border-l-2 border-[var(--worship-gold)]">
                  <p className="font-serif italic text-lg leading-relaxed text-[var(--worship-navy)] mb-3">
                    "{generate.data.opening}"
                  </p>
                  <p className="text-sm font-medium uppercase tracking-widest text-[var(--worship-slate)]">
                    — {generate.data.scripture}
                  </p>
                </div>

                {/* Reflection */}
                <div className="space-y-4 text-base leading-relaxed">
                  {generate.data.body.split('\n\n').map((para: string, i: number) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>

                {/* Discussion */}
                {generate.data.discussionQuestions && generate.data.discussionQuestions.length > 0 && (
                  <div className="pt-6 border-t border-[var(--worship-border)]">
                    <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-4">For Discussion</h3>
                    <ol className="list-decimal pl-5 space-y-3 marker:text-[var(--worship-gold)] marker:font-medium">
                      {generate.data.discussionQuestions.map((q, i) => (
                        <li key={i} className="pl-2">{q}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Closing Prayer */}
                <div className="p-6 bg-[var(--worship-navy)] text-white rounded-xl">
                  <h3 className="font-serif text-lg text-[var(--worship-pale-gold)] mb-3">Closing Prayer</h3>
                  <p className="font-serif italic leading-relaxed">
                    {generate.data.closingPrayer}
                  </p>
                </div>

              </div>
            </div>
          )}
        </div>

      </div>
      {generate.data && (
        <AddToServiceDialog
          open={addToServiceOpen}
          onClose={() => setAddToServiceOpen(false)}
          kind="devotional"
          ensureSaved={ensureSaved}
        />
      )}
    </AppLayout>
  );
}
