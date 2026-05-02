import { useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Save, Loader2, BookOpen, Copy, AlertCircle } from 'lucide-react';
import { useCreateLibraryItem, getListLibraryItemsQueryKey, type GeneratedLiturgy } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useStreamingGenerate } from '../hooks/useStreamingGenerate';

export default function LiturgyGenerator() {
  console.log("[mount] LiturgyGenerator");
  const [formData, setFormData] = useState({
    kind: 'call_to_worship' as const,
    theme: '',
    scripture: '',
    season: 'Ordinary Time',
    tone: 'warm, pastoral, theologically grounded'
  });
  
  const generate = useStreamingGenerate<GeneratedLiturgy>('/api/generate/liturgy');
  const createLibraryItem = useCreateLibraryItem();
  const queryClient = useQueryClient();
  const lastSubmittedRef = useRef<typeof formData | null>(null);

  const runGeneration = (body?: typeof formData) => {
    const payload = body ?? lastSubmittedRef.current ?? formData;
    lastSubmittedRef.current = payload;
    generate.mutate(payload).catch((err: Error) => {
      toast.error(err.message || "Generation failed. Please try again.");
    });
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
    if (!generate.data) return;
    createLibraryItem.mutate({
      data: {
        kind: 'liturgy',
        title: generate.data.title,
        content: generate.data as any,
        tags: [formData.kind.replace(/_/g, ' '), formData.season]
      }
    }, {
      onSuccess: () => {
        toast.success("Saved to Library");
        queryClient.invalidateQueries({ queryKey: getListLibraryItemsQueryKey() });
      }
    });
  };

  const handleCopy = () => {
    if (!generate.data) return;
    navigator.clipboard.writeText(generate.data.title + '\n\n' + generate.data.body);
    toast.success("Copied to clipboard");
  };

  return (
    <AppLayout title="Liturgy Generator">
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

            <button 
              type="submit"
              disabled={generate.isPending}
              className="w-full py-3 rounded-xl font-medium text-white worship-btn-primary flex items-center justify-center gap-2"
            >
              {generate.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> Weaving words...</> : "Generate Liturgy"}
            </button>
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
            <div className="absolute inset-0 flex flex-col p-8 bg-[var(--worship-cream)]/80 backdrop-blur-sm rounded-2xl z-10">
               <div className="flex flex-col items-center text-center mb-4">
                 <Loader2 className="w-10 h-10 animate-spin text-[var(--worship-gold)] mb-4" />
                 <h3 className="font-serif text-xl text-[var(--worship-navy)]">Drafting liturgy...</h3>
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
            <div className="p-8 flex flex-col h-full">
              <div className="flex justify-between items-start mb-8">
                <h2 className="text-2xl font-serif text-[var(--worship-navy)]">{generate.data.title}</h2>
                <div className="flex gap-2 shrink-0">
                  <button onClick={handleCopy} className="p-2 rounded-lg border border-[var(--worship-border)] text-[var(--worship-slate)] hover:bg-slate-50 transition-colors" title="Copy">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={handleSave} disabled={createLibraryItem.isPending} className="px-4 py-2 rounded-lg font-medium text-sm worship-btn-gold flex items-center gap-2 disabled:opacity-50">
                    <Save className="w-4 h-4" /> {createLibraryItem.isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

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
    </AppLayout>
  );
}
