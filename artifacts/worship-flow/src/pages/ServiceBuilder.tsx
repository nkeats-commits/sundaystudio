import { useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import { Save, Download, RotateCcw, Copy, Loader2, Plus, X, LayoutTemplate, Music, BookOpen, Mic, Wheat, Gift, DoorOpen, Sparkles, ChevronsRight, Bookmark, Trash2, AlertCircle } from 'lucide-react';
import { useCreateServicePlan, type GeneratedServicePlan } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useStreamingGenerate } from '../hooks/useStreamingGenerate';

export default function ServiceBuilder() {
  const searchParams = new URLSearchParams(window.location.search);
  const promptParam = searchParams.get('prompt') || '';

  const [formData, setFormData] = useState({
    theme: promptParam,
    scripture: '',
    season: 'Ordinary Time',
    serviceLength: '60 minutes',
    notes: '',
    serviceDate: new Date().toISOString().split('T')[0]
  });

  const [, setLocation] = useLocation();
  const generate = useStreamingGenerate<GeneratedServicePlan>('/api/generate/service-plan');
  const createPlan = useCreateServicePlan();
  const lastSubmittedRef = useRef<typeof formData | null>(null);

  const elements = ["Call to Worship", "Opening Song", "Greeting", "Worship Set", "Prayer of Confession", "Assurance of Pardon", "Sermon", "Communion", "Closing Song", "Benediction"];
  const [selectedElements, setSelectedElements] = useState(["Call to Worship", "Opening Song", "Worship Set", "Sermon", "Closing Song", "Benediction"]);

  const toggleElement = (el: string) => {
    if (selectedElements.includes(el)) {
      setSelectedElements(selectedElements.filter(e => e !== el));
    } else {
      setSelectedElements([...selectedElements, el]);
    }
  };

  const runGeneration = (body?: typeof formData) => {
    const payload = body ?? lastSubmittedRef.current ?? formData;
    lastSubmittedRef.current = payload;
    generate.mutate(payload).catch((err: Error) => {
      toast.error(err.message || "Generation failed. Please try again.");
    });
  };

  const handleGenerate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.theme) {
      toast.error("Please provide a theme or thematic focus.");
      return;
    }
    runGeneration({ ...formData });
  };

  const handleSave = () => {
    if (!generate.data) return;
    createPlan.mutate({
      data: {
        title: generate.data.title,
        scripture: generate.data.scripture,
        theme: generate.data.theme,
        season: generate.data.season,
        serviceDate: formData.serviceDate ? new Date(formData.serviceDate).toISOString() : null,
        content: generate.data.content
      }
    }, {
      onSuccess: (data) => {
        toast.success("Service Plan saved");
        setLocation(`/services/${data.id}`);
      },
      onError: () => toast.error("Failed to save service plan")
    });
  };

  const getIcon = (kind: string) => {
    const props = { className: "w-5 h-5 text-[var(--worship-navy)]" };
    switch(kind) {
      case 'song': return <Music {...props} />;
      case 'scripture': return <BookOpen {...props} />;
      case 'prayer': return <Mic {...props} />;
      case 'sermon': return <Mic {...props} />;
      case 'communion': return <Wheat {...props} />;
      case 'offering': return <Gift {...props} />;
      case 'welcome': return <DoorOpen {...props} />;
      case 'benediction': return <Sparkles {...props} />;
      case 'transition': return <ChevronsRight {...props} />;
      default: return <Bookmark {...props} />;
    }
  };

  return (
    <AppLayout title="Service Builder">
      <div className="flex flex-col lg:flex-row gap-8 h-auto min-h-[calc(100vh-8rem)]">
        
        {/* LEFT PANEL: INPUT FORM */}
        <div className="w-full lg:w-[40%] flex flex-col worship-card overflow-hidden !p-0 shrink-0 self-start sticky top-8 max-h-[calc(100vh-8rem)]">
          <div className="p-6 border-b bg-white" style={{ borderColor: 'var(--worship-border)' }}>
            <h2 className="text-2xl font-serif text-[var(--worship-navy)]">Build a Service</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--worship-slate)' }}>Provide context to generate a thoughtful plan.</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-white">
            {/* Section 1 */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>1. Service Basics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--worship-slate)' }}>DATE</label>
                  <input 
                    type="date" 
                    value={formData.serviceDate}
                    onChange={e => setFormData({...formData, serviceDate: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" 
                    style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--worship-slate)' }}>OCCASION / SEASON</label>
                  <input 
                    type="text" 
                    value={formData.season}
                    onChange={e => setFormData({...formData, season: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" 
                    style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }} 
                  />
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>2. Sermon & Theme</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--worship-slate)' }}>MAIN SCRIPTURE</label>
                  <input 
                    type="text" 
                    value={formData.scripture}
                    onChange={e => setFormData({...formData, scripture: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" 
                    style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }} 
                    placeholder="e.g. Romans 8:1-11" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--worship-slate)' }}>THEMATIC FOCUS *</label>
                  <input 
                    type="text" 
                    value={formData.theme}
                    onChange={e => setFormData({...formData, theme: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" 
                    style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }} 
                    placeholder="e.g. Grace, Adoption, Freedom" 
                    required
                  />
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>3. Worship Elements</h3>
              <div className="flex flex-wrap gap-2">
                {elements.map(el => (
                  <button 
                    key={el}
                    type="button"
                    onClick={() => toggleElement(el)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1 transition-colors ${
                      selectedElements.includes(el) 
                        ? 'bg-[var(--worship-navy)] text-white border-[var(--worship-navy)]' 
                        : 'bg-white text-[var(--worship-slate)] border-[var(--worship-border)] hover:border-[var(--worship-slate)]'
                    }`}
                  >
                    {selectedElements.includes(el) ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {el}
                  </button>
                ))}
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>4. Specific Songs or Notes</h3>
              <textarea 
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
                className="w-full px-3 py-3 rounded-lg border text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" 
                style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }}
                placeholder="Include 'Amazing Grace'. Need a good transition out of the sermon."
              ></textarea>
            </section>
          </div>
          
          <div className="p-6 border-t bg-[var(--worship-cream)] shrink-0" style={{ borderColor: 'var(--worship-border)' }}>
            <button 
              onClick={handleGenerate}
              disabled={generate.isPending}
              className="w-full py-3.5 rounded-xl font-medium text-lg worship-btn-gold flex items-center justify-center gap-2 shadow-lg disabled:opacity-75"
            >
              {generate.isPending ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Weaving your service...</>
              ) : (
                "Generate Service Plan"
              )}
            </button>
          </div>
        </div>

        {/* RIGHT PANEL: OUTPUT */}
        <div className="w-full lg:w-[60%] flex flex-col bg-white rounded-2xl shadow-sm border overflow-hidden relative min-h-[500px]" style={{ borderColor: 'var(--worship-border)' }}>
          
          {!generate.data && !generate.isPending && !generate.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-[var(--worship-cream)]">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 opacity-50 bg-[var(--worship-sand)]">
                <LayoutTemplate className="w-8 h-8 text-[var(--worship-navy)]" />
              </div>
              <h3 className="text-xl mb-2 font-serif text-[var(--worship-navy)]">Your plan will appear here</h3>
              <p className="text-sm max-w-sm text-[var(--worship-slate)]">Fill out the context on the left and hit generate to create a thoughtful worship service.</p>
            </div>
          )}

          {generate.isPending && (
            <div className="absolute inset-0 flex flex-col p-8 bg-[var(--worship-cream)]/90 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center text-center mb-4">
                <Loader2 className="w-10 h-10 animate-spin mb-4 text-[var(--worship-gold)]" />
                <h3 className="text-xl mb-1 font-serif text-[var(--worship-navy)]">Weaving your service...</h3>
                <p className="text-sm text-[var(--worship-slate)]">Curating songs, writing liturgy, and forming the service arc.</p>
                {generate.partialText.length > 0 && (
                  <p className="text-xs text-[var(--worship-slate)] mt-2 opacity-70">
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
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-[var(--worship-cream)]">
              <AlertCircle className="w-12 h-12 text-red-500 opacity-80 mb-4" />
              <h3 className="text-xl mb-2 font-serif text-[var(--worship-navy)]">Generation failed</h3>
              <p className="text-sm text-[var(--worship-slate)] max-w-sm mb-5">{generate.error.message}</p>
              <button
                onClick={() => runGeneration()}
                className="px-5 py-2.5 rounded-lg font-medium text-sm worship-btn-primary text-white"
              >
                Try again
              </button>
            </div>
          )}

          {generate.data && !generate.isPending && (
            <>
              {/* Output Header Actions */}
              <div className="px-6 py-4 flex items-center justify-end gap-3 border-b bg-white z-10 sticky top-0" style={{ borderColor: 'var(--worship-border)' }}>
                <button onClick={handleGenerate} className="p-2 rounded-lg hover:bg-slate-50 transition-colors" title="Regenerate">
                  <RotateCcw className="w-4 h-4 text-[var(--worship-slate)]" />
                </button>
                <button onClick={handleSave} disabled={createPlan.isPending} className="px-4 py-1.5 rounded-lg text-xs font-medium worship-btn-primary flex items-center gap-2 disabled:opacity-50">
                  <Save className="w-4 h-4" /> {createPlan.isPending ? "Saving..." : "Save Service"}
                </button>
              </div>

              {/* Document Output */}
              <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-20 bg-white">
                <div className="max-w-2xl mx-auto space-y-10">
                  
                  {/* Doc Header */}
                  <div className="text-center pb-8 border-b border-[var(--worship-border)]">
                    <h1 className="text-3xl md:text-4xl font-serif mb-3 text-[var(--worship-navy)]">{generate.data.title}</h1>
                    <p className="text-sm uppercase tracking-widest text-[var(--worship-slate)]">
                      {formData.serviceDate ? new Date(formData.serviceDate).toLocaleDateString() : 'Unscheduled'} • {generate.data.scripture}
                    </p>
                    <div className="flex gap-2 justify-center mt-4">
                      <span className="text-xs px-3 py-1 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)] font-medium">{generate.data.theme}</span>
                      <span className="text-xs px-3 py-1 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-medium">{generate.data.season}</span>
                    </div>
                  </div>

                  {/* Section: Pastoral Rationale / Notes */}
                  {generate.data.content.notes && (
                    <div className="relative pl-6">
                      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-[var(--worship-gold)]"></div>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-serif text-xl text-[var(--worship-navy)]">Pastoral Notes</h3>
                      </div>
                      <p className="text-sm leading-relaxed text-[var(--worship-charcoal)]">
                        {generate.data.content.notes}
                      </p>
                    </div>
                  )}

                  {/* Section: Service Order */}
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-[var(--worship-navy)]"></div>
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-serif text-xl text-[var(--worship-navy)]">Order of Service</h3>
                    </div>
                    
                    <div className="space-y-6">
                      {generate.data.content.order.map((item, i) => (
                        <div key={item.id || i} className="worship-card !p-4 !shadow-sm flex gap-4 items-start">
                          <div className="w-10 h-10 shrink-0 rounded-lg bg-[var(--worship-cream)] flex items-center justify-center border border-[var(--worship-border)]">
                            {getIcon(item.kind)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="font-semibold text-[var(--worship-navy)] text-base">{item.title}</h4>
                              {item.durationMinutes && (
                                <span className="text-xs font-medium text-[var(--worship-slate)] bg-[var(--worship-cream)] px-2 py-0.5 rounded">
                                  {item.durationMinutes}m
                                </span>
                              )}
                            </div>
                            {item.kind === 'song' ? (
                              <p className="text-sm font-medium text-[var(--worship-charcoal)] leading-relaxed">{item.body}</p>
                            ) : item.kind === 'prayer' || item.kind === 'scripture' || item.kind === 'welcome' || item.kind === 'benediction' || item.kind === 'communion' ? (
                              <div className="mt-2 p-3 rounded-lg bg-[var(--worship-cream)] text-sm font-serif italic text-slate-700 leading-relaxed whitespace-pre-wrap">
                                {item.body}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--worship-slate)] leading-relaxed whitespace-pre-wrap">{item.body}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
