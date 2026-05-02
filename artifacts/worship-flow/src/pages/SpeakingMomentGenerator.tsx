import { useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Save, Loader2, Mic, Copy } from 'lucide-react';
import { useGenerateSpeakingMoment, useCreateLibraryItem, getListLibraryItemsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function SpeakingMomentGenerator() {
  const [formData, setFormData] = useState({
    kind: 'welcome' as const,
    topic: '',
    scripture: '',
    durationSeconds: 60,
    tone: 'warm, pastoral, inviting'
  });
  
  const generate = useGenerateSpeakingMoment();
  const createLibraryItem = useCreateLibraryItem();
  const queryClient = useQueryClient();

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    generate.mutate({ data: formData });
  };

  const handleSave = () => {
    if (!generate.data) return;
    createLibraryItem.mutate({
      data: {
        kind: 'speaking_moment',
        title: generate.data.title,
        content: generate.data as any,
        tags: [formData.kind.replace(/_/g, ' ')]
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
    <AppLayout title="Speaking Moments">
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

            <button 
              type="submit"
              disabled={generate.isPending}
              className="w-full py-3 rounded-xl font-medium text-white worship-btn-primary flex items-center justify-center gap-2"
            >
              {generate.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> Drafting...</> : "Generate Setup"}
            </button>
          </form>
        </div>

        {/* OUTPUT */}
        <div className="w-full md:w-2/3 bg-white rounded-2xl border border-[var(--worship-border)] shadow-sm relative min-h-[400px]">
          {!generate.data && !generate.isPending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
               <Mic className="w-12 h-12 text-[var(--worship-gold)] opacity-50 mb-4" />
               <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">Awaiting context</h3>
               <p className="text-[var(--worship-slate)] max-w-sm text-sm">Design the moment before the moment.</p>
            </div>
          )}

          {generate.isPending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)]/80 backdrop-blur-sm rounded-2xl z-10">
               <Loader2 className="w-10 h-10 animate-spin text-[var(--worship-gold)] mb-4" />
               <h3 className="font-serif text-xl text-[var(--worship-navy)]">Drafting moment...</h3>
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
    </AppLayout>
  );
}
