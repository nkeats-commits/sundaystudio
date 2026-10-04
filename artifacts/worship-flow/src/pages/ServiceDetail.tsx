import { useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  useGetServicePlan,
  useDeleteServicePlan,
  useUpdateServicePlan,
  useExportServicePlan,
  getListServicePlansQueryKey,
  getGetServicePlanQueryKey,
  type ServicePlanItem,
} from '@workspace/api-client-react';
import { useRoute, useLocation } from 'wouter';
import {
  Trash2,
  ArrowLeft,
  Music,
  BookOpen,
  Mic,
  Wheat,
  Gift,
  DoorOpen,
  Sparkles,
  ChevronsRight,
  Bookmark,
  Link2,
  Download,
  Printer,
  Copy,
  X,
  FileText,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SlotPicker, LinkedPill, slotPickerSupported } from '../components/SlotPicker';
import { copyText, isNativeApp, shareTextFile } from '../mobile/nativeRuntime';

export default function ServiceDetail() {
  const [, params] = useRoute('/services/:id');
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id) : 0;

  const { data: service, isLoading } = useGetServicePlan(id, {
    query: { enabled: !!id, queryKey: getGetServicePlanQueryKey(id) },
  });
  const deletePlan = useDeleteServicePlan();
  const updatePlan = useUpdateServicePlan();
  const exportPlan = useExportServicePlan();
  const queryClient = useQueryClient();

  // Index of the slot we are currently picking a link for; null = closed.
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const handleCopy = (format: 'markdown' | 'text') => {
    if (!id) return;
    exportPlan.mutate(
      { id, data: { format } },
      {
        onSuccess: async (resp) => {
          try {
            if (isNativeApp()) {
              await shareTextFile(
                'Service plan',
                resp.content,
                `service-plan-${id}.${format === 'markdown' ? 'md' : 'txt'}`,
              );
              toast.success('Service plan ready to share');
            } else {
              await copyText(resp.content);
              toast.success(format === 'markdown' ? 'Markdown copied' : 'Text copied');
            }
            setExportOpen(false);
          } catch {
            toast.error(isNativeApp() ? 'Could not share service plan' : 'Could not copy to clipboard');
          }
        },
        onError: () => toast.error('Could not export service plan'),
      },
    );
  };

  const handlePrint = () => {
    if (!id) return;
    setExportOpen(false);
    if (isNativeApp()) {
      setLocation(`/services/${id}/print`);
      return;
    }
    window.open(`${import.meta.env.BASE_URL}services/${id}/print`, '_blank');
  };

  const handleDelete = () => {
    if (!confirm('Are you sure you want to delete this service plan?')) return;
    deletePlan.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success('Service plan deleted');
          queryClient.invalidateQueries({ queryKey: getListServicePlansQueryKey() });
          setLocation('/services');
        },
        onError: () => toast.error('Failed to delete service plan'),
      },
    );
  };

  // After any slot link change, refresh badge counts on every sermon /
  // library card. We don't know exactly which item ids were affected by the
  // diff, so invalidate the whole family of /linked-services queries by
  // matching the URL prefix in the query key.
  const invalidateLinkedServiceBadges = () => {
    queryClient.invalidateQueries({
      predicate: (q) => {
        const first = q.queryKey[0];
        return (
          typeof first === 'string' &&
          (first.startsWith('/api/sermons/') || first.startsWith('/api/library/')) &&
          first.endsWith('/linked-services')
        );
      },
    });
  };

  // Apply a slot patch coming back from the picker. We rebuild the order in
  // place and PUT the whole content blob — the API has no per-slot patch
  // endpoint and the document is small. We seed the cache from the mutation
  // response so back-to-back edits don't race against a stale read.
  const applySlotPatch = (index: number, patch: Partial<ServicePlanItem>) => {
    if (!service) return;
    const order = service.content.order ?? [];
    const next = order.map((slot, i) =>
      i === index ? ({ ...slot, ...patch } as ServicePlanItem) : slot,
    );
    updatePlan.mutate(
      {
        id,
        data: {
          title: service.title,
          scripture: service.scripture,
          theme: service.theme,
          season: service.season,
          serviceDate: service.serviceDate,
          content: { ...service.content, order: next },
        },
      },
      {
        onSuccess: (updated) => {
          toast.success('Slot linked');
          queryClient.setQueryData(getGetServicePlanQueryKey(id), updated);
          invalidateLinkedServiceBadges();
        },
        onError: () => toast.error('Could not save'),
      },
    );
  };

  const clearSlotLink = (index: number) => {
    if (!service) return;
    const order = service.content.order ?? [];
    const next = order.map((slot, i) => {
      if (i !== index) return slot;
      const { linkedKind: _lk, linkedId: _li, linkedTitle: _lt, ...rest } = slot;
      void _lk;
      void _li;
      void _lt;
      return rest as ServicePlanItem;
    });
    updatePlan.mutate(
      {
        id,
        data: {
          title: service.title,
          scripture: service.scripture,
          theme: service.theme,
          season: service.season,
          serviceDate: service.serviceDate,
          content: { ...service.content, order: next },
        },
      },
      {
        onSuccess: (updated) => {
          toast.success('Link removed');
          queryClient.setQueryData(getGetServicePlanQueryKey(id), updated);
          invalidateLinkedServiceBadges();
        },
        onError: () => toast.error('Could not save'),
      },
    );
  };

  const getIcon = (kind: string) => {
    const props = { className: 'w-5 h-5 text-[var(--worship-navy)]' };
    switch (kind) {
      case 'song':
        return <Music {...props} />;
      case 'scripture':
        return <BookOpen {...props} />;
      case 'prayer':
        return <Mic {...props} />;
      case 'sermon':
        return <Mic {...props} />;
      case 'communion':
        return <Wheat {...props} />;
      case 'offering':
        return <Gift {...props} />;
      case 'welcome':
        return <DoorOpen {...props} />;
      case 'benediction':
        return <Sparkles {...props} />;
      case 'transition':
        return <ChevronsRight {...props} />;
      default:
        return <Bookmark {...props} />;
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
          <button onClick={() => setLocation('/services')} className="mt-4 text-[var(--worship-gold)] hover:underline">
            Go back to services
          </button>
        </div>
      </AppLayout>
    );
  }

  const orderItems = service.content.order ?? [];

  return (
    <AppLayout title="Service Detail">
      <div className="max-w-4xl mx-auto pb-16">
        <div className="flex justify-between items-center mb-8">
          <button onClick={() => setLocation('/services')} className="text-sm font-medium text-[var(--worship-slate)] hover:text-[var(--worship-navy)] flex items-center gap-1 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Services
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => setExportOpen(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--worship-border)] text-[var(--worship-navy)] bg-white hover:bg-[var(--worship-cream)] flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" /> Export
            </button>
            <button onClick={handleDelete} disabled={deletePlan.isPending} className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {deletePlan.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[var(--worship-border)] shadow-sm overflow-hidden p-8 md:p-12">
          <div className="text-center pb-10 border-b border-[var(--worship-border)]">
            <h1 className="text-4xl md:text-5xl font-serif mb-4 text-[var(--worship-navy)]">{service.title}</h1>
            <p className="text-sm md:text-base uppercase tracking-widest text-[var(--worship-slate)] mb-6 font-medium">
              {service.serviceDate
                ? new Date(service.serviceDate).toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Unscheduled'}
              {service.scripture && ` • ${service.scripture}`}
            </p>
            <div className="flex gap-2 justify-center">
              <span className="text-sm px-4 py-1.5 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)] font-medium">{service.theme || 'General Theme'}</span>
              <span className="text-sm px-4 py-1.5 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-medium">{service.season || 'Ordinary Time'}</span>
            </div>
          </div>

          <div className="space-y-12 mt-10">
            {service.content.notes && (
              <div className="relative pl-6">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-[var(--worship-gold)]"></div>
                <h3 className="font-serif text-2xl text-[var(--worship-navy)] mb-3">Pastoral Notes</h3>
                <p className="text-base leading-relaxed text-[var(--worship-charcoal)]">{service.content.notes}</p>
              </div>
            )}

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

            {orderItems.length > 0 && (
              <div className="relative pl-6 pt-2">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-[var(--worship-navy)]"></div>
                <h3 className="font-serif text-2xl text-[var(--worship-navy)] mb-6">Order of Service</h3>

                <div className="space-y-6">
                  {orderItems.map((item, i) => (
                    <div key={item.id || i} className="worship-card !p-5 flex gap-5 items-start">
                      <div className="w-12 h-12 shrink-0 rounded-xl bg-[var(--worship-cream)] flex items-center justify-center border border-[var(--worship-border)]">
                        {getIcon(item.kind)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-3 mb-1 flex-wrap">
                          <div className="min-w-0 flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-[var(--worship-navy)] text-lg">{item.title}</h4>
                            <LinkedPill slot={item} />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.linkedKind && (
                              <button
                                onClick={() => clearSlotLink(i)}
                                disabled={updatePlan.isPending}
                                className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border text-[var(--worship-slate)] hover:bg-slate-50 disabled:opacity-60"
                                style={{ borderColor: 'var(--worship-border)' }}
                              >
                                Unlink
                              </button>
                            )}
                            {slotPickerSupported(item.kind) && (
                              <button
                                onClick={() => setPickingIndex(i)}
                                disabled={updatePlan.isPending}
                                className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border text-[var(--worship-navy)] hover:bg-[var(--worship-cream)] flex items-center gap-1 disabled:opacity-60"
                                style={{ borderColor: 'var(--worship-border)' }}
                              >
                                <Link2 className="w-3 h-3" /> {item.linkedKind ? 'Change' : 'Use saved'}
                              </button>
                            )}
                            {item.durationMinutes && (
                              <span className="text-sm font-medium text-[var(--worship-slate)] bg-[var(--worship-cream)] border border-[var(--worship-border)] px-2 py-0.5 rounded-md">
                                {item.durationMinutes}m
                              </span>
                            )}
                          </div>
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

      {pickingIndex !== null && orderItems[pickingIndex] && (
        <SlotPicker
          slot={orderItems[pickingIndex]!}
          onApply={(patch) => applySlotPatch(pickingIndex, patch)}
          onClose={() => setPickingIndex(null)}
        />
      )}

      {exportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setExportOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--worship-border)]">
              <h3 className="font-serif text-lg text-[var(--worship-navy)]">
                Export service plan
              </h3>
              <button
                onClick={() => setExportOpen(false)}
                className="p-1.5 rounded hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <button
                onClick={handlePrint}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--worship-border)] hover:bg-[var(--worship-cream)] text-left transition-colors"
              >
                <Printer className="w-5 h-5 text-[var(--worship-navy)] shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[var(--worship-navy)]">
                    Print or save as PDF
                  </span>
                  <span className="block text-xs text-[var(--worship-slate)]">
                    Opens a clean printable view in a new tab
                  </span>
                </span>
              </button>
              <button
                onClick={() => handleCopy('markdown')}
                disabled={exportPlan.isPending}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--worship-border)] hover:bg-[var(--worship-cream)] text-left transition-colors disabled:opacity-50"
              >
                <FileText className="w-5 h-5 text-[var(--worship-navy)] shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[var(--worship-navy)]">
                    Copy as Markdown
                  </span>
                  <span className="block text-xs text-[var(--worship-slate)]">
                    For Notion, Obsidian, or any markdown editor
                  </span>
                </span>
              </button>
              <button
                onClick={() => handleCopy('text')}
                disabled={exportPlan.isPending}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--worship-border)] hover:bg-[var(--worship-cream)] text-left transition-colors disabled:opacity-50"
              >
                <Copy className="w-5 h-5 text-[var(--worship-navy)] shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[var(--worship-navy)]">
                    Copy as plain text
                  </span>
                  <span className="block text-xs text-[var(--worship-slate)]">
                    Paste into email, Word, or run sheets
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
