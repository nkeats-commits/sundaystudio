import { useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Save, Loader2, Music, Copy, AlertCircle } from 'lucide-react';
import { useCreateLibraryItem, getListLibraryItemsQueryKey, type GeneratedSongs } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useStreamingGenerate } from '../hooks/useStreamingGenerate';

export default function SongGenerator() {
  console.log("[mount] SongGenerator");
  const [formData, setFormData] = useState({
    theme: '',
    scripture: '',
    style: 'mixed (modern worship and hymns)',
    count: 5
  });
  
  const generate = useStreamingGenerate<GeneratedSongs>('/api/generate/songs');
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

  const handleSaveSingle = (song: any) => {
    createLibraryItem.mutate({
      data: {
        kind: 'song',
        title: song.title,
        content: song,
        tags: [song.style || 'Song', ...(song.themes || [])]
      }
    }, {
      onSuccess: () => {
        toast.success(`"${song.title}" saved to Library`);
        queryClient.invalidateQueries({ queryKey: getListLibraryItemsQueryKey() });
      }
    });
  };

  return (
    <AppLayout title="Song Assistant">
      <div className="flex flex-col md:flex-row gap-8 h-auto min-h-[calc(100vh-8rem)]">
        
        {/* FORM */}
        <div className="w-full md:w-1/3 flex flex-col space-y-6">
          <div className="pb-4 border-b border-[var(--worship-border)]">
            <h2 className="text-xl font-serif text-[var(--worship-navy)]">Find Songs</h2>
            <p className="text-sm text-[var(--worship-slate)] mt-1">Discover songs that fit your thematic arc.</p>
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">THEME / TOPIC *</label>
              <input 
                type="text" 
                value={formData.theme}
                onChange={e => setFormData({...formData, theme: e.target.value})}
                placeholder="e.g. Surrender, Holy Spirit, Resurrection"
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
                placeholder="e.g. Psalm 51"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">STYLE PREFERENCE</label>
              <select 
                value={formData.style} 
                onChange={e => setFormData({...formData, style: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              >
                <option value="mixed (modern worship and hymns)">Mixed</option>
                <option value="modern worship (e.g. Hillsong, Elevation)">Modern Worship</option>
                <option value="traditional hymns">Traditional Hymns</option>
                <option value="gospel / contemporary black church">Gospel</option>
                <option value="acoustic / stripped down">Acoustic / Folk</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between">
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">NUMBER OF SONGS</label>
                <span className="text-xs text-[var(--worship-gold)] font-medium">{formData.count}</span>
              </div>
              <input 
                type="range" 
                min="3" max="10" 
                value={formData.count}
                onChange={e => setFormData({...formData, count: parseInt(e.target.value)})}
                className="w-full accent-[var(--worship-gold)]"
              />
            </div>

            <button 
              type="submit"
              disabled={generate.isPending}
              className="w-full py-3 rounded-xl font-medium text-white worship-btn-primary flex items-center justify-center gap-2"
            >
              {generate.isPending ? <><Loader2 className="w-5 h-5 animate-spin" /> Digging into the hymnal...</> : "Find Songs"}
            </button>
          </form>
        </div>

        {/* OUTPUT */}
        <div className="w-full md:w-2/3 bg-white rounded-2xl border border-[var(--worship-border)] shadow-sm relative min-h-[400px]">
          {!generate.data && !generate.isPending && !generate.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
               <Music className="w-12 h-12 text-[var(--worship-gold)] opacity-50 mb-4" />
               <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">Awaiting context</h3>
               <p className="text-[var(--worship-slate)] max-w-sm text-sm">Set your theme and preferences to discover theologically grounded songs.</p>
            </div>
          )}

          {generate.isPending && (
            <div className="absolute inset-0 flex flex-col p-8 bg-[var(--worship-cream)]/80 backdrop-blur-sm rounded-2xl z-10">
               <div className="flex flex-col items-center text-center mb-4">
                 <Loader2 className="w-10 h-10 animate-spin text-[var(--worship-gold)] mb-4" />
                 <h3 className="font-serif text-xl text-[var(--worship-navy)]">Finding the perfect songs...</h3>
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
            <div className="p-6 h-full flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-serif text-[var(--worship-navy)]">Suggested Songs</h2>
                  <p className="text-sm text-[var(--worship-slate)]">Theme: <span className="italic">{generate.data.theme}</span></p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {generate.data.songs.map((song, i) => (
                  <div key={i} className="p-5 border border-[var(--worship-border)] rounded-xl hover:border-[var(--worship-gold)] transition-colors bg-white">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h3 className="text-lg font-serif font-medium text-[var(--worship-navy)]">{song.title}</h3>
                        <p className="text-sm text-[var(--worship-slate)] font-medium mb-3">{song.artist}</p>
                        
                        <div className="flex flex-wrap gap-2 mb-4">
                          {song.style && (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--worship-cream)] text-[var(--worship-slate)] border border-[var(--worship-border)]">
                              {song.style}
                            </span>
                          )}
                          {song.themes?.map(t => (
                            <span key={t} className="text-xs px-2 py-0.5 rounded-md bg-[var(--worship-sand)] text-[var(--worship-navy)]">
                              {t}
                            </span>
                          ))}
                        </div>

                        <p className="text-sm italic font-serif text-[var(--worship-charcoal)] leading-relaxed">
                          "{song.whyItFits}"
                        </p>
                      </div>
                      
                      <button 
                        onClick={() => handleSaveSingle(song)}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium border border-[var(--worship-border)] rounded-lg text-[var(--worship-charcoal)] hover:bg-[var(--worship-cream)] hover:text-[var(--worship-navy)] transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
