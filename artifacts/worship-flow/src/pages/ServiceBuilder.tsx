import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  Save,
  RotateCcw,
  Loader2,
  Plus,
  X,
  LayoutTemplate,
  Music,
  BookOpen,
  Mic,
  Wheat,
  Gift,
  DoorOpen,
  Sparkles,
  ChevronsRight,
  Bookmark,
  AlertCircle,
  Link2,
  GripVertical,
  Pencil,
  Trash2,
  BookmarkPlus,
  Check,
  Wand2,
} from 'lucide-react';
import {
  useCreateServicePlan,
  useListServiceTemplates,
  useCreateServiceTemplate,
  getListServiceTemplatesQueryKey,
  type GeneratedServicePlan,
  type GeneratedStepContent,
  type GenerateStepContentBody,
  type ServicePlanItem,
  type ServiceTemplate,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useJobGenerate } from '../hooks/useJobGenerate';
import { SlotPicker, LinkedPill, slotPickerSupported } from '../components/SlotPicker';
import { ProfileRequiredBanner } from '../components/ProfileRequiredGate';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import {
  WORSHIP_ELEMENTS,
  STARTER_TEMPLATES,
  findElementById,
  type FlowStep,
  type WorshipKind,
} from '../lib/serviceFlow';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

const SERVICE_PHASES = [
  'Reading your thematic focus…',
  'Mapping your service flow…',
  'Composing each worship element…',
  'Assembling the full plan…',
];

type EditableFlowStep = FlowStep & { uid: string };

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toEditable(flow: FlowStep[]): EditableFlowStep[] {
  return flow.map((s) => ({ ...s, uid: uid() }));
}

export default function ServiceBuilder() {
  const searchParams = new URLSearchParams(window.location.search);
  const promptParam = searchParams.get('prompt') || '';

  const [formData, setFormData] = useState({
    theme: promptParam,
    scripture: '',
    season: 'Ordinary Time',
    serviceLength: '60 minutes',
    notes: '',
    serviceDate: new Date().toISOString().split('T')[0],
  });

  // The user-defined ordered service flow. Starts EMPTY — the spec calls for
  // an explicit, deliberate flow rather than a silently preloaded skeleton.
  const [flow, setFlow] = useState<EditableFlowStep[]>([]);
  const [renamingUid, setRenamingUid] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  // Bumped after a successful save so SaveTemplateDialog remounts and
  // discards any leftover draft name/description state.
  const [saveDialogNonce, setSaveDialogNonce] = useState(0);
  // The currently-applied template id (built-in or saved). Cleared whenever
  // the user mutates the flow so it visually de-selects, signalling unsaved
  // changes.
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(
    null,
  );

  const [, setLocation] = useLocation();
  const generate = useJobGenerate<GeneratedServicePlan>(
    '/api/generate/service-plan',
  );
  const createPlan = useCreateServicePlan();
  const createTemplate = useCreateServiceTemplate();
  const { data: savedTemplates } = useListServiceTemplates();
  const queryClient = useQueryClient();
  const lastSubmittedRef = useRef<typeof formData | null>(null);
  const lastSubmittedFlowRef = useRef<FlowStep[] | null>(null);
  const dragUidRef = useRef<string | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  useEffect(() => {
    if (!generate.isPending) { setPhaseIdx(0); return; }
    const t = setInterval(() => setPhaseIdx((i) => (i + 1) % SERVICE_PHASES.length), 3000);
    return () => clearInterval(t);
  }, [generate.isPending]);

  const [slotOverrides, setSlotOverrides] = useState<
    Record<number, Partial<ServicePlanItem>>
  >({});
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);
  // Per-slot inline body editor state. `editingIndex` is the row index
  // currently being edited; `editDraft` is the un-committed text. We only
  // ever edit one slot at a time to keep the UX focused.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  // Index of the slot whose body is currently being regenerated, if any.
  // Driven by the dedicated `regenerateStep` job hook so the spinner stays
  // local to a single row even while the rest of the plan remains editable.
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(
    null,
  );
  const regenerateStep = useJobGenerate<GeneratedStepContent>(
    '/api/generate/step-content',
  );

  const mergedOrder: ServicePlanItem[] = (
    generate.data?.content.order ?? []
  ).map((slot, i) =>
    slotOverrides[i]
      ? ({ ...slot, ...slotOverrides[i] } as ServicePlanItem)
      : slot,
  );

  const { ready: profileReady } = useChurchProfileReady();
  const { allowed: subAllowed } = useSubscriptionStatus();

  // Convert the editable flow into the on-the-wire FlowStep[] (drops uid).
  const wireFlow: FlowStep[] = useMemo(
    () => flow.map(({ stepName, kind }) => ({ stepName, kind })),
    [flow],
  );

  const mutateFlow = (next: EditableFlowStep[]) => {
    setFlow(next);
    setAppliedTemplateId(null);
  };

  const addStepFromPalette = (paletteId: string) => {
    const el = findElementById(paletteId);
    if (!el) return;
    mutateFlow([
      ...flow,
      { uid: uid(), kind: el.kind, stepName: el.defaultStepName },
    ]);
  };

  const resetFlow = () => {
    if (flow.length === 0) return;
    if (
      !window.confirm(
        'Clear your current service flow? This will remove all steps.',
      )
    ) {
      return;
    }
    setFlow([]);
    setAppliedTemplateId(null);
  };

  const removeStep = (u: string) => {
    mutateFlow(flow.filter((s) => s.uid !== u));
  };

  const startRename = (step: EditableFlowStep) => {
    setRenamingUid(step.uid);
    setRenameDraft(step.stepName);
  };

  const commitRename = () => {
    if (!renamingUid) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenamingUid(null);
      return;
    }
    mutateFlow(
      flow.map((s) =>
        s.uid === renamingUid ? { ...s, stepName: trimmed } : s,
      ),
    );
    setRenamingUid(null);
  };

  const onDragStart = (u: string) => (e: React.DragEvent) => {
    dragUidRef.current = u;
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (targetUid: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromUid = dragUidRef.current;
    dragUidRef.current = null;
    if (!fromUid || fromUid === targetUid) return;
    const fromIdx = flow.findIndex((s) => s.uid === fromUid);
    const toIdx = flow.findIndex((s) => s.uid === targetUid);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...flow];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    mutateFlow(next);
  };

  const applyTemplate = (
    id: string,
    nextFlow: FlowStep[],
    badgeId: string,
  ) => {
    // If the user already has a non-empty flow that isn't a clean copy of a
    // saved/starter template, confirm before stomping it.
    const isDirty = flow.length > 0 && appliedTemplateId === null;
    if (isDirty) {
      const ok = window.confirm(
        `Replace your current ${flow.length}-step flow with "${id}"? Your unsaved order will be lost.`,
      );
      if (!ok) return;
    }
    setFlow(toEditable(nextFlow));
    setAppliedTemplateId(badgeId);
    toast.success(`Applied "${id}"`);
  };

  const runGeneration = (
    body?: typeof formData,
    flowToUse?: FlowStep[],
  ) => {
    if (!profileReady) {
      toast.error('Set up your profile first.', {
        description: 'Service shape depends on your tradition.',
      });
      return;
    }
    const payload = body ?? lastSubmittedRef.current ?? formData;
    const flowPayload = flowToUse ?? lastSubmittedFlowRef.current ?? wireFlow;
    lastSubmittedRef.current = payload;
    lastSubmittedFlowRef.current = flowPayload;
    setSlotOverrides({});
    generate
      .mutate({ ...payload, flow: flowPayload })
      .catch((err: Error) => {
        toast.error(err.message || 'Generation failed. Please try again.');
      });
  };

  const handleGenerate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.theme) {
      toast.error('Please provide a theme or thematic focus.');
      return;
    }
    if (wireFlow.length === 0) {
      toast.error('Add at least one element to your service flow.');
      return;
    }
    runGeneration({ ...formData }, wireFlow);
  };

  // ---------- per-slot body editing & regeneration ----------

  const startEdit = (i: number, currentBody: string) => {
    setEditingIndex(i);
    setEditDraft(currentBody);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditDraft('');
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const idx = editingIndex;
    const next = editDraft;
    setSlotOverrides((prev) => ({
      ...prev,
      [idx]: { ...(prev[idx] ?? {}), body: next },
    }));
    setEditingIndex(null);
    setEditDraft('');
  };

  // Map a service-plan slot kind to the regenerator endpoint's accepted
  // kind enum. Returns null when the slot kind has no regeneration path
  // (sermons are authored in Sermon Builder).
  const regenKindFor = (
    kind: ServicePlanItem['kind'],
  ): GenerateStepContentBody['kind'] | null => {
    if (kind === 'sermon') return null;
    return kind;
  };

  const regenerateSlot = async (i: number, item: ServicePlanItem) => {
    const regenKind = regenKindFor(item.kind);
    if (!regenKind) {
      toast.error('Sermons are authored in Sermon Builder.');
      return;
    }
    if (regeneratingIndex !== null) return; // single regen at a time
    setRegeneratingIndex(i);
    try {
      const result = await regenerateStep.mutate({
        kind: regenKind,
        stepName: item.title,
        theme: formData.theme,
        scripture: formData.scripture || undefined,
        season: formData.season || undefined,
        serviceLength: formData.serviceLength || undefined,
        notes: formData.notes || undefined,
      } satisfies GenerateStepContentBody);
      if (result && typeof result.body === 'string') {
        setSlotOverrides((prev) => ({
          ...prev,
          [i]: {
            ...(prev[i] ?? {}),
            body: result.body,
            ...(typeof result.durationMinutes === 'number'
              ? { durationMinutes: result.durationMinutes }
              : {}),
          },
        }));
        toast.success(`Regenerated "${item.title}"`);
      }
    } catch (err) {
      toast.error(
        (err as Error)?.message || 'Could not regenerate this step.',
      );
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const handleSave = () => {
    if (!generate.data) return;
    createPlan.mutate(
      {
        data: {
          title: generate.data.title,
          scripture: generate.data.scripture,
          theme: generate.data.theme,
          season: generate.data.season,
          serviceDate: formData.serviceDate
            ? new Date(formData.serviceDate).toISOString()
            : null,
          content: { ...generate.data.content, order: mergedOrder },
        },
      },
      {
        onSuccess: (data) => {
          toast.success('Service Plan saved');
          setLocation(`/services/${data.id}`);
        },
        onError: () => toast.error('Failed to save service plan'),
      },
    );
  };

  const handleSaveTemplate = (name: string, description: string) => {
    if (wireFlow.length === 0) {
      toast.error('Add at least one element first.');
      return;
    }
    createTemplate.mutate(
      { data: { name: name.trim(), description, flow: wireFlow } },
      {
        onSuccess: (created) => {
          toast.success(`Saved "${created.name}"`);
          queryClient.invalidateQueries({
            queryKey: getListServiceTemplatesQueryKey(),
          });
          setAppliedTemplateId(`saved-${created.id}`);
          setSaveDialogNonce((n) => n + 1);
          setShowSaveDialog(false);
        },
        onError: (err: Error) => {
          toast.error(err.message || 'Could not save that flow');
        },
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

  const getMiniIcon = (kind: WorshipKind) => {
    const props = { className: 'w-3.5 h-3.5' };
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

  return (
    <AppLayout title="Service Builder">
      <ProfileRequiredBanner variant="inline" />
      <div className="flex flex-col lg:flex-row gap-8 h-auto min-h-[calc(100vh-8rem)]">
        {/* LEFT PANEL: INPUT FORM */}
        <div className="w-full lg:w-[40%] flex flex-col worship-card overflow-hidden !p-0 shrink-0 lg:self-start lg:sticky lg:top-8 lg:max-h-[calc(100vh-8rem)]">
          <div
            className="p-6 border-b bg-white"
            style={{ borderColor: 'var(--worship-border)' }}
          >
            <h2 className="text-2xl font-serif text-[var(--worship-navy)]">
              Build a Service
            </h2>
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--worship-slate)' }}
            >
              Provide context to generate a thoughtful plan.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-white">
            {/* Section 1 */}
            <section>
              <h3
                className="text-sm font-bold uppercase tracking-wider mb-4"
                style={{ color: 'var(--worship-muted-slate)' }}
              >
                1. Service Basics
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--worship-slate)' }}
                  >
                    DATE
                  </label>
                  <input
                    type="date"
                    value={formData.serviceDate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        serviceDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
                    style={{
                      borderColor: 'var(--worship-border)',
                      backgroundColor: 'var(--worship-cream)',
                    }}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--worship-slate)' }}
                  >
                    OCCASION / SEASON
                  </label>
                  <input
                    type="text"
                    value={formData.season}
                    onChange={(e) =>
                      setFormData({ ...formData, season: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
                    style={{
                      borderColor: 'var(--worship-border)',
                      backgroundColor: 'var(--worship-cream)',
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <h3
                className="text-sm font-bold uppercase tracking-wider mb-4"
                style={{ color: 'var(--worship-muted-slate)' }}
              >
                2. Sermon & Theme
              </h3>
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--worship-slate)' }}
                  >
                    MAIN SCRIPTURE
                  </label>
                  <input
                    type="text"
                    value={formData.scripture}
                    onChange={(e) =>
                      setFormData({ ...formData, scripture: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
                    style={{
                      borderColor: 'var(--worship-border)',
                      backgroundColor: 'var(--worship-cream)',
                    }}
                    placeholder="e.g. Romans 8:1-11"
                  />
                </div>
                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--worship-slate)' }}
                  >
                    THEMATIC FOCUS *
                  </label>
                  <input
                    type="text"
                    value={formData.theme}
                    onChange={(e) =>
                      setFormData({ ...formData, theme: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
                    style={{
                      borderColor: 'var(--worship-border)',
                      backgroundColor: 'var(--worship-cream)',
                    }}
                    placeholder="e.g. Grace, Adoption, Freedom"
                    required
                  />
                </div>
              </div>
            </section>

            {/* Section 3: Service Flow (templates + palette + ordered list) */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3
                  className="text-sm font-bold uppercase tracking-wider"
                  style={{ color: 'var(--worship-muted-slate)' }}
                >
                  3. Service Flow
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSaveDialog(true)}
                  disabled={wireFlow.length === 0}
                  className="text-xs font-medium text-[var(--worship-gold)] hover:underline flex items-center gap-1 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                  data-testid="button-open-save-flow"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" /> Save as template
                </button>
              </div>

              {/* Template strip */}
              <TemplateStrip
                applied={appliedTemplateId}
                saved={savedTemplates ?? []}
                onApply={applyTemplate}
              />

              {/* Palette */}
              <div className="mt-4">
                <p
                  className="text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: 'var(--worship-muted-slate)' }}
                >
                  Add an element
                </p>
                <div className="flex flex-wrap gap-2">
                  {WORSHIP_ELEMENTS.map((el) => (
                    <button
                      key={el.id}
                      type="button"
                      onClick={() => addStepFromPalette(el.id)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border bg-white text-[var(--worship-slate)] border-[var(--worship-border)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)] flex items-center gap-1 transition-colors"
                      data-testid={`palette-add-${el.id}`}
                    >
                      {getMiniIcon(el.kind)}
                      <Plus className="w-3 h-3" />
                      {el.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ordered list */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p
                    className="text-[11px] uppercase tracking-wider"
                    style={{ color: 'var(--worship-muted-slate)' }}
                  >
                    Your order ({flow.length})
                  </p>
                  {flow.length > 0 && (
                    <button
                      type="button"
                      onClick={resetFlow}
                      className="text-[11px] font-medium text-[var(--worship-muted-slate)] hover:text-red-500 flex items-center gap-1"
                      data-testid="button-reset-flow"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  )}
                </div>
                {flow.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--worship-border)] py-6 px-4 text-center text-xs text-[var(--worship-muted-slate)] space-y-2">
                    <p>
                      Click a worship element above to add it to your flow.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const t = STARTER_TEMPLATES[0]!;
                        applyTemplate(t.name, t.flow, `starter-${t.id}`);
                      }}
                      className="text-[var(--worship-gold)] hover:underline font-medium"
                      data-testid="button-use-starter-template"
                    >
                      Or use a starter template →
                    </button>
                  </div>
                ) : (
                  <ol
                    className="space-y-1.5"
                    data-testid="flow-ordered-list"
                  >
                    {flow.map((step, i) => (
                      <li
                        key={step.uid}
                        draggable
                        onDragStart={onDragStart(step.uid)}
                        onDragOver={onDragOver}
                        onDrop={onDrop(step.uid)}
                        className="group flex items-center gap-2 px-2 py-1.5 rounded-md border bg-white hover:border-[var(--worship-gold)]"
                        style={{ borderColor: 'var(--worship-border)' }}
                        data-testid={`flow-step-${i}`}
                      >
                        <GripVertical className="w-3.5 h-3.5 text-slate-300 cursor-grab shrink-0" />
                        <span className="w-5 text-center text-[10px] font-bold text-[var(--worship-muted-slate)] shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-[var(--worship-navy)] shrink-0">
                          {getMiniIcon(step.kind)}
                        </span>
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-[var(--worship-cream)] text-[var(--worship-muted-slate)] border border-[var(--worship-border)]"
                          data-testid={`flow-step-kind-${i}`}
                          title={`Slot kind: ${step.kind}`}
                        >
                          {step.kind}
                        </span>
                        {renamingUid === step.uid ? (
                          <input
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenamingUid(null);
                            }}
                            className="flex-1 min-w-0 px-2 py-0.5 rounded border text-sm focus:outline-none focus:ring-1 ring-[var(--worship-gold)]"
                            style={{
                              borderColor: 'var(--worship-border)',
                            }}
                            data-testid={`input-rename-step-${i}`}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startRename(step)}
                            className="flex-1 min-w-0 text-left text-sm text-[var(--worship-charcoal)] truncate hover:text-[var(--worship-navy)]"
                            title="Click to rename"
                            data-testid={`button-rename-step-${i}`}
                          >
                            {step.stepName}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startRename(step)}
                          className="p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:text-[var(--worship-navy)]"
                          title="Rename"
                          aria-label="Rename"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStep(step.uid)}
                          className="p-1 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                          title="Remove"
                          aria-label="Remove"
                          data-testid={`button-remove-step-${i}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h3
                className="text-sm font-bold uppercase tracking-wider mb-4"
                style={{ color: 'var(--worship-muted-slate)' }}
              >
                4. Specific Songs or Notes
              </h3>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="w-full px-3 py-3 rounded-lg border text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
                style={{
                  borderColor: 'var(--worship-border)',
                  backgroundColor: 'var(--worship-cream)',
                }}
                placeholder="Include 'Amazing Grace'. Need a good transition out of the sermon."
              ></textarea>
            </section>
          </div>

          <div
            className="p-6 border-t bg-[var(--worship-cream)] shrink-0"
            style={{ borderColor: 'var(--worship-border)' }}
          >
            <button
              onClick={handleGenerate}
              disabled={
                generate.isPending || !profileReady || !subAllowed || wireFlow.length === 0
              }
              title={
                !subAllowed
                  ? 'Subscribe to enable AI generation'
                  : !profileReady
                  ? 'Finish your profile to enable AI generation'
                  : wireFlow.length === 0
                    ? 'Add at least one element to your service flow'
                    : undefined
              }
              className="w-full py-3.5 rounded-xl font-medium text-lg worship-btn-gold flex items-center justify-center gap-2 shadow-lg disabled:opacity-75 disabled:cursor-not-allowed"
              data-testid="button-generate-service-plan"
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Weaving your
                  service...
                </>
              ) : (
                'Generate Service Plan'
              )}
            </button>
          </div>
        </div>

        {/* RIGHT PANEL: OUTPUT */}
        <div
          className="w-full lg:w-[60%] flex flex-col bg-white rounded-2xl shadow-sm border overflow-hidden relative min-h-[500px]"
          style={{ borderColor: 'var(--worship-border)' }}
        >
          {!generate.data && !generate.isPending && !generate.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-[var(--worship-cream)]">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 opacity-50 bg-[var(--worship-sand)]">
                <LayoutTemplate className="w-8 h-8 text-[var(--worship-navy)]" />
              </div>
              <h3 className="text-xl mb-2 font-serif text-[var(--worship-navy)]">
                Your plan will appear here
              </h3>
              <p className="text-sm max-w-sm text-[var(--worship-slate)]">
                Fill out the context on the left and hit generate to create a
                thoughtful worship service.
              </p>
            </div>
          )}

          {generate.isPending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[var(--worship-cream)]/90 backdrop-blur-sm z-10">
              <div className="w-full max-w-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 font-semibold text-sm text-[var(--worship-navy)]">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    {SERVICE_PHASES[phaseIdx % SERVICE_PHASES.length]}
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
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-[var(--worship-cream)]">
              <AlertCircle className="w-12 h-12 text-red-500 opacity-80 mb-4" />
              <h3 className="text-xl mb-2 font-serif text-[var(--worship-navy)]">
                Generation failed
              </h3>
              <p className="text-sm text-[var(--worship-slate)] max-w-sm mb-5">
                {generate.error.message}
              </p>
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
              <div
                className="px-6 py-4 flex items-center justify-end gap-3 border-b bg-white z-10 sticky top-0"
                style={{ borderColor: 'var(--worship-border)' }}
              >
                <button
                  onClick={handleGenerate}
                  className="p-2 rounded-lg hover:bg-slate-50 transition-colors"
                  title="Regenerate"
                >
                  <RotateCcw className="w-4 h-4 text-[var(--worship-slate)]" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={createPlan.isPending || !subAllowed}
                  title={!subAllowed ? 'Subscribe to save service plans' : undefined}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium worship-btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />{' '}
                  {createPlan.isPending ? 'Saving...' : 'Save Service'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-10 pb-20 bg-white">
                <div className="max-w-2xl mx-auto space-y-10">
                  <div className="text-center pb-8 border-b border-[var(--worship-border)]">
                    <h1 className="text-3xl md:text-4xl font-serif mb-3 text-[var(--worship-navy)]">
                      {generate.data.title}
                    </h1>
                    <p className="text-sm uppercase tracking-widest text-[var(--worship-slate)]">
                      {formData.serviceDate
                        ? new Date(formData.serviceDate).toLocaleDateString()
                        : 'Unscheduled'}{' '}
                      • {generate.data.scripture}
                    </p>
                    <div className="flex gap-2 justify-center mt-4">
                      <span className="text-xs px-3 py-1 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)] font-medium">
                        {generate.data.theme}
                      </span>
                      <span className="text-xs px-3 py-1 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-medium">
                        {generate.data.season}
                      </span>
                    </div>
                  </div>

                  {generate.data.content.notes && (
                    <div className="relative pl-6">
                      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-[var(--worship-gold)]"></div>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-serif text-xl text-[var(--worship-navy)]">
                          Pastoral Notes
                        </h3>
                      </div>
                      <p className="text-sm leading-relaxed text-[var(--worship-charcoal)]">
                        {generate.data.content.notes}
                      </p>
                    </div>
                  )}

                  <div className="relative pl-6">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-[var(--worship-navy)]"></div>
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-serif text-xl text-[var(--worship-navy)]">
                        Order of Service
                      </h3>
                    </div>

                    <div className="space-y-6">
                      {mergedOrder.map((item, i) => (
                        <div
                          key={item.id || i}
                          className="worship-card !p-4 !shadow-sm flex gap-4 items-start"
                        >
                          <div className="w-10 h-10 shrink-0 rounded-lg bg-[var(--worship-cream)] flex items-center justify-center border border-[var(--worship-border)]">
                            {getIcon(item.kind)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2 mb-1 flex-wrap">
                              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-[var(--worship-navy)] text-base">
                                  {item.title}
                                </h4>
                                <LinkedPill slot={item} />
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {editingIndex !== i &&
                                  regenKindFor(item.kind) && (
                                    <button
                                      type="button"
                                      onClick={() => regenerateSlot(i, item)}
                                      disabled={regeneratingIndex !== null}
                                      title="Regenerate this step"
                                      className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border text-[var(--worship-navy)] hover:bg-[var(--worship-cream)] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                      style={{
                                        borderColor: 'var(--worship-border)',
                                      }}
                                      data-testid={`button-regen-step-${i}`}
                                    >
                                      {regeneratingIndex === i ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Wand2 className="w-3 h-3" />
                                      )}{' '}
                                      Regenerate
                                    </button>
                                  )}
                                {editingIndex !== i && (
                                  <button
                                    type="button"
                                    onClick={() => startEdit(i, item.body)}
                                    title="Edit text"
                                    className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border text-[var(--worship-navy)] hover:bg-[var(--worship-cream)] flex items-center gap-1"
                                    style={{
                                      borderColor: 'var(--worship-border)',
                                    }}
                                    data-testid={`button-edit-step-${i}`}
                                  >
                                    <Pencil className="w-3 h-3" /> Edit
                                  </button>
                                )}
                                {slotPickerSupported(item.kind) && (
                                  <button
                                    type="button"
                                    onClick={() => setPickingIndex(i)}
                                    className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border text-[var(--worship-navy)] hover:bg-[var(--worship-cream)] flex items-center gap-1"
                                    style={{
                                      borderColor: 'var(--worship-border)',
                                    }}
                                  >
                                    <Link2 className="w-3 h-3" />{' '}
                                    {item.linkedKind ? 'Change' : 'Use saved'}
                                  </button>
                                )}
                                {item.durationMinutes && (
                                  <span className="text-xs font-medium text-[var(--worship-slate)] bg-[var(--worship-cream)] px-2 py-0.5 rounded">
                                    {item.durationMinutes}m
                                  </span>
                                )}
                              </div>
                            </div>
                            {editingIndex === i ? (
                              <div className="mt-2 space-y-2">
                                <textarea
                                  autoFocus
                                  value={editDraft}
                                  onChange={(e) =>
                                    setEditDraft(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') cancelEdit();
                                    if (
                                      e.key === 'Enter' &&
                                      (e.metaKey || e.ctrlKey)
                                    ) {
                                      e.preventDefault();
                                      commitEdit();
                                    }
                                  }}
                                  rows={Math.min(
                                    14,
                                    Math.max(4, editDraft.split('\n').length + 1),
                                  )}
                                  className="w-full px-3 py-2 rounded-lg border text-sm font-serif leading-relaxed focus:outline-none focus:ring-2 ring-[var(--worship-gold)] resize-y"
                                  style={{
                                    borderColor: 'var(--worship-border)',
                                    backgroundColor: 'var(--worship-cream)',
                                  }}
                                  data-testid={`textarea-edit-step-${i}`}
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-[10px] text-[var(--worship-muted-slate)] mr-auto">
                                    ⌘/Ctrl + Enter to save • Esc to cancel
                                  </span>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="px-3 py-1 rounded-md text-xs border bg-white text-[var(--worship-slate)] hover:bg-[var(--worship-cream)]"
                                    style={{
                                      borderColor: 'var(--worship-border)',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={commitEdit}
                                    className="px-3 py-1 rounded-md text-xs worship-btn-primary text-white"
                                    data-testid={`button-save-edit-step-${i}`}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : item.kind === 'song' ? (
                              <p className="text-sm font-medium text-[var(--worship-charcoal)] leading-relaxed whitespace-pre-wrap">
                                {item.body}
                              </p>
                            ) : item.kind === 'prayer' ||
                              item.kind === 'scripture' ||
                              item.kind === 'welcome' ||
                              item.kind === 'benediction' ||
                              item.kind === 'communion' ? (
                              <div className="mt-2 p-3 rounded-lg bg-[var(--worship-cream)] text-sm font-serif italic text-slate-700 leading-relaxed whitespace-pre-wrap">
                                {item.body}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--worship-slate)] leading-relaxed whitespace-pre-wrap">
                                {item.body}
                              </p>
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

      {pickingIndex !== null && mergedOrder[pickingIndex] && (
        <SlotPicker
          slot={mergedOrder[pickingIndex]!}
          onApply={(patch) =>
            setSlotOverrides((prev) => ({
              ...prev,
              [pickingIndex]: { ...(prev[pickingIndex] ?? {}), ...patch },
            }))
          }
          onClose={() => setPickingIndex(null)}
        />
      )}

      <SaveTemplateDialog
        key={saveDialogNonce}
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSaveTemplate}
        saving={createTemplate.isPending}
        stepCount={wireFlow.length}
      />
    </AppLayout>
  );
}

function TemplateStrip({
  applied,
  saved,
  onApply,
}: {
  applied: string | null;
  saved: ServiceTemplate[];
  onApply: (id: string, flow: FlowStep[], badgeId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p
          className="text-[11px] uppercase tracking-wider mb-1.5"
          style={{ color: 'var(--worship-muted-slate)' }}
        >
          Starter templates
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STARTER_TEMPLATES.map((t) => {
            const badgeId = `starter-${t.id}`;
            const active = applied === badgeId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onApply(t.name, t.flow, badgeId)}
                title={t.description}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1 transition-colors ${
                  active
                    ? 'bg-[var(--worship-navy)] text-white border-[var(--worship-navy)]'
                    : 'bg-white text-[var(--worship-slate)] border-[var(--worship-border)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)]'
                }`}
                data-testid={`starter-template-${t.id}`}
              >
                {active && <Check className="w-3 h-3" />}
                {t.name}
              </button>
            );
          })}
        </div>
      </div>
      {saved.length > 0 && (
        <div>
          <p
            className="text-[11px] uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--worship-muted-slate)' }}
          >
            Your saved flows
          </p>
          <div className="flex flex-wrap gap-1.5">
            {saved.map((t) => {
              const badgeId = `saved-${t.id}`;
              const active = applied === badgeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onApply(t.name, t.flow, badgeId)}
                  title={t.description || `${t.flow.length} steps`}
                  className={`px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1 transition-colors ${
                    active
                      ? 'bg-[var(--worship-gold)] text-white border-[var(--worship-gold)]'
                      : 'bg-white text-[var(--worship-slate)] border-[var(--worship-border)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)]'
                  }`}
                  data-testid={`saved-template-${t.id}`}
                >
                  {active && <Check className="w-3 h-3" />}
                  <Bookmark className="w-3 h-3" />
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SaveTemplateDialog({
  open,
  onClose,
  onSave,
  saving,
  stepCount,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  saving: boolean;
  stepCount: number;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name, description);
  };

  const closeAndReset = () => {
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closeAndReset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save service flow</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-xs font-semibold mb-1"
              style={{ color: 'var(--worship-slate)' }}
            >
              NAME *
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Sunday Morning"
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              style={{
                borderColor: 'var(--worship-border)',
                backgroundColor: 'var(--worship-cream)',
              }}
              data-testid="input-save-template-name"
            />
          </div>
          <div>
            <label
              className="block text-xs font-semibold mb-1"
              style={{ color: 'var(--worship-slate)' }}
            >
              DESCRIPTION (OPTIONAL)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="When you'd reach for this flow…"
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ring-[var(--worship-gold)] resize-none"
              style={{
                borderColor: 'var(--worship-border)',
                backgroundColor: 'var(--worship-cream)',
              }}
              data-testid="input-save-template-description"
            />
          </div>
          <p className="text-xs text-[var(--worship-muted-slate)]">
            Saving the current order of {stepCount} step
            {stepCount === 1 ? '' : 's'}.
          </p>
          <DialogFooter>
            <button
              type="button"
              onClick={closeAndReset}
              className="px-4 py-2 rounded-lg text-sm border bg-white text-[var(--worship-slate)] hover:bg-[var(--worship-cream)]"
              style={{ borderColor: 'var(--worship-border)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 rounded-lg text-sm worship-btn-primary text-white disabled:opacity-60"
              data-testid="button-confirm-save-template"
            >
              {saving ? 'Saving…' : 'Save flow'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
