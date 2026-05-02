import React, { useState } from 'react';
import { AppLayout } from './_shared/AppLayout';
import { Save, Download, RotateCcw, Copy, Loader2, Plus, X, LayoutTemplate } from 'lucide-react';
import './_group.css';

export default function ServiceBuilder() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  
  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setHasGenerated(true);
    }, 1500);
  };

  const elements = ["Call to Worship", "Opening Song", "Greeting", "Worship Set", "Prayer of Confession", "Assurance of Pardon", "Sermon", "Communion", "Closing Song", "Benediction"];
  const [selectedElements, setSelectedElements] = useState(["Call to Worship", "Opening Song", "Worship Set", "Sermon", "Closing Song", "Benediction"]);

  const toggleElement = (el: string) => {
    if (selectedElements.includes(el)) {
      setSelectedElements(selectedElements.filter(e => e !== el));
    } else {
      setSelectedElements([...selectedElements, el]);
    }
  };

  return (
    <AppLayout title="Service Builder">
      <div className="flex gap-8 h-[calc(100vh-8rem)]">
        
        {/* LEFT PANEL: INPUT FORM */}
        <div className="w-1/2 flex flex-col worship-card overflow-hidden !p-0">
          <div className="p-6 border-b" style={{ borderColor: 'var(--worship-border)' }}>
            <h2 className="text-2xl">Build a Worship Service</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--worship-slate)' }}>Provide context to generate a thoughtful plan.</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Section 1 */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>1. Service Basics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--worship-slate)' }}>DATE</label>
                  <input type="date" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }} defaultValue="2023-11-12" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--worship-slate)' }}>OCCASION / SEASON</label>
                  <input type="text" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }} defaultValue="Ordinary Time" />
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>2. Sermon & Theme</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--worship-slate)' }}>MAIN SCRIPTURE</label>
                  <input type="text" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }} placeholder="e.g. Romans 8:1-11" defaultValue="Romans 8:1-11" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--worship-slate)' }}>THEMATIC FOCUS</label>
                  <input type="text" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }} placeholder="e.g. Grace, Adoption, Freedom" defaultValue="Grace and freedom in the Spirit" />
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
                className="w-full px-3 py-3 rounded-lg border text-sm min-h-[100px] resize-none" 
                style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }}
                placeholder="Include 'Amazing Grace'. Need a good transition out of the sermon."
              ></textarea>
            </section>
          </div>
          
          <div className="p-6 border-t" style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }}>
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-3.5 rounded-xl font-medium text-lg worship-btn-gold flex items-center justify-center gap-2 shadow-lg"
            >
              {isGenerating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Building Plan...</>
              ) : (
                "Generate Service Plan"
              )}
            </button>
          </div>
        </div>

        {/* RIGHT PANEL: OUTPUT */}
        <div className="w-1/2 flex flex-col bg-white rounded-2xl shadow-sm border overflow-hidden relative" style={{ borderColor: 'var(--worship-border)' }}>
          
          {!hasGenerated && !isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-[var(--worship-cream)]">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 opacity-50" style={{ backgroundColor: 'var(--worship-sand)' }}>
                <LayoutTemplate className="w-8 h-8" style={{ color: 'var(--worship-navy)' }} />
              </div>
              <h3 className="text-xl mb-2 font-serif" style={{ color: 'var(--worship-navy)' }}>Your plan will appear here</h3>
              <p className="text-sm max-w-sm" style={{ color: 'var(--worship-slate)' }}>Fill out the context on the left and hit generate to create a thoughtful worship service.</p>
            </div>
          )}

          {isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-[var(--worship-cream)]/80 backdrop-blur-sm z-10">
              <Loader2 className="w-10 h-10 animate-spin mb-4" style={{ color: 'var(--worship-gold)' }} />
              <h3 className="text-xl mb-2 font-serif" style={{ color: 'var(--worship-navy)' }}>Building a thoughtful worship plan...</h3>
              <p className="text-sm" style={{ color: 'var(--worship-slate)' }}>Curating songs, writing liturgy, and forming the service arc.</p>
            </div>
          )}

          {hasGenerated && (
            <>
              {/* Output Header Actions */}
              <div className="px-6 py-4 flex items-center justify-end gap-3 border-b bg-white z-10 sticky top-0" style={{ borderColor: 'var(--worship-border)' }}>
                <button className="p-2 rounded-lg hover:bg-slate-50 transition-colors" title="Regenerate">
                  <RotateCcw className="w-4 h-4" style={{ color: 'var(--worship-slate)' }} />
                </button>
                <button className="px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors" style={{ borderColor: 'var(--worship-border)', color: 'var(--worship-charcoal)' }}>
                  <Download className="w-4 h-4" /> Export
                </button>
                <button className="px-4 py-1.5 rounded-lg text-xs font-medium worship-btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save Service
                </button>
              </div>

              {/* Document Output */}
              <div className="flex-1 overflow-y-auto p-8 pb-20 bg-white">
                <div className="max-w-2xl mx-auto space-y-10">
                  
                  {/* Doc Header */}
                  <div className="text-center pb-8 border-b border-slate-100">
                    <h1 className="text-3xl font-serif mb-2" style={{ color: 'var(--worship-navy)' }}>Sunday Morning Service</h1>
                    <p className="text-sm uppercase tracking-widest" style={{ color: 'var(--worship-slate)' }}>Nov 12 • Romans 8:1-11</p>
                  </div>

                  {/* Section: Rationale */}
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full" style={{ backgroundColor: 'var(--worship-gold)' }}></div>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-serif text-xl" style={{ color: 'var(--worship-navy)' }}>Pastoral Rationale</h3>
                      <button className="text-slate-400 hover:text-slate-600"><Copy className="w-4 h-4" /></button>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--worship-charcoal)' }}>
                      This service journeys from the acknowledgement of our weakness into the triumphant reality of life in the Spirit. The musical arc begins with upbeat praise, moves into a reflective space of confession, and concludes with an anthem of freedom.
                    </p>
                  </div>

                  {/* Section: Service Order */}
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full" style={{ backgroundColor: 'var(--worship-navy)' }}></div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-serif text-xl" style={{ color: 'var(--worship-navy)' }}>Service Order</h3>
                      <button className="text-slate-400 hover:text-slate-600"><Copy className="w-4 h-4" /></button>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="flex gap-4">
                        <span className="text-xs font-bold mt-1 min-w-[50px]" style={{ color: 'var(--worship-muted-slate)' }}>00:00</span>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Call to Worship</h4>
                          <div className="p-3 rounded-lg bg-[var(--worship-cream)] text-sm font-serif italic text-slate-700 mb-2">
                            "Leader: The Spirit helps us in our weakness.<br/>
                            Congregation: For we do not know what to pray for as we ought.<br/>
                            Leader: But the Spirit himself intercedes for us.<br/>
                            Congregation: Come, Holy Spirit, and meet us here."
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <span className="text-xs font-bold mt-1 min-w-[50px]" style={{ color: 'var(--worship-muted-slate)' }}>00:02</span>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Opening Song</h4>
                          <p className="text-sm font-medium" style={{ color: 'var(--worship-navy)' }}>Awake My Soul (Hillsong Worship)</p>
                          <p className="text-xs text-slate-500">Key: D • Tempo: 110bpm</p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <span className="text-xs font-bold mt-1 min-w-[50px]" style={{ color: 'var(--worship-muted-slate)' }}>00:07</span>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Worship Set</h4>
                          <div className="space-y-2">
                            <div>
                              <p className="text-sm font-medium" style={{ color: 'var(--worship-navy)' }}>Who You Say I Am (Hillsong Worship)</p>
                              <p className="text-xs text-slate-500">Key: G • Tempo: 86bpm</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium" style={{ color: 'var(--worship-navy)' }}>O Come To The Altar (Elevation Worship)</p>
                              <p className="text-xs text-slate-500">Key: B • Tempo: 70bpm</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <span className="text-xs font-bold mt-1 min-w-[50px]" style={{ color: 'var(--worship-muted-slate)' }}>00:20</span>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Sermon</h4>
                          <p className="text-sm text-slate-600">Romans 8:1-11</p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <span className="text-xs font-bold mt-1 min-w-[50px]" style={{ color: 'var(--worship-muted-slate)' }}>00:55</span>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Closing Song & Response</h4>
                          <p className="text-sm font-medium" style={{ color: 'var(--worship-navy)' }}>Amazing Grace (My Chains Are Gone)</p>
                          <p className="text-xs text-slate-500">Key: F • Tempo: 60bpm</p>
                          <p className="text-xs mt-1 text-amber-700 italic">Note: Pastor requested this specifically for the sermon response.</p>
                        </div>
                      </div>
                      
                       <div className="flex gap-4">
                        <span className="text-xs font-bold mt-1 min-w-[50px]" style={{ color: 'var(--worship-muted-slate)' }}>01:00</span>
                        <div>
                          <h4 className="font-semibold text-sm mb-1">Benediction</h4>
                          <div className="p-3 rounded-lg bg-[var(--worship-cream)] text-sm font-serif italic text-slate-700 mb-2">
                            "May the God of hope fill you with all joy and peace as you trust in him, so that you may overflow with hope by the power of the Holy Spirit. Go in peace."
                          </div>
                        </div>
                      </div>

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
