import { AppLayout } from '../components/layout/AppLayout';
import { useGetServicePlan, useDeleteServicePlan, getListServicePlansQueryKey, getGetServicePlanQueryKey } from '@workspace/api-client-react';
import { useRoute, useLocation } from 'wouter';
import { Trash2, ArrowLeft, Loader2, Music, BookOpen, Mic, Wheat, Gift, DoorOpen, Sparkles, ChevronsRight, Bookmark } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function ServiceDetail() {
  const [, params] = useRoute('/services/:id');
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id) : 0;
  
  const { data: service, isLoading } = useGetServicePlan(id, { query: { enabled: !!id, queryKey: getGetServicePlanQueryKey(id) } });
  const deletePlan = useDeleteServicePlan();
  const queryClient = useQueryClient();

  const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this service plan?")) return;
    deletePlan.mutate({ id }, {
      onSuccess: () => {
        toast.success("Service plan deleted");
        queryClient.invalidateQueries({ queryKey: getListServicePlansQueryKey() });
        setLocation('/services');
      },
      onError: () => toast.error("Failed to delete service plan")
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

  if (isLoading) {
    return (
      <AppLayout title="Service Plan">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C99A3D]"></div>
        </div>
      </AppLayout>
    );
  }

  if (!service) {
    return (
      <AppLayout title="Not Found">
        <div className="text-center py-20">
          <h2 className="text-xl font-serif">Service plan not found</h2>
          <button onClick={() => setLocation('/services')} className="mt-4 text-[var(--worship-gold)] hover:underline">Go back to services</button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Service Detail">
      <div className="max-w-4xl mx-auto pb-16">
        
        {/* Actions Bar */}
        <div className="flex justify-between items-center mb-8">
          <button onClick={() => setLocation('/services')} className="text-sm font-medium text-[var(--worship-slate)] hover:text-[var(--worship-navy)] flex items-center gap-1 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Services
          </button>
          <div className="flex gap-3">
            <button onClick={handleDelete} disabled={deletePlan.isPending} className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {deletePlan.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[var(--worship-border)] shadow-sm overflow-hidden p-8 md:p-12">
          
          {/* Doc Header */}
          <div className="text-center pb-10 border-b border-[var(--worship-border)]">
            <h1 className="text-4xl md:text-5xl font-serif mb-4 text-[var(--worship-navy)]">{service.title}</h1>
            <p className="text-sm md:text-base uppercase tracking-widest text-[var(--worship-slate)] mb-6 font-medium">
              {service.serviceDate ? new Date(service.serviceDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Unscheduled'} 
              {service.scripture && ` • ${service.scripture}`}
            </p>
            <div className="flex gap-2 justify-center">
              <span className="text-sm px-4 py-1.5 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)] font-medium">{service.theme || 'General Theme'}</span>
              <span className="text-sm px-4 py-1.5 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-medium">{service.season || 'Ordinary Time'}</span>
            </div>
          </div>

          <div className="space-y-12 mt-10">
            {/* Pastoral Notes */}
            {service.content.notes && (
              <div className="relative pl-6">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-[var(--worship-gold)]"></div>
                <h3 className="font-serif text-2xl text-[var(--worship-navy)] mb-3">Pastoral Notes</h3>
                <p className="text-base leading-relaxed text-[var(--worship-charcoal)]">
                  {service.content.notes}
                </p>
              </div>
            )}

            {/* Liturgical Blocks (if provided outside of order) */}
            <div className="space-y-6">
              {service.content.callToWorship && (
                <div className="bg-[var(--worship-cream)] p-6 rounded-xl border border-[var(--worship-border)]">
                  <h4 className="text-sm font-serif italic text-[var(--worship-slate)] mb-2">Call to Worship</h4>
                  <p className="font-serif text-[var(--worship-charcoal)] whitespace-pre-wrap">{service.content.callToWorship}</p>
                </div>
              )}
              {service.content.openingPrayer && (
                <div className="bg-[var(--worship-cream)] p-6 rounded-xl border border-[var(--worship-border)]">
                  <h4 className="text-sm font-serif italic text-[var(--worship-slate)] mb-2">Opening Prayer</h4>
                  <p className="font-serif text-[var(--worship-charcoal)] whitespace-pre-wrap">{service.content.openingPrayer}</p>
                </div>
              )}
            </div>

            {/* Order of Service */}
            {service.content.order && service.content.order.length > 0 && (
              <div className="relative pl-6 pt-2">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-[var(--worship-navy)]"></div>
                <h3 className="font-serif text-2xl text-[var(--worship-navy)] mb-6">Order of Service</h3>
                
                <div className="space-y-6">
                  {service.content.order.map((item, i) => (
                    <div key={item.id || i} className="worship-card !p-5 flex gap-5 items-start">
                      <div className="w-12 h-12 shrink-0 rounded-xl bg-[var(--worship-cream)] flex items-center justify-center border border-[var(--worship-border)]">
                        {getIcon(item.kind)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-semibold text-[var(--worship-navy)] text-lg">{item.title}</h4>
                          {item.durationMinutes && (
                            <span className="text-sm font-medium text-[var(--worship-slate)] bg-[var(--worship-cream)] border border-[var(--worship-border)] px-2 py-0.5 rounded-md">
                              {item.durationMinutes}m
                            </span>
                          )}
                        </div>
                        {item.kind === 'song' ? (
                          <p className="text-base font-medium text-[var(--worship-charcoal)] leading-relaxed mt-1">{item.body}</p>
                        ) : item.kind === 'prayer' || item.kind === 'scripture' || item.kind === 'welcome' || item.kind === 'benediction' || item.kind === 'communion' ? (
                          <div className="mt-3 p-4 rounded-xl bg-[var(--worship-cream)] text-base font-serif italic text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {item.body}
                          </div>
                        ) : (
                          <p className="text-base text-[var(--worship-slate)] leading-relaxed whitespace-pre-wrap mt-1">{item.body}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Closing Blocks */}
            <div className="space-y-6">
              {service.content.benediction && (
                <div className="bg-[var(--worship-cream)] p-6 rounded-xl border border-[var(--worship-border)]">
                  <h4 className="text-sm font-serif italic text-[var(--worship-slate)] mb-2">Benediction</h4>
                  <p className="font-serif text-[var(--worship-charcoal)] whitespace-pre-wrap">{service.content.benediction}</p>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </AppLayout>
  );
}
