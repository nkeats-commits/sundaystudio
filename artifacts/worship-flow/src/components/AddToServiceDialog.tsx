import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  useListServicePlans,
  useUpdateServicePlan,
  getListServicePlansQueryKey,
  getGetServicePlanQueryKey,
  type LibraryItem,
  type ServicePlan,
  type ServicePlanItem,
} from '@workspace/api-client-react';
import { Loader2, CalendarDays, Plus, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import {
  slotKindsForLibraryKind,
  defaultNewSlotKindForLibraryKind,
  libraryItemBodyPreview,
} from '../lib/slotMatching';

type AddToServiceDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Library kind being added — drives which slots are eligible. */
  kind: LibraryItem['kind'];
  /**
   * Saves the current generator output to the library if not already saved
   * (deduped by the caller) and resolves with the persisted LibraryItem.
   * Errors should be thrown so the dialog can surface them.
   */
  ensureSaved: () => Promise<LibraryItem>;
};

const APPEND_TO_END = '__append__';

function planSubtitle(plan: ServicePlan): string {
  const parts: string[] = [];
  if (plan.serviceDate) {
    parts.push(new Date(plan.serviceDate).toLocaleDateString());
  }
  if (plan.theme) parts.push(plan.theme);
  return parts.join(' • ');
}

function freshSlotId(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AddToServiceDialog({
  open,
  onClose,
  kind,
  ensureSaved,
}: AddToServiceDialogProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const plansQuery = useListServicePlans({
    query: { enabled: open, queryKey: getListServicePlansQueryKey() },
  });
  const updatePlan = useUpdateServicePlan();

  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  // Either a slot id within the plan, or APPEND_TO_END.
  const [selectedSlotKey, setSelectedSlotKey] = useState<string>(APPEND_TO_END);
  const [submitting, setSubmitting] = useState(false);

  const eligibleSlotKinds = useMemo(() => slotKindsForLibraryKind(kind), [kind]);

  // Sort: scheduled (by date desc) first, then unscheduled by updatedAt desc.
  const sortedPlans = useMemo(() => {
    const list = plansQuery.data ?? [];
    return [...list].sort((a, b) => {
      const aDate = a.serviceDate ? new Date(a.serviceDate).getTime() : 0;
      const bDate = b.serviceDate ? new Date(b.serviceDate).getTime() : 0;
      if (aDate !== bDate) return bDate - aDate;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [plansQuery.data]);

  const selectedPlan = useMemo(
    () => sortedPlans.find((p) => p.id === selectedPlanId) ?? null,
    [sortedPlans, selectedPlanId],
  );

  const eligibleSlots = useMemo(() => {
    if (!selectedPlan) return [] as { index: number; slot: ServicePlanItem }[];
    return (selectedPlan.content.order ?? [])
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => eligibleSlotKinds.includes(slot.kind));
  }, [selectedPlan, eligibleSlotKinds]);

  const handleClose = () => {
    if (submitting) return;
    setSelectedPlanId(null);
    setSelectedSlotKey(APPEND_TO_END);
    onClose();
  };

  const handleAdd = async () => {
    if (!selectedPlan) return;
    setSubmitting(true);
    try {
      const item = await ensureSaved();
      const body = libraryItemBodyPreview(item) || item.title;
      const order = selectedPlan.content.order ?? [];
      let nextOrder: ServicePlanItem[];

      if (selectedSlotKey === APPEND_TO_END) {
        const newSlot: ServicePlanItem = {
          id: freshSlotId(),
          kind: defaultNewSlotKindForLibraryKind(item.kind),
          title: item.title,
          body,
          linkedKind: 'library_item',
          linkedId: item.id,
          linkedTitle: item.title,
        };
        nextOrder = [...order, newSlot];
      } else {
        nextOrder = order.map((slot) =>
          slot.id === selectedSlotKey
            ? {
                ...slot,
                title: item.title,
                body,
                linkedKind: 'library_item',
                linkedId: item.id,
                linkedTitle: item.title,
              }
            : slot,
        );
      }

      const updated = await updatePlan.mutateAsync({
        id: selectedPlan.id,
        data: {
          title: selectedPlan.title,
          scripture: selectedPlan.scripture,
          theme: selectedPlan.theme,
          season: selectedPlan.season,
          serviceDate: selectedPlan.serviceDate,
          content: { ...selectedPlan.content, order: nextOrder },
        },
      });

      queryClient.setQueryData(
        getGetServicePlanQueryKey(selectedPlan.id),
        updated,
      );
      queryClient.invalidateQueries({ queryKey: getListServicePlansQueryKey() });
      // Refresh "linked services" badges throughout the app.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const first = q.queryKey[0];
          return (
            typeof first === 'string' &&
            first.startsWith('/api/library/') &&
            first.endsWith('/linked-services')
          );
        },
      });

      toast.success(`Added to "${selectedPlan.title}"`, {
        action: {
          label: 'Open',
          onClick: () => {
            setLocation(`/services/${selectedPlan.id}`);
          },
        },
      });
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add to service plan';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif text-[var(--worship-navy)]">
            Add to a service plan
          </DialogTitle>
          <DialogDescription>
            Drop this into a saved service. We'll save it to your Library first
            if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-5">
          {plansQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-[var(--worship-slate)]">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--worship-gold)]" />
              Loading your service plans…
            </div>
          ) : sortedPlans.length === 0 ? (
            <div className="py-10 text-center">
              <ScrollText className="w-10 h-10 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
              <p className="text-sm text-[var(--worship-slate)] mb-3">
                You don't have any saved service plans yet.
              </p>
              <Link
                href="/service-builder"
                className="inline-block px-4 py-2 rounded-lg text-sm worship-btn-gold"
                onClick={handleClose}
              >
                Build a service
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold mb-2 text-[var(--worship-slate)] uppercase tracking-wider">
                  Service plan
                </label>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {sortedPlans.map((plan) => {
                    const selected = plan.id === selectedPlanId;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          setSelectedSlotKey(APPEND_TO_END);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-start gap-3 ${
                          selected
                            ? 'border-[var(--worship-gold)] bg-[var(--worship-pale-gold)]/40'
                            : 'border-[var(--worship-border)] hover:bg-[var(--worship-cream)]'
                        }`}
                      >
                        <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-[var(--worship-navy)]" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[var(--worship-navy)] truncate text-sm">
                            {plan.title}
                          </div>
                          <div className="text-xs text-[var(--worship-slate)] truncate mt-0.5">
                            {planSubtitle(plan) || 'Unscheduled'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedPlan && (
                <div>
                  <label className="block text-xs font-semibold mb-2 text-[var(--worship-slate)] uppercase tracking-wider">
                    Where in the service?
                  </label>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {eligibleSlots.map(({ slot, index }) => {
                      const selected = selectedSlotKey === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setSelectedSlotKey(slot.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                            selected
                              ? 'border-[var(--worship-gold)] bg-[var(--worship-pale-gold)]/40'
                              : 'border-[var(--worship-border)] hover:bg-[var(--worship-cream)]'
                          }`}
                        >
                          <div className="text-xs uppercase tracking-wider text-[var(--worship-muted-slate)] mb-0.5">
                            {index + 1} • {slot.kind}
                          </div>
                          <div className="font-medium text-sm text-[var(--worship-navy)] truncate">
                            {slot.title || '(untitled slot)'}
                          </div>
                          {slot.linkedTitle && (
                            <div className="text-[11px] text-[var(--worship-slate)] truncate mt-0.5">
                              Replaces link: {slot.linkedTitle}
                            </div>
                          )}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setSelectedSlotKey(APPEND_TO_END)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
                        selectedSlotKey === APPEND_TO_END
                          ? 'border-[var(--worship-gold)] bg-[var(--worship-pale-gold)]/40'
                          : 'border-dashed border-[var(--worship-border)] hover:bg-[var(--worship-cream)]'
                      }`}
                    >
                      <Plus className="w-4 h-4 text-[var(--worship-navy)]" />
                      <span className="text-sm font-medium text-[var(--worship-navy)]">
                        Add as a new slot at the end
                      </span>
                    </button>
                  </div>
                  {eligibleSlots.length === 0 && (
                    <p className="text-[11px] text-[var(--worship-slate)] mt-2">
                      No matching slots in this service. It will be added as a
                      new slot at the end.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="pt-4 border-t border-[var(--worship-border)]">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--worship-slate)] hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedPlan || submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium worship-btn-gold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Adding…
              </>
            ) : (
              'Add to service'
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
