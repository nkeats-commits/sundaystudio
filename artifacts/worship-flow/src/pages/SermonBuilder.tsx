import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetSermon,
  useCreateSermon,
  useUpdateSermon,
  useExportSermon,
  useListSermonResources,
  useListSermonSeries,
  useCreateSermonSeries,
  useBuildServiceFromSermon,
  getListSermonSeriesQueryKey,
  getGetSermonQueryKey,
  getListServicePlansQueryKey,
  type Sermon,
  type SermonSeries,
  type SermonStudyOutput,
  type SermonBigIdeaOutput,
  type SermonOutlineOutput,
  type SermonOutlineOption,
  type SermonManuscriptOutput,
  type SermonApplicationsOutput,
  type SermonIllustrationsOutput,
  type SermonWorshipIntegrationOutput,
  type SermonSmallGroupQuestionsOutput,
  type SermonResource,
  type SermonSectionHashes,
} from '@workspace/api-client-react';
import { useJobGenerate } from '../hooks/useJobGenerate';
import {
  type SectionKey,
  buildSnapshot,
  computeSectionHash,
  staleSections,
} from '../lib/sermonStaleness';
import { AppLayout } from '../components/layout/AppLayout';
import { ProfileRequiredBanner } from '../components/ProfileRequiredGate';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';
import {
  BookOpen,
  Lightbulb,
  ListTree,
  FileText,
  Users,
  Sparkles,
  Music,
  MessageCircleQuestion,
  Loader2,
  Save,
  Download,
  ScrollText,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Plus,
  X,
  ChevronRight,
  Calendar,
  Mail,
  Printer,
} from 'lucide-react';

const LENGTHS = ['10 minutes', '15 minutes', '20 minutes', '25 minutes', '30 minutes', '40 minutes'];
const TONES = ['warm pastoral', 'evangelistic', 'teaching', 'prophetic', 'celebratory', 'lament', 'devotional'];
const STYLES = ['expository', 'narrative', 'topical', 'textual', 'doctrinal', 'biographical'];
const DEPTHS = ['accessible to seekers', 'mixed congregation', 'mature believers', 'seminary-level'];
const FORMATS: Array<{ value: 'manuscript' | 'notes' | 'outline'; label: string }> = [
  { value: 'manuscript', label: 'Full manuscript' },
  { value: 'notes', label: 'Speaking notes' },
  { value: 'outline', label: 'Outline only' },
];

type FormState = {
  title: string;
  sermonDate: string;
  passage: string;
  secondaryPassagesText: string;
  theme: string;
  series: string;
  seriesId: number | null;
  seriesOrder: number | null;
  occasion: string;
  audience: string;
  length: string;
  tone: string;
  style: string;
  depth: string;
  outputFormat: string;
  pastorNotes: string;
  attachedResourceIds: number[];
  tags: string[];
};

const blankForm = (): FormState => ({
  title: 'Untitled Sermon',
  sermonDate: '',
  passage: '',
  secondaryPassagesText: '',
  theme: '',
  series: '',
  seriesId: null,
  seriesOrder: null,
  occasion: '',
  audience: '',
  length: '25 minutes',
  tone: 'warm pastoral',
  style: 'expository',
  depth: 'mixed congregation',
  outputFormat: 'manuscript',
  pastorNotes: '',
  attachedResourceIds: [],
  tags: [],
});

function fromSermon(s: Sermon): FormState {
  return {
    title: s.title,
    sermonDate: s.sermonDate ? s.sermonDate.slice(0, 10) : '',
    passage: s.passage,
    secondaryPassagesText: (s.secondaryPassages ?? []).join(', '),
    theme: s.theme,
    series: s.series,
    seriesId: s.seriesId ?? null,
    seriesOrder: s.seriesOrder ?? null,
    occasion: s.occasion,
    audience: s.audience,
    length: s.length || '25 minutes',
    tone: s.tone || 'warm pastoral',
    style: s.style || 'expository',
    depth: s.depth || 'mixed congregation',
    outputFormat: s.outputFormat || 'manuscript',
    pastorNotes: s.pastorNotes,
    attachedResourceIds: s.attachedResourceIds ?? [],
    tags: s.tags ?? [],
  };
}

function parseSecondary(text: string): string[] {
  return text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

function buildResourcePayload(
  ids: number[],
  resources: SermonResource[] | undefined,
): { title: string; author?: string; excerpt: string }[] {
  if (!resources) return [];
  return resources
    .filter((r) => ids.includes(r.id) && r.excerpt.trim())
    .map((r) => ({ title: r.title, author: r.author || undefined, excerpt: r.excerpt }));
}

type TabKey = 'study' | 'bigIdea' | 'outline' | 'manuscript' | 'applications' | 'illustrations' | 'worship' | 'smallGroupQuestions';

interface StepDef {
  key: TabKey;
  /** Section key in the sermon record / hashes object. */
  section: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Other section the user should generate first (UI hint only). */
  prereq?: { section: SectionKey; label: string };
}

// Core dependency chain — drawn as a numbered stepper.
const CORE_STEPS: StepDef[] = [
  { key: 'study', section: 'study', label: 'Passage Study', icon: BookOpen },
  { key: 'bigIdea', section: 'bigIdea', label: 'Big Idea', icon: Lightbulb, prereq: { section: 'study', label: 'Passage Study' } },
  { key: 'outline', section: 'outline', label: 'Outline', icon: ListTree, prereq: { section: 'bigIdea', label: 'Big Idea' } },
  { key: 'manuscript', section: 'manuscript', label: 'Manuscript', icon: FileText, prereq: { section: 'outline', label: 'Outline' } },
];

// Optional add-ons that branch off from the core chain.
const ADDON_STEPS: StepDef[] = [
  { key: 'applications', section: 'applications', label: 'Applications', icon: Users, prereq: { section: 'bigIdea', label: 'Big Idea' } },
  { key: 'illustrations', section: 'illustrations', label: 'Illustrations', icon: Sparkles, prereq: { section: 'bigIdea', label: 'Big Idea' } },
  { key: 'worship', section: 'worshipIntegration', label: 'Worship Integration', icon: Music, prereq: { section: 'bigIdea', label: 'Big Idea' } },
  { key: 'smallGroupQuestions', section: 'smallGroupQuestions', label: 'Small Group Questions', icon: MessageCircleQuestion, prereq: { section: 'bigIdea', label: 'Big Idea' } },
];

function exportTitleFor(format: string): string {
  if (format === 'small-group-handout') return 'Small group leader handout';
  if (format === 'small-group-email') return 'Small group email draft';
  if (format === 'manuscript') return 'Sermon manuscript';
  if (format === 'notes') return 'Sermon notes';
  if (format === 'outline') return 'Sermon outline';
  return 'Exported sermon';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printExportContent(exportContent: { content: string; format: string }): void {
  const title = exportTitleFor(exportContent.format);
  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
  if (!win) {
    toast.error('Popup blocked — allow popups for this site to print.');
    return;
  }
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 0.6in; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f2937; margin: 0; padding: 24px; }
  h1 { font-size: 20pt; margin: 0 0 4px; }
  .meta { font-size: 9pt; color: #6b7280; margin: 0 0 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; }
  pre { font-family: 'Courier New', Courier, monospace; font-size: 10.5pt; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; margin: 0; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Printed from WorshipFlow · ${escapeHtml(new Date().toLocaleDateString())}</p>
  <pre>${escapeHtml(exportContent.content)}</pre>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 100);
    });
  </script>
</body>
</html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export default function SermonBuilder() {
  const [, params] = useRoute('/sermons/:id');
  const [, setLocation] = useLocation();
  const sermonId = params?.id ? Number(params.id) : null;
  const isExisting = sermonId !== null && Number.isInteger(sermonId);

  // useGetSermon's default `enabled: !!id` disables the query when id is 0,
  // which is what we want for the "new sermon" route.
  const sermonQuery = useGetSermon(sermonId ?? 0);

  const queryClient = useQueryClient();
  const createSermon = useCreateSermon();
  const updateSermon = useUpdateSermon();
  const exportSermon = useExportSermon();
  const resourcesQuery = useListSermonResources();
  const seriesListQuery = useListSermonSeries();
  const createSeries = useCreateSermonSeries();
  const buildService = useBuildServiceFromSermon();

  const [form, setForm] = useState<FormState>(blankForm());
  const [tab, setTab] = useState<TabKey>('study');
  const [exportContent, setExportContent] = useState<{ content: string; format: string } | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate form when an existing sermon is loaded
  useEffect(() => {
    if (isExisting && sermonQuery.data && !hydratedRef.current) {
      setForm(fromSermon(sermonQuery.data));
      hydratedRef.current = true;
    }
  }, [isExisting, sermonQuery.data]);

  const sermon: Sermon | null = isExisting ? sermonQuery.data ?? null : null;

  // Streaming generators
  const studyGen = useJobGenerate<SermonStudyOutput>('/api/generate/sermon-study');
  const bigIdeaGen = useJobGenerate<SermonBigIdeaOutput>('/api/generate/sermon-big-idea');
  const outlineGen = useJobGenerate<SermonOutlineOutput>('/api/generate/sermon-outline');
  const manuscriptGen = useJobGenerate<SermonManuscriptOutput>('/api/generate/sermon-manuscript');
  const applicationsGen = useJobGenerate<SermonApplicationsOutput>('/api/generate/sermon-applications');
  const illustrationsGen = useJobGenerate<SermonIllustrationsOutput>('/api/generate/sermon-illustrations');
  const worshipGen = useJobGenerate<SermonWorshipIntegrationOutput>('/api/generate/sermon-to-service');
  const smallGroupGen = useJobGenerate<SermonSmallGroupQuestionsOutput>('/api/generate/sermon-small-group-questions');

  // Each tab keeps its own refine instruction
  const [refine, setRefine] = useState<Record<string, string>>({});

  const baseContext = useMemo(
    () => ({
      title: form.title,
      passage: form.passage,
      secondaryPassages: parseSecondary(form.secondaryPassagesText),
      theme: form.theme,
      series: form.series,
      seriesId: form.seriesId,
      occasion: form.occasion,
      audience: form.audience,
      length: form.length,
      tone: form.tone,
      style: form.style,
      depth: form.depth,
      outputFormat: form.outputFormat,
      pastorNotes: form.pastorNotes,
      resources: buildResourcePayload(form.attachedResourceIds, resourcesQuery.data),
    }),
    [form, resourcesQuery.data],
  );

  const ensureSermonId = async (): Promise<number | null> => {
    if (sermon) return sermon.id;
    if (sermonId && isExisting) return sermonId;
    if (!form.title.trim()) {
      toast.error('Give your sermon a title first.');
      return null;
    }
    if (!form.passage.trim()) {
      toast.error('Add a primary passage first.');
      return null;
    }
    try {
      const created = await createSermon.mutateAsync({
        data: {
          title: form.title,
          sermonDate: form.sermonDate ? new Date(form.sermonDate).toISOString() : null,
          passage: form.passage,
          secondaryPassages: parseSecondary(form.secondaryPassagesText),
          theme: form.theme,
          series: form.series,
          seriesId: form.seriesId,
          seriesOrder: form.seriesOrder,
          occasion: form.occasion,
          audience: form.audience,
          length: form.length,
          tone: form.tone,
          style: form.style,
          depth: form.depth,
          outputFormat: form.outputFormat,
          pastorNotes: form.pastorNotes,
          attachedResourceIds: form.attachedResourceIds,
          tags: form.tags,
          status: 'draft',
        },
      });
      // Seed the get-sermon cache so subsequent renders read the canonical
      // server row (architect feedback: previously the rendered data leaned
      // on the initial query snapshot and ignored fresh PATCH results).
      queryClient.setQueryData(getGetSermonQueryKey(created.id), created);
      setLocation(`/sermons/${created.id}`, { replace: true });
      hydratedRef.current = true;
      return created.id;
    } catch {
      toast.error('Could not save sermon');
      return null;
    }
  };

  const persistField = async <K extends keyof Sermon>(field: K, value: Sermon[K]): Promise<void> => {
    const id = await ensureSermonId();
    if (!id) return;
    try {
      const updated = await updateSermon.mutateAsync({
        id,
        data: { [field]: value } as Partial<Sermon>,
      });
      // Keep the in-memory sermon synced with what we just persisted.
      // Without this the UI keeps reading the stale section from the initial
      // GET and Regenerate/Refine appears to do nothing on existing sermons.
      queryClient.setQueryData(getGetSermonQueryKey(id), updated);
    } catch {
      toast.error('Could not save section. Try the explicit "Save context" button.');
    }
  };

  /**
   * Build a snapshot of the upstream inputs that the *generation handlers*
   * actually saw when they ran. Generators read passage / outputFormat from
   * the live form (`baseContext`) and section content from the freshest
   * source (`sermon ?? gen.data`). The hash needs to mirror exactly that —
   * not the saved-but-possibly-stale `sermon.passage` — otherwise a user
   * who edits the form and immediately regenerates would see a permanent
   * false-positive stale flag.
   */
  const currentSnapshot = () => {
    // Read the freshest sermon from the cache (it may include hashes
    // written by a sibling section that finished a moment ago).
    const fresh = sermonId
      ? (queryClient.getQueryData(getGetSermonQueryKey(sermonId)) as Sermon | undefined)
      : undefined;
    const sermonForSnap = fresh ?? sermon;
    return buildSnapshot({
      passage: form.passage,
      secondaryPassages: parseSecondary(form.secondaryPassagesText),
      outputFormat: form.outputFormat,
      study: sermonForSnap?.study ?? studyGen.data ?? null,
      bigIdea: sermonForSnap?.bigIdea ?? bigIdeaGen.data ?? null,
      outline: sermonForSnap?.outline ?? outlineGen.data ?? null,
      applications: sermonForSnap?.applications ?? applicationsGen.data ?? null,
    });
  };

  /**
   * Persist a freshly-generated section value AND fingerprint the upstream
   * inputs that produced it, so the UI can later flag the section as stale
   * if those inputs change.
   *
   * To avoid a lost-update race when two sections finish nearly together
   * (each captures `sectionHashes` from its own closure and overwrites the
   * other's key) we re-read the freshest sermon from the React Query cache
   * just before computing the merged hashes object.
   */
  const persistSection = async <K extends keyof Sermon>(
    field: K,
    section: SectionKey,
    value: Sermon[K],
  ): Promise<void> => {
    const id = await ensureSermonId();
    if (!id) return;
    const hash = computeSectionHash(section, currentSnapshot());
    const fresh = queryClient.getQueryData(getGetSermonQueryKey(id)) as Sermon | undefined;
    const baseHashes = fresh?.sectionHashes ?? sermon?.sectionHashes ?? {};
    const nextHashes: SermonSectionHashes = { ...baseHashes, [section]: hash };
    try {
      const updated = await updateSermon.mutateAsync({
        id,
        data: { [field]: value, sectionHashes: nextHashes } as Partial<Sermon>,
      });
      queryClient.setQueryData(getGetSermonQueryKey(id), updated);
    } catch {
      toast.error('Could not save section. Try the explicit "Save context" button.');
    }
  };

  // ------- Generate handlers -------

  const { ready: profileReady } = useChurchProfileReady();

  const requirePassage = (): boolean => {
    if (!profileReady) {
      toast.error('Set up your profile first.', {
        description: 'It tunes the AI to your tradition.',
      });
      return false;
    }
    if (!form.passage.trim()) {
      toast.error('Add a primary passage before generating.');
      return false;
    }
    return true;
  };

  const handleStudy = async (existing?: SermonStudyOutput | null) => {
    if (!requirePassage()) return;
    const out = await studyGen.mutate({
      ...baseContext,
      refineInstruction: refine.study,
      existingContent: existing ?? undefined,
    });
    if (out) await persistSection('study', 'study', out);
  };

  const handleBigIdea = async () => {
    if (!requirePassage()) return;
    const out = await bigIdeaGen.mutate({
      ...baseContext,
      study: sermon?.study ?? studyGen.data ?? undefined,
      refineInstruction: refine.bigIdea,
    });
    if (out) await persistSection('bigIdea', 'bigIdea', out);
  };

  const handleOutline = async (existing?: SermonOutlineOutput | null) => {
    if (!requirePassage()) return;
    const big = (sermon?.bigIdea ?? bigIdeaGen.data) as SermonBigIdeaOutput | undefined;
    const out = await outlineGen.mutate({
      ...baseContext,
      study: sermon?.study ?? studyGen.data ?? undefined,
      bigIdea: big?.selected ?? big?.options?.[0]?.bigIdea ?? undefined,
      refineInstruction: refine.outline,
      existingContent: existing ?? undefined,
    });
    if (out) await persistSection('outline', 'outline', out);
  };

  const handleManuscript = async (existing?: SermonManuscriptOutput | null) => {
    if (!requirePassage()) return;
    const big = (sermon?.bigIdea ?? bigIdeaGen.data) as SermonBigIdeaOutput | undefined;
    const outlineData = (sermon?.outline ?? outlineGen.data) as SermonOutlineOutput | undefined;
    const chosen: SermonOutlineOption | undefined = outlineData?.options?.[outlineData?.selectedIndex ?? 0];
    const out = await manuscriptGen.mutate({
      ...baseContext,
      study: sermon?.study ?? studyGen.data ?? undefined,
      bigIdea: big?.selected ?? big?.options?.[0]?.bigIdea ?? undefined,
      outline: chosen,
      refineInstruction: refine.manuscript,
      existingContent: existing ?? undefined,
    });
    if (out) await persistSection('manuscript', 'manuscript', out);
  };

  const handleApplications = async () => {
    if (!requirePassage()) return;
    const big = (sermon?.bigIdea ?? bigIdeaGen.data) as SermonBigIdeaOutput | undefined;
    const out = await applicationsGen.mutate({
      ...baseContext,
      study: sermon?.study ?? studyGen.data ?? undefined,
      bigIdea: big?.selected ?? big?.options?.[0]?.bigIdea ?? undefined,
      refineInstruction: refine.applications,
    });
    if (out) await persistSection('applications', 'applications', out);
  };

  const handleIllustrations = async () => {
    if (!requirePassage()) return;
    const big = (sermon?.bigIdea ?? bigIdeaGen.data) as SermonBigIdeaOutput | undefined;
    const outlineData = (sermon?.outline ?? outlineGen.data) as SermonOutlineOutput | undefined;
    const chosen: SermonOutlineOption | undefined = outlineData?.options?.[outlineData?.selectedIndex ?? 0];
    const out = await illustrationsGen.mutate({
      ...baseContext,
      bigIdea: big?.selected ?? big?.options?.[0]?.bigIdea ?? undefined,
      outline: chosen,
      refineInstruction: refine.illustrations,
    });
    if (out) await persistSection('illustrations', 'illustrations', out);
  };

  const handleWorship = async () => {
    if (!requirePassage()) return;
    const big = (sermon?.bigIdea ?? bigIdeaGen.data) as SermonBigIdeaOutput | undefined;
    const outlineData = (sermon?.outline ?? outlineGen.data) as SermonOutlineOutput | undefined;
    const chosen: SermonOutlineOption | undefined = outlineData?.options?.[outlineData?.selectedIndex ?? 0];
    const out = await worshipGen.mutate({
      ...baseContext,
      bigIdea: big?.selected ?? big?.options?.[0]?.bigIdea ?? undefined,
      outline: chosen,
      applications: (sermon?.applications ?? applicationsGen.data) ?? undefined,
      refineInstruction: refine.worship,
    });
    if (out) await persistSection('worshipIntegration', 'worshipIntegration', out);
  };

  const handleSmallGroupQuestions = async () => {
    if (!requirePassage()) return;
    const big = (sermon?.bigIdea ?? bigIdeaGen.data) as SermonBigIdeaOutput | undefined;
    const outlineDataLocal = (sermon?.outline ?? outlineGen.data) as SermonOutlineOutput | undefined;
    const chosen: SermonOutlineOption | undefined = outlineDataLocal?.options?.[outlineDataLocal?.selectedIndex ?? 0];
    const out = await smallGroupGen.mutate({
      ...baseContext,
      bigIdea: big?.selected ?? big?.options?.[0]?.bigIdea ?? undefined,
      outline: chosen,
      applications: (sermon?.applications ?? applicationsGen.data) ?? undefined,
      refineInstruction: refine.smallGroupQuestions,
    });
    if (out) await persistSection('smallGroupQuestions', 'smallGroupQuestions', out);
  };

  const saveContext = async () => {
    const id = await ensureSermonId();
    if (!id) return;
    try {
      const updated = await updateSermon.mutateAsync({
        id,
        data: {
          title: form.title,
          sermonDate: form.sermonDate ? new Date(form.sermonDate).toISOString() : null,
          passage: form.passage,
          secondaryPassages: parseSecondary(form.secondaryPassagesText),
          theme: form.theme,
          series: form.series,
          seriesId: form.seriesId,
          seriesOrder: form.seriesOrder,
          occasion: form.occasion,
          audience: form.audience,
          length: form.length,
          tone: form.tone,
          style: form.style,
          depth: form.depth,
          outputFormat: form.outputFormat,
          pastorNotes: form.pastorNotes,
          attachedResourceIds: form.attachedResourceIds,
          tags: form.tags,
        },
      });
      queryClient.setQueryData(getGetSermonQueryKey(id), updated);
      toast.success('Sermon saved');
    } catch {
      toast.error('Failed to save sermon');
    }
  };

  const doExport = async (
    format: 'markdown' | 'text' | 'small-group-handout' | 'small-group-email',
  ) => {
    const id = await ensureSermonId();
    if (!id) return;
    try {
      const result = await exportSermon.mutateAsync({ id, data: { format } });
      setExportContent({ content: result.content, format });
    } catch {
      toast.error('Could not export sermon');
    }
  };

  const setBigIdeaSelection = async (selected: string) => {
    const current = (sermon?.bigIdea ?? bigIdeaGen.data) as SermonBigIdeaOutput | undefined;
    if (!current) return;
    const next = { ...current, selected };
    await persistField('bigIdea', next);
  };

  const setOutlineSelection = async (idx: number) => {
    const current = (sermon?.outline ?? outlineGen.data) as SermonOutlineOutput | undefined;
    if (!current) return;
    const next = { ...current, selectedIndex: idx };
    await persistField('outline', next);
  };

  const toggleResource = (id: number) => {
    const has = form.attachedResourceIds.includes(id);
    const next = has ? form.attachedResourceIds.filter((x) => x !== id) : [...form.attachedResourceIds, id];
    setForm({ ...form, attachedResourceIds: next });
  };

  const removeTag = (t: string) => setForm({ ...form, tags: form.tags.filter((x) => x !== t) });
  const [tagDraft, setTagDraft] = useState('');
  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if (form.tags.includes(t)) return;
    setForm({ ...form, tags: [...form.tags, t] });
    setTagDraft('');
  };

  const studyData: SermonStudyOutput | null = (sermon?.study ?? studyGen.data) ?? null;
  const bigIdeaData: SermonBigIdeaOutput | null = (sermon?.bigIdea ?? bigIdeaGen.data) ?? null;
  const outlineData: SermonOutlineOutput | null = (sermon?.outline ?? outlineGen.data) ?? null;
  const manuscriptData: SermonManuscriptOutput | null = (sermon?.manuscript ?? manuscriptGen.data) ?? null;
  const applicationsData: SermonApplicationsOutput | null = (sermon?.applications ?? applicationsGen.data) ?? null;
  const illustrationsData: SermonIllustrationsOutput | null = (sermon?.illustrations ?? illustrationsGen.data) ?? null;
  const worshipData: SermonWorshipIntegrationOutput | null = (sermon?.worshipIntegration ?? worshipGen.data) ?? null;
  const smallGroupData: SermonSmallGroupQuestionsOutput | null = (sermon?.smallGroupQuestions ?? smallGroupGen.data) ?? null;

  /**
   * Per-section presence map and the set of sections whose stored input
   * fingerprint no longer matches the live upstream values. Sections without
   * a stored hash (legacy data) are intentionally treated as up-to-date.
   */
  const hasContentBySection: Record<SectionKey, boolean> = useMemo(
    () => ({
      study: !!studyData,
      bigIdea: !!bigIdeaData,
      outline: !!outlineData,
      manuscript: !!manuscriptData,
      applications: !!applicationsData,
      illustrations: !!illustrationsData,
      worshipIntegration: !!worshipData,
      smallGroupQuestions: !!smallGroupData,
    }),
    [studyData, bigIdeaData, outlineData, manuscriptData, applicationsData, illustrationsData, worshipData, smallGroupData],
  );

  const staleSet: Set<SectionKey> = useMemo(() => {
    // Use live form values for primitives so the stale check stays
    // consistent with what persistSection writes when the user generates.
    const snap = buildSnapshot({
      passage: form.passage,
      secondaryPassages: parseSecondary(form.secondaryPassagesText),
      outputFormat: form.outputFormat,
      study: sermon?.study ?? studyGen.data ?? null,
      bigIdea: sermon?.bigIdea ?? bigIdeaGen.data ?? null,
      outline: sermon?.outline ?? outlineGen.data ?? null,
      applications: sermon?.applications ?? applicationsGen.data ?? null,
    });
    return staleSections(sermon?.sectionHashes, snap, hasContentBySection);
  }, [
    sermon,
    form.passage,
    form.secondaryPassagesText,
    form.outputFormat,
    studyGen.data,
    bigIdeaGen.data,
    outlineGen.data,
    applicationsGen.data,
    hasContentBySection,
  ]);

  const pendingBySection: Record<SectionKey, boolean> = {
    study: studyGen.isPending,
    bigIdea: bigIdeaGen.isPending,
    outline: outlineGen.isPending,
    manuscript: manuscriptGen.isPending,
    applications: applicationsGen.isPending,
    illustrations: illustrationsGen.isPending,
    worshipIntegration: worshipGen.isPending,
    smallGroupQuestions: smallGroupGen.isPending,
  };

  function statusFor(section: SectionKey): 'pending' | 'stale' | 'done' | 'empty' {
    if (pendingBySection[section]) return 'pending';
    if (!hasContentBySection[section]) return 'empty';
    if (staleSet.has(section)) return 'stale';
    return 'done';
  }

  // -------- UI --------

  return (
    <AppLayout title="Sermon Builder">
      <ProfileRequiredBanner variant="inline" />
      {isExisting && sermonQuery.isLoading ? (
        <div className="flex items-center gap-2 text-[var(--worship-slate)]"><Loader2 className="w-4 h-4 animate-spin" /> Loading sermon…</div>
      ) : (
        <div className="flex flex-col xl:flex-row gap-6">
          {/* LEFT: form */}
          <div className="w-full xl:w-[36%] xl:max-w-md flex flex-col worship-card !p-0 overflow-hidden self-start xl:sticky xl:top-8 xl:max-h-[calc(100vh-4rem)]">
            <div className="p-5 border-b bg-white" style={{ borderColor: 'var(--worship-border)' }}>
              <div className="text-[10px] uppercase tracking-widest text-[var(--worship-gold)] font-bold mb-1">Sermon context</div>
              <input
                className="w-full text-2xl font-serif text-[var(--worship-navy)] bg-transparent outline-none border-b border-transparent focus:border-[var(--worship-gold)]"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Sermon title"
              />
            </div>
            <div className="overflow-y-auto p-5 space-y-5 flex-1 bg-white">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">DATE</label>
                  <input type="date" value={form.sermonDate} onChange={(e) => setForm({ ...form, sermonDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">SERIES</label>
                  <SeriesPicker
                    value={form.seriesId}
                    fallbackText={form.series}
                    options={seriesListQuery.data ?? []}
                    onChange={(picked) => {
                      if (picked === null) {
                        setForm({ ...form, seriesId: null, seriesOrder: null, series: '' });
                      } else {
                        setForm({ ...form, seriesId: picked.id, series: picked.title });
                      }
                    }}
                    onCreate={async (title) => {
                      try {
                        const created = await createSeries.mutateAsync({ data: { title } });
                        await queryClient.invalidateQueries({ queryKey: getListSermonSeriesQueryKey() });
                        setForm((f) => ({ ...f, seriesId: created.id, series: created.title }));
                        toast.success('Series created');
                      } catch {
                        toast.error('Could not create series');
                      }
                    }}
                  />
                </div>
              </div>
              {form.seriesId !== null && (
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">PART NUMBER</label>
                  <input
                    type="number"
                    min={1}
                    value={form.seriesOrder ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm({ ...form, seriesOrder: v === '' ? null : Number(v) });
                    }}
                    placeholder="e.g. 1 for week 1"
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]"
                    style={{ borderColor: 'var(--worship-border)' }}
                  />
                  <p className="text-[10px] text-[var(--worship-muted-slate)] mt-1">
                    Optional. Controls the order this sermon appears within the series.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">PRIMARY PASSAGE *</label>
                <input value={form.passage} onChange={(e) => setForm({ ...form, passage: e.target.value })} placeholder="e.g. Romans 8:1-11" className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">SECONDARY PASSAGES</label>
                <input value={form.secondaryPassagesText} onChange={(e) => setForm({ ...form, secondaryPassagesText: e.target.value })} placeholder="comma-separated" className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">THEME</label>
                <input value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} placeholder="e.g. No condemnation in Christ" className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">OCCASION</label>
                  <input value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })} placeholder="e.g. Lent" className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">AUDIENCE</label>
                  <input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="e.g. mixed adult" className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">LENGTH</label>
                  <select value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
                    {LENGTHS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">FORMAT</label>
                  <select value={form.outputFormat} onChange={(e) => setForm({ ...form, outputFormat: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
                    {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">TONE</label>
                  <select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
                    {TONES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">STYLE</label>
                  <select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
                    {STYLES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">DEPTH</label>
                  <select value={form.depth} onChange={(e) => setForm({ ...form, depth: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
                    {DEPTHS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">PASTOR'S NOTES</label>
                <textarea value={form.pastorNotes} onChange={(e) => setForm({ ...form, pastorNotes: e.target.value })} rows={3} placeholder="Personal angles, pastoral concerns, things to avoid, requested moves…" className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)] resize-y" style={{ borderColor: 'var(--worship-border)' }} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-[var(--worship-slate)]">RESOURCES TO DRAW ON</label>
                  <Link href="/resources" className="text-xs text-[var(--worship-gold)] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Manage library</Link>
                </div>
                {(resourcesQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-[var(--worship-muted-slate)] italic">Your Resource Library is empty. Add commentary excerpts you want the AI to draw from.</p>
                ) : (
                  <div className="border rounded-lg max-h-48 overflow-y-auto bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
                    {resourcesQuery.data!.map((r) => {
                      const checked = form.attachedResourceIds.includes(r.id);
                      return (
                        <label key={r.id} className={`flex items-start gap-2 px-3 py-2 text-xs cursor-pointer border-b last:border-b-0 ${checked ? 'bg-[var(--worship-pale-gold)]/40' : ''}`} style={{ borderColor: 'var(--worship-border)' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleResource(r.id)} className="mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[var(--worship-navy)] truncate">{r.title}</div>
                            <div className="text-[10px] text-[var(--worship-slate)] truncate">{[r.author, r.relatedPassage].filter(Boolean).join(' · ')}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2 text-[var(--worship-slate)]">TAGS</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)] flex items-center gap-1">
                      {t}<button onClick={() => removeTag(t)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add a tag" className="flex-1 px-3 py-1.5 rounded-lg border text-xs bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }} />
                  <button onClick={addTag} className="px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: 'var(--worship-border)' }}>Add</button>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t bg-[var(--worship-cream)] flex items-center gap-2 shrink-0" style={{ borderColor: 'var(--worship-border)' }}>
              <button onClick={saveContext} disabled={createSermon.isPending || updateSermon.isPending} className="worship-btn-primary px-4 py-2 rounded-lg text-sm flex-1 flex items-center justify-center gap-2 disabled:opacity-60">
                {(createSermon.isPending || updateSermon.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save context
              </button>
              <button onClick={() => doExport('markdown')} disabled={exportSermon.isPending} className="px-3 py-2 rounded-lg text-sm border flex items-center gap-1 hover:bg-white" style={{ borderColor: 'var(--worship-border)' }} title="Export as Markdown">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* RIGHT: workspace */}
          <div className="flex-1 flex flex-col worship-card !p-0 overflow-hidden min-h-[600px]">
            <div className="border-b bg-white px-3 sm:px-5 py-3 space-y-2" style={{ borderColor: 'var(--worship-border)' }}>
              <SermonStepper
                steps={CORE_STEPS}
                activeKey={tab}
                onSelect={(k) => setTab(k)}
                statusFor={statusFor}
              />
              <SermonAddOnRow
                steps={ADDON_STEPS}
                activeKey={tab}
                onSelect={(k) => setTab(k)}
                statusFor={statusFor}
              />
            </div>
            <div className="flex-1 overflow-y-auto bg-white">
              <div
                role="tabpanel"
                id={panelId('study')}
                aria-labelledby={tabId('study')}
                hidden={tab !== 'study'}
                tabIndex={0}
                className="p-6 md:p-8 focus:outline-none"
              >
              {tab === 'study' && (
                <SectionPanel
                  title="Passage Study"
                  subtitle="Context, observation, interpretation, application — and what your saved resources contribute."
                  pending={studyGen.isPending}
                  partial={studyGen.partialText}
                  error={studyGen.error}
                  hasContent={!!studyData}
                  stale={staleSet.has('study')}
                  refineValue={refine.study ?? ''}
                  onRefineChange={(v) => setRefine({ ...refine, study: v })}
                  onGenerate={() => handleStudy(null)}
                  onRegenerate={() => handleStudy(studyData)}
                >
                  {studyData && <StudyView data={studyData} />}
                </SectionPanel>
              )}
              </div>
              <div
                role="tabpanel"
                id={panelId('bigIdea')}
                aria-labelledby={tabId('bigIdea')}
                hidden={tab !== 'bigIdea'}
                tabIndex={0}
                className="p-6 md:p-8 focus:outline-none"
              >
              {tab === 'bigIdea' && (
                <SectionPanel
                  title="Big Idea"
                  subtitle="Choose the central truth your sermon will preach."
                  pending={bigIdeaGen.isPending}
                  partial={bigIdeaGen.partialText}
                  error={bigIdeaGen.error}
                  hasContent={!!bigIdeaData}
                  stale={staleSet.has('bigIdea')}
                  prereqHint={!studyData ? 'Tip: generate Passage Study first so the Big Idea has something to build on.' : null}
                  refineValue={refine.bigIdea ?? ''}
                  onRefineChange={(v) => setRefine({ ...refine, bigIdea: v })}
                  onGenerate={handleBigIdea}
                  onRegenerate={handleBigIdea}
                >
                  {bigIdeaData && (
                    <div className="space-y-3">
                      {bigIdeaData.options.map((opt, i) => {
                        const selected = bigIdeaData.selected === opt.bigIdea;
                        return (
                          <div key={i} className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${selected ? 'border-[var(--worship-gold)] bg-[var(--worship-pale-gold)]/40' : 'border-[var(--worship-border)] bg-white hover:bg-[var(--worship-cream)]'}`} onClick={() => setBigIdeaSelection(opt.bigIdea)}>
                            <div className="flex items-start gap-3">
                              <div className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${selected ? 'border-[var(--worship-gold)] bg-[var(--worship-gold)]' : 'border-[var(--worship-border)]'}`}>
                                {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                              <div className="flex-1">
                                <p className="font-serif text-base text-[var(--worship-navy)] leading-snug">{opt.bigIdea}</p>
                                {opt.rationale && <p className="text-xs text-[var(--worship-slate)] mt-2 leading-relaxed">{opt.rationale}</p>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionPanel>
              )}
              </div>
              <div
                role="tabpanel"
                id={panelId('outline')}
                aria-labelledby={tabId('outline')}
                hidden={tab !== 'outline'}
                tabIndex={0}
                className="p-6 md:p-8 focus:outline-none"
              >
              {tab === 'outline' && (
                <SectionPanel
                  title="Outline"
                  subtitle="Pick the shape that best preaches your big idea."
                  pending={outlineGen.isPending}
                  partial={outlineGen.partialText}
                  error={outlineGen.error}
                  hasContent={!!outlineData}
                  stale={staleSet.has('outline')}
                  prereqHint={!bigIdeaData ? 'Tip: pick a Big Idea first — outlines are shaped around it.' : null}
                  refineValue={refine.outline ?? ''}
                  onRefineChange={(v) => setRefine({ ...refine, outline: v })}
                  onGenerate={() => handleOutline(null)}
                  onRegenerate={() => handleOutline(outlineData)}
                >
                  {outlineData && (
                    <div className="space-y-4">
                      {outlineData.options.map((opt, i) => {
                        const selected = (outlineData.selectedIndex ?? 0) === i;
                        return (
                          <div key={i} className={`p-5 rounded-xl border-2 transition-colors ${selected ? 'border-[var(--worship-gold)] bg-[var(--worship-pale-gold)]/30' : 'border-[var(--worship-border)] bg-white'}`}>
                            <div className="flex items-start gap-3 mb-3">
                              <button onClick={() => setOutlineSelection(i)} className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? 'border-[var(--worship-gold)] bg-[var(--worship-gold)]' : 'border-[var(--worship-border)]'}`}>
                                {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </button>
                              <div className="flex-1">
                                <h4 className="font-serif text-lg text-[var(--worship-navy)]">{opt.title}</h4>
                                {opt.approach && <p className="text-xs text-[var(--worship-slate)] mt-0.5 italic">{opt.approach}</p>}
                              </div>
                            </div>
                            <ol className="space-y-2 ml-8 list-decimal list-outside marker:text-[var(--worship-gold)] marker:font-bold">
                              {opt.points.map((p, j) => (
                                <li key={j} className="text-sm text-[var(--worship-charcoal)] pl-1">
                                  <span className="font-semibold">{p.heading}</span>
                                  {p.summary && <p className="text-xs text-[var(--worship-slate)] leading-relaxed mt-0.5">{p.summary}</p>}
                                  {p.scriptureSupport && p.scriptureSupport.length > 0 && (
                                    <p className="text-[10px] text-[var(--worship-muted-slate)] mt-1 italic">Scripture: {p.scriptureSupport.join(', ')}</p>
                                  )}
                                </li>
                              ))}
                            </ol>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionPanel>
              )}
              </div>
              <div
                role="tabpanel"
                id={panelId('manuscript')}
                aria-labelledby={tabId('manuscript')}
                hidden={tab !== 'manuscript'}
                tabIndex={0}
                className="p-6 md:p-8 focus:outline-none"
              >
              {tab === 'manuscript' && (
                <SectionPanel
                  title="Manuscript"
                  subtitle={`Drafted as ${form.outputFormat === 'manuscript' ? 'a full manuscript' : form.outputFormat === 'notes' ? 'speaking notes' : 'an outline'} — change format in the left panel before regenerating.`}
                  pending={manuscriptGen.isPending}
                  partial={manuscriptGen.partialText}
                  error={manuscriptGen.error}
                  hasContent={!!manuscriptData}
                  stale={staleSet.has('manuscript')}
                  prereqHint={!outlineData ? 'Tip: generate an Outline first — the manuscript is drafted from it.' : null}
                  refineValue={refine.manuscript ?? ''}
                  onRefineChange={(v) => setRefine({ ...refine, manuscript: v })}
                  onGenerate={() => handleManuscript(null)}
                  onRegenerate={() => handleManuscript(manuscriptData)}
                >
                  {manuscriptData && (
                    <div className="prose prose-sm max-w-none">
                      {manuscriptData.introduction && (
                        <>
                          <h3 className="font-serif text-lg text-[var(--worship-navy)] mb-2">Introduction</h3>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--worship-charcoal)] mb-6">{manuscriptData.introduction}</p>
                        </>
                      )}
                      <h3 className="font-serif text-lg text-[var(--worship-navy)] mb-2">{manuscriptData.format === 'manuscript' ? 'Manuscript' : manuscriptData.format === 'notes' ? 'Speaking notes' : 'Outline'}</h3>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--worship-charcoal)]">{manuscriptData.body}</div>
                      {manuscriptData.conclusion && (
                        <>
                          <h3 className="font-serif text-lg text-[var(--worship-navy)] mt-6 mb-2">Conclusion</h3>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--worship-charcoal)]">{manuscriptData.conclusion}</p>
                        </>
                      )}
                    </div>
                  )}
                </SectionPanel>
              )}
              </div>
              <div
                role="tabpanel"
                id={panelId('applications')}
                aria-labelledby={tabId('applications')}
                hidden={tab !== 'applications'}
                tabIndex={0}
                className="p-6 md:p-8 focus:outline-none"
              >
              {tab === 'applications' && (
                <SectionPanel
                  title="Applications"
                  subtitle="Concrete, specific applications across many parts of your congregation."
                  pending={applicationsGen.isPending}
                  partial={applicationsGen.partialText}
                  error={applicationsGen.error}
                  hasContent={!!applicationsData}
                  stale={staleSet.has('applications')}
                  prereqHint={!bigIdeaData ? 'Tip: pick a Big Idea first so applications stay focused.' : null}
                  refineValue={refine.applications ?? ''}
                  onRefineChange={(v) => setRefine({ ...refine, applications: v })}
                  onGenerate={handleApplications}
                  onRegenerate={handleApplications}
                >
                  {applicationsData && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {applicationsData.groups.map((g, i) => (
                          <div key={i} className="p-4 rounded-xl border bg-white" style={{ borderColor: 'var(--worship-border)' }}>
                            <div className="text-[10px] uppercase tracking-wider text-[var(--worship-gold)] font-bold mb-1">{g.audience}</div>
                            <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed">{g.application}</p>
                          </div>
                        ))}
                      </div>
                      {!smallGroupData && applicationsData.smallGroupQuestions && applicationsData.smallGroupQuestions.length > 0 && (
                        <div>
                          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-2">Small group questions</h4>
                          <ul className="space-y-2">
                            {applicationsData.smallGroupQuestions.map((q, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-[var(--worship-charcoal)]">
                                <ChevronRight className="w-4 h-4 text-[var(--worship-gold)] shrink-0 mt-0.5" />{q}
                              </li>
                            ))}
                          </ul>
                          <p className="text-[10px] text-[var(--worship-muted-slate)] mt-2 italic">
                            Tip: open the Small Group Questions add-on for a fuller, grouped Bible-study set.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </SectionPanel>
              )}
              </div>
              <div
                role="tabpanel"
                id={panelId('illustrations')}
                aria-labelledby={tabId('illustrations')}
                hidden={tab !== 'illustrations'}
                tabIndex={0}
                className="p-6 md:p-8 focus:outline-none"
              >
              {tab === 'illustrations' && (
                <SectionPanel
                  title="Illustrations"
                  subtitle="Story, analogy, historical, or cultural illustrations. Anything unverifiable will be flagged."
                  pending={illustrationsGen.isPending}
                  partial={illustrationsGen.partialText}
                  error={illustrationsGen.error}
                  hasContent={!!illustrationsData}
                  stale={staleSet.has('illustrations')}
                  prereqHint={!bigIdeaData ? 'Tip: pick a Big Idea first so illustrations land on the right truth.' : null}
                  refineValue={refine.illustrations ?? ''}
                  onRefineChange={(v) => setRefine({ ...refine, illustrations: v })}
                  onGenerate={handleIllustrations}
                  onRegenerate={handleIllustrations}
                >
                  {illustrationsData && (
                    <div className="space-y-3">
                      {illustrationsData.illustrations.map((ill, i) => (
                        <div key={i} className="p-4 rounded-xl border bg-white" style={{ borderColor: 'var(--worship-border)' }}>
                          <div className="flex items-start gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] uppercase tracking-wider text-[var(--worship-gold)] font-bold mb-0.5">{ill.kind}</div>
                              <h4 className="font-serif text-base text-[var(--worship-navy)] leading-snug">{ill.title}</h4>
                            </div>
                            {ill.verifyBeforeUsing && (
                              <span className="shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Verify before using
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed whitespace-pre-wrap">{ill.body}</p>
                          {ill.notes && (
                            <p className="text-xs text-[var(--worship-slate)] mt-3 border-t pt-2 italic" style={{ borderColor: 'var(--worship-border)' }}>{ill.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionPanel>
              )}
              </div>
              <div
                role="tabpanel"
                id={panelId('smallGroupQuestions')}
                aria-labelledby={tabId('smallGroupQuestions')}
                hidden={tab !== 'smallGroupQuestions'}
                tabIndex={0}
                className="p-6 md:p-8 focus:outline-none"
              >
              {tab === 'smallGroupQuestions' && (
                <SectionPanel
                  title="Small Group Questions"
                  subtitle="Bible-study discussion questions in the classic observation / interpretation / application arc — plus an icebreaker and a closing prayer prompt."
                  pending={smallGroupGen.isPending}
                  partial={smallGroupGen.partialText}
                  error={smallGroupGen.error}
                  hasContent={!!smallGroupData}
                  stale={staleSet.has('smallGroupQuestions')}
                  prereqHint={!bigIdeaData ? 'Tip: pick a Big Idea first so the discussion stays anchored in the sermon.' : null}
                  refineValue={refine.smallGroupQuestions ?? ''}
                  onRefineChange={(v) => setRefine({ ...refine, smallGroupQuestions: v })}
                  onGenerate={handleSmallGroupQuestions}
                  onRegenerate={handleSmallGroupQuestions}
                >
                  {smallGroupData && <SmallGroupQuestionsView data={smallGroupData} />}
                  {smallGroupData && (
                    <div className="mt-6 p-5 rounded-xl border bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <h4 className="font-serif text-lg text-[var(--worship-navy)] flex items-center gap-2">
                            <Users className="w-4 h-4" /> Send to small group leaders
                          </h4>
                          <p className="text-xs text-[var(--worship-slate)] mt-1 max-w-md">
                            Generate a clean, leader-ready handout — just the passage, big idea, and the grouped questions. No manuscript, no worship notes. Pick a printable handout or an email-ready version with a brief context paragraph.
                          </p>
                          {!sermonId && (
                            <p className="text-xs text-[var(--worship-gold)] font-medium mt-2">
                              Save the sermon first to enable this.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            disabled={!sermonId || exportSermon.isPending}
                            onClick={() => doExport('small-group-handout')}
                            className="px-3 py-2 text-xs rounded-lg border bg-white flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-60"
                            style={{ borderColor: 'var(--worship-border)' }}
                            title="Printable leader handout (Markdown)"
                          >
                            <Printer className="w-3.5 h-3.5" /> Printable handout
                          </button>
                          <button
                            disabled={!sermonId || exportSermon.isPending}
                            onClick={() => doExport('small-group-email')}
                            className="worship-btn-gold px-4 py-2 text-sm rounded-lg flex items-center gap-2 disabled:opacity-60"
                            title="Email-ready version with context paragraph"
                          >
                            {exportSermon.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                            Email to leaders
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </SectionPanel>
              )}
              </div>
              <div
                role="tabpanel"
                id={panelId('worship')}
                aria-labelledby={tabId('worship')}
                hidden={tab !== 'worship'}
                tabIndex={0}
                className="p-6 md:p-8 focus:outline-none"
              >
              {tab === 'worship' && (
                <SectionPanel
                  title="Worship Integration"
                  subtitle="Take this sermon to Sunday: songs, liturgy, response, and team prep."
                  pending={worshipGen.isPending}
                  partial={worshipGen.partialText}
                  error={worshipGen.error}
                  hasContent={!!worshipData}
                  stale={staleSet.has('worshipIntegration')}
                  prereqHint={!bigIdeaData ? 'Tip: pick a Big Idea first — worship songs and liturgy hinge on it.' : null}
                  refineValue={refine.worship ?? ''}
                  onRefineChange={(v) => setRefine({ ...refine, worship: v })}
                  onGenerate={handleWorship}
                  onRegenerate={handleWorship}
                >
                  {worshipData && <WorshipView data={worshipData} hideSmallGroupQuestions={!!smallGroupData} />}
                  {worshipData && (
                    <div className="mt-4 p-5 rounded-xl border bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <h4 className="font-serif text-lg text-[var(--worship-navy)] flex items-center gap-2">
                            <Calendar className="w-4 h-4" /> Take this to Sunday
                          </h4>
                          <p className="text-xs text-[var(--worship-slate)] mt-1 max-w-md">
                            We'll spin up a draft service plan from these worship ideas — songs, call to worship, prayer, sermon, and benediction. You can refine slots after.
                          </p>
                          {!sermonId && (
                            <p className="text-xs text-[var(--worship-gold)] font-medium mt-2">
                              Save the sermon first to enable this.
                            </p>
                          )}
                        </div>
                        <button
                          disabled={!sermonId || buildService.isPending}
                          onClick={() => {
                            if (!sermonId) return;
                            buildService.mutate(
                              { id: sermonId },
                              {
                                onSuccess: (svc) => {
                                  toast.success('Service draft created');
                                  queryClient.invalidateQueries({ queryKey: getListServicePlansQueryKey() });
                                  setLocation(`/services/${svc.id}`);
                                },
                                onError: () => toast.error('Could not build service plan'),
                              },
                            );
                          }}
                          className="worship-btn-gold px-4 py-2 text-sm rounded-lg flex items-center gap-2 disabled:opacity-60 shrink-0"
                        >
                          {buildService.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                          Build a service from this sermon
                        </button>
                      </div>
                    </div>
                  )}
                </SectionPanel>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {exportContent && (
        <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-black/40 p-0 md:p-6" onClick={() => setExportContent(null)}>
          <div className="bg-white w-full md:max-w-3xl md:rounded-2xl shadow-xl flex flex-col max-h-screen md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--worship-border)' }}>
              <div>
                <h2 className="font-serif text-xl text-[var(--worship-navy)]">{exportTitleFor(exportContent.format)}</h2>
                <p className="text-xs text-[var(--worship-slate)]">{exportContent.format === 'small-group-handout' ? 'Print or copy this and hand it to your group leaders.' : exportContent.format === 'small-group-email' ? 'Copy and paste into your email — subject line included.' : `Format: ${exportContent.format}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => printExportContent(exportContent)} className="px-3 py-1.5 text-xs rounded-lg border flex items-center gap-1.5 hover:bg-slate-50" style={{ borderColor: 'var(--worship-border)' }}><Printer className="w-3.5 h-3.5" /> Print</button>
                <button onClick={() => navigator.clipboard.writeText(exportContent.content).then(() => toast.success('Copied'))} className="worship-btn-primary px-3 py-1.5 text-xs rounded-lg">Copy</button>
                <button onClick={() => setExportContent(null)} className="p-1.5 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <pre className="overflow-auto p-6 text-xs font-mono whitespace-pre-wrap text-[var(--worship-charcoal)] flex-1 bg-[var(--worship-cream)]">{exportContent.content}</pre>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// ---------------- helper sub-components ----------------

function SectionPanel({
  title,
  subtitle,
  pending,
  partial,
  error,
  hasContent,
  stale = false,
  prereqHint = null,
  refineValue,
  onRefineChange,
  onGenerate,
  onRegenerate,
  children,
}: {
  title: string;
  subtitle: string;
  pending: boolean;
  partial: string;
  error: Error | null;
  hasContent: boolean;
  /** When true, show an amber "inputs changed" banner with a Regenerate CTA. */
  stale?: boolean;
  /** When set, show a soft hint above Generate that an upstream step is missing. */
  prereqHint?: string | null;
  refineValue: string;
  onRefineChange: (v: string) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl text-[var(--worship-navy)] flex items-center gap-2">
            {title}
            {stale && (
              <span
                aria-label="This section's upstream inputs have changed since it was generated."
                title="Upstream inputs have changed since this was generated."
                className="inline-block w-2 h-2 rounded-full bg-amber-500"
              />
            )}
          </h2>
          <p className="text-sm text-[var(--worship-slate)] mt-1 max-w-xl">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasContent && (
            <button onClick={onRegenerate} disabled={pending} className="px-3 py-2 text-xs rounded-lg border flex items-center gap-1 hover:bg-slate-50 disabled:opacity-60" style={{ borderColor: 'var(--worship-border)' }}>
              <RefreshCw className={`w-3.5 h-3.5 ${pending ? 'animate-spin' : ''}`} /> Regenerate
            </button>
          )}
          {!hasContent && (
            <button onClick={onGenerate} disabled={pending} className="worship-btn-gold px-4 py-2 text-sm rounded-lg flex items-center gap-2 disabled:opacity-60">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate
            </button>
          )}
        </div>
      </div>

      {stale && hasContent && (
        <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
          <div className="flex-1 text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">Inputs changed since this was generated.</span>{' '}
            What you see below was drafted against earlier upstream values. Regenerate to refresh
            against the current passage, study, big idea, or outline selection.
          </div>
          <button
            onClick={onRegenerate}
            disabled={pending}
            className="shrink-0 px-3 py-1.5 text-xs rounded-md bg-amber-600 text-white hover:bg-amber-700 flex items-center gap-1 disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${pending ? 'animate-spin' : ''}`} /> Regenerate
          </button>
        </div>
      )}

      {prereqHint && !hasContent && !pending && (
        <div className="p-3 rounded-xl border bg-[var(--worship-cream)] text-xs text-[var(--worship-slate)] flex items-start gap-2" style={{ borderColor: 'var(--worship-border)' }}>
          <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-[var(--worship-gold)]" />
          <div>{prereqHint} You can still generate now if you want — the AI will fill in around what's missing.</div>
        </div>
      )}

      {hasContent && (
        <div className="flex items-stretch gap-2">
          <input value={refineValue} onChange={(e) => onRefineChange(e.target.value)} placeholder="Refine: e.g. make it more pastoral, shorter, add a sending note…" className="flex-1 px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: 'var(--worship-border)' }} />
          <button onClick={onRegenerate} disabled={pending} className="worship-btn-primary px-4 py-2 text-sm rounded-lg flex items-center gap-1.5 disabled:opacity-60">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refine
          </button>
        </div>
      )}

      {pending && (
        <div className="p-4 rounded-xl border border-dashed bg-[var(--worship-cream)] text-xs text-[var(--worship-slate)]" style={{ borderColor: 'var(--worship-border)' }}>
          <div className="flex items-center gap-2 mb-2 font-semibold text-[var(--worship-navy)]"><Loader2 className="w-4 h-4 animate-spin" /> Generating…</div>
          {partial.length > 0 ? (
            <div className="font-mono text-[11px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{partial}</div>
          ) : (
            <div>Streaming from the model — this can take 10–30 seconds for longer sections.</div>
          )}
        </div>
      )}

      {error && !pending && (
        <div className="p-3 rounded-xl border bg-red-50 text-sm text-red-700 flex items-start gap-2" style={{ borderColor: '#fecaca' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Generation failed</div>
            <div className="text-xs mt-0.5">{error.message}</div>
          </div>
        </div>
      )}

      {!pending && !hasContent && !error && (
        <div className="text-center py-12 px-6 border border-dashed rounded-xl bg-white" style={{ borderColor: 'var(--worship-border)' }}>
          <ScrollText className="w-10 h-10 mx-auto mb-3 text-[var(--worship-muted-slate)] opacity-60" />
          <p className="text-sm text-[var(--worship-slate)]">Nothing here yet. Click <span className="font-semibold text-[var(--worship-navy)]">Generate</span> when your context is ready.</p>
        </div>
      )}

      {hasContent && children}
    </div>
  );
}

type SectionStatus = 'pending' | 'stale' | 'done' | 'empty';

function statusDot(status: SectionStatus): React.ReactNode {
  if (status === 'done') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-label="Done" />;
  }
  if (status === 'stale') {
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" aria-label="Stale" />;
  }
  if (status === 'pending') {
    return <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--worship-slate)]" aria-label="Generating" />;
  }
  return <span className="inline-block w-2.5 h-2.5 rounded-full border border-[var(--worship-border)]" aria-label="Not started" />;
}

const tabId = (k: TabKey) => `sermon-tab-${k}`;
const panelId = (k: TabKey) => `sermon-panel-${k}`;

/**
 * Shared roving-tabindex / arrow-key handler for tablists. Steps within each
 * row form an independent tab strip — Left/Right move focus and selection
 * between steps in that row, wrapping at the ends. Home/End jump to first/last.
 */
function useTabRowKeydown(
  steps: StepDef[],
  onSelect: (k: TabKey) => void,
  refs: React.MutableRefObject<(HTMLButtonElement | null)[]>,
) {
  return (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % steps.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + steps.length) % steps.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = steps.length - 1;
    else return;
    e.preventDefault();
    onSelect(steps[next].key);
    refs.current[next]?.focus();
  };
}

function SermonStepper({
  steps,
  activeKey,
  onSelect,
  statusFor,
}: {
  steps: StepDef[];
  activeKey: TabKey;
  onSelect: (k: TabKey) => void;
  statusFor: (s: SectionKey) => SectionStatus;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = useTabRowKeydown(steps, onSelect, btnRefs);
  // If the active tab lives in a sibling row (e.g. an add-on chip is the
  // current tab), this row would otherwise have every button at
  // tabIndex=-1 and become unreachable via Tab. Mirror the add-on row's
  // fallback: keep the first step as a tab-stop so keyboard users can
  // always reach the core stepper.
  const activeInRow = steps.some((s) => s.key === activeKey);
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto" role="tablist" aria-label="Sermon build steps">
      {steps.map((step, i) => {
        const status = statusFor(step.section);
        const active = activeKey === step.key;
        const isTabStop = active || (!activeInRow && i === 0);
        const isLast = i === steps.length - 1;
        return (
          <div key={step.key} className="flex items-stretch min-w-0">
            <button
              ref={(el) => { btnRefs.current[i] = el; }}
              role="tab"
              id={tabId(step.key)}
              aria-controls={panelId(step.key)}
              aria-selected={active}
              tabIndex={isTabStop ? 0 : -1}
              onClick={() => onSelect(step.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[var(--worship-pale-gold)] text-[var(--worship-navy)]'
                  : 'text-[var(--worship-slate)] hover:bg-[var(--worship-cream)] hover:text-[var(--worship-navy)]'
              }`}
            >
              <span
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  active
                    ? 'bg-[var(--worship-gold)] text-white'
                    : status === 'done'
                      ? 'bg-emerald-100 text-emerald-700'
                      : status === 'stale'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-[var(--worship-cream)] text-[var(--worship-slate)] border border-[var(--worship-border)]'
                }`}
              >
                {i + 1}
              </span>
              <step.icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{step.label}</span>
              <span className="shrink-0">{statusDot(status)}</span>
            </button>
            {!isLast && (
              <div aria-hidden="true" className="flex items-center px-1 text-[var(--worship-muted-slate)]">
                <ChevronRight className="w-4 h-4" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SermonAddOnRow({
  steps,
  activeKey,
  onSelect,
  statusFor,
}: {
  steps: StepDef[];
  activeKey: TabKey;
  onSelect: (k: TabKey) => void;
  statusFor: (s: SectionKey) => SectionStatus;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = useTabRowKeydown(steps, onSelect, btnRefs);
  // Whether the active tab lives in this row — controls roving tabindex so a
  // keyboard user lands on the *currently selected* add-on (if any) rather
  // than always the first chip when tabbing into the row.
  const activeInRow = steps.some((s) => s.key === activeKey);
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto pt-1"
      role="tablist"
      aria-label="Sermon add-on steps"
    >
      <span aria-hidden="true" className="text-[10px] uppercase tracking-widest font-bold text-[var(--worship-muted-slate)] shrink-0">
        Add-ons
      </span>
      {steps.map((step, i) => {
        const status = statusFor(step.section);
        const active = activeKey === step.key;
        // If no add-on is currently selected, make the first chip the
        // tab-stop so the row remains keyboard-reachable.
        const isTabStop = active || (!activeInRow && i === 0);
        return (
          <button
            key={step.key}
            ref={(el) => { btnRefs.current[i] = el; }}
            role="tab"
            id={tabId(step.key)}
            aria-controls={panelId(step.key)}
            aria-selected={active}
            tabIndex={isTabStop ? 0 : -1}
            onClick={() => onSelect(step.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap border transition-colors ${
              active
                ? 'border-[var(--worship-gold)] bg-[var(--worship-pale-gold)] text-[var(--worship-navy)]'
                : 'border-[var(--worship-border)] text-[var(--worship-slate)] hover:bg-[var(--worship-cream)] hover:text-[var(--worship-navy)]'
            }`}
          >
            <step.icon className="w-3 h-3" />
            {step.label}
            {statusDot(status)}
          </button>
        );
      })}
    </div>
  );
}

function StudyView({ data }: { data: SermonStudyOutput }) {
  return (
    <div className="space-y-5">
      {data.context && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-1">Context</h4>
          <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed">{data.context}</p>
        </div>
      )}
      {data.observation && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-1">Observation</h4>
          <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed">{data.observation}</p>
        </div>
      )}
      {data.interpretation && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-1">Interpretation</h4>
          <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed">{data.interpretation}</p>
        </div>
      )}
      {data.application && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-1">Application</h4>
          <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed">{data.application}</p>
        </div>
      )}
      {data.crossReferences && data.crossReferences.length > 0 && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-1">Cross references</h4>
          <div className="flex flex-wrap gap-1.5">
            {data.crossReferences.map((c, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-md bg-[var(--worship-cream)] text-[var(--worship-charcoal)]">{c}</span>
            ))}
          </div>
        </div>
      )}
      {data.interpretiveCautions && data.interpretiveCautions.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Interpretive cautions</h4>
          <ul className="space-y-1">
            {data.interpretiveCautions.map((c, i) => <li key={i} className="text-xs text-amber-900 leading-relaxed">• {c}</li>)}
          </ul>
        </div>
      )}
      {data.resourceInsights && (
        <div className="p-3 rounded-xl border bg-[var(--worship-pale-gold)]/40" style={{ borderColor: 'var(--worship-border)' }}>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--worship-gold)] mb-2">From your resources</h4>
          <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed">{data.resourceInsights}</p>
        </div>
      )}
    </div>
  );
}

function WorshipView({ data, hideSmallGroupQuestions = false }: { data: SermonWorshipIntegrationOutput; hideSmallGroupQuestions?: boolean }) {
  return (
    <div className="space-y-5">
      {data.themes && data.themes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.themes.map((t, i) => <span key={i} className="text-xs px-3 py-1 rounded-full bg-[var(--worship-sand)] text-[var(--worship-navy)]">{t}</span>)}
        </div>
      )}
      {data.songs && data.songs.length > 0 && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-2 flex items-center gap-2"><Music className="w-4 h-4" /> Suggested songs</h4>
          <div className="space-y-2">
            {data.songs.map((s, i) => (
              <div key={i} className="p-3 rounded-lg border bg-white" style={{ borderColor: 'var(--worship-border)' }}>
                <div className="font-semibold text-sm text-[var(--worship-navy)]">{s.title}{s.artist ? ` — ${s.artist}` : ''}</div>
                {s.whyItFits && <div className="text-xs text-[var(--worship-slate)] mt-0.5 leading-relaxed">{s.whyItFits}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.callToWorship && <BlockSection title="Call to worship">{data.callToWorship}</BlockSection>}
      {data.responseMoment && <BlockSection title="Response moment">{data.responseMoment}</BlockSection>}
      {data.communionMoment && <BlockSection title="Communion moment">{data.communionMoment}</BlockSection>}
      {data.benediction && <BlockSection title="Benediction">{data.benediction}</BlockSection>}
      {data.prayerPrompts && data.prayerPrompts.length > 0 && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-2">Prayer prompts</h4>
          <ul className="space-y-1">{data.prayerPrompts.map((p, i) => <li key={i} className="text-sm text-[var(--worship-charcoal)] flex items-start gap-2"><ChevronRight className="w-4 h-4 text-[var(--worship-gold)] shrink-0 mt-0.5" />{p}</li>)}</ul>
        </div>
      )}
      {!hideSmallGroupQuestions && data.smallGroupQuestions && data.smallGroupQuestions.length > 0 && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-2">Small group questions</h4>
          <ul className="space-y-1">{data.smallGroupQuestions.map((p, i) => <li key={i} className="text-sm text-[var(--worship-charcoal)] flex items-start gap-2"><ChevronRight className="w-4 h-4 text-[var(--worship-gold)] shrink-0 mt-0.5" />{p}</li>)}</ul>
        </div>
      )}
      {data.teamDevotionalSeed && <BlockSection title="Team devotional seed">{data.teamDevotionalSeed}</BlockSection>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.socialSummary && <BlockSection title="Social summary">{data.socialSummary}</BlockSection>}
        {data.emailSummary && <BlockSection title="Email summary">{data.emailSummary}</BlockSection>}
      </div>
    </div>
  );
}

function SmallGroupQuestionsView({ data }: { data: SermonSmallGroupQuestionsOutput }) {
  const QuestionList = ({ items }: { items: string[] }) => (
    <ol className="space-y-2 ml-5 list-decimal list-outside marker:text-[var(--worship-gold)] marker:font-bold">
      {items.map((q, i) => (
        <li key={i} className="text-sm text-[var(--worship-charcoal)] leading-relaxed pl-1">{q}</li>
      ))}
    </ol>
  );
  return (
    <div className="space-y-5">
      {data.openingIcebreaker && (
        <div className="p-4 rounded-xl border bg-[var(--worship-pale-gold)]/40" style={{ borderColor: 'var(--worship-border)' }}>
          <h4 className="text-[10px] uppercase tracking-wider text-[var(--worship-gold)] font-bold mb-1">Opening icebreaker</h4>
          <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed">{data.openingIcebreaker}</p>
        </div>
      )}
      {data.observationQuestions.length > 0 && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-2">Observation</h4>
          <p className="text-xs text-[var(--worship-slate)] mb-2 italic">What does the text actually say?</p>
          <QuestionList items={data.observationQuestions} />
        </div>
      )}
      {data.interpretationQuestions.length > 0 && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-2">Interpretation</h4>
          <p className="text-xs text-[var(--worship-slate)] mb-2 italic">What does it mean?</p>
          <QuestionList items={data.interpretationQuestions} />
        </div>
      )}
      {data.applicationQuestions.length > 0 && (
        <div>
          <h4 className="font-serif text-base text-[var(--worship-navy)] mb-2">Application</h4>
          <p className="text-xs text-[var(--worship-slate)] mb-2 italic">How does it shape my life this week?</p>
          <QuestionList items={data.applicationQuestions} />
        </div>
      )}
      {data.prayerPrompt && (
        <div className="p-4 rounded-xl border bg-[var(--worship-cream)]" style={{ borderColor: 'var(--worship-border)' }}>
          <h4 className="text-[10px] uppercase tracking-wider text-[var(--worship-gold)] font-bold mb-1">Prayer prompt</h4>
          <p className="text-sm text-[var(--worship-charcoal)] leading-relaxed">{data.prayerPrompt}</p>
        </div>
      )}
    </div>
  );
}

function BlockSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-serif text-base text-[var(--worship-navy)] mb-1">{title}</h4>
      <div className="p-3 rounded-lg border bg-white text-sm leading-relaxed text-[var(--worship-charcoal)] whitespace-pre-wrap" style={{ borderColor: 'var(--worship-border)' }}>{children}</div>
    </div>
  );
}

function SeriesPicker({
  value,
  fallbackText,
  options,
  onChange,
  onCreate,
}: {
  value: number | null;
  fallbackText: string;
  options: SermonSeries[];
  onChange: (s: SermonSeries | null) => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  // If the sermon points to a series the current user can't see (deleted/etc),
  // surface the legacy free-text title so the pastor still sees something.
  const showLegacy = value === null && !!fallbackText;

  const submitCreate = async () => {
    const t = newTitle.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onCreate(t);
      setNewTitle('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  if (creating) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void submitCreate(); }
            if (e.key === 'Escape') { setCreating(false); setNewTitle(''); }
          }}
          placeholder="New series title"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]"
          style={{ borderColor: 'var(--worship-border)' }}
        />
        <button
          onClick={() => void submitCreate()}
          disabled={!newTitle.trim() || busy}
          className="px-3 py-2 rounded-lg text-xs worship-btn-primary disabled:opacity-60"
        >
          {busy ? '…' : 'Create'}
        </button>
        <button
          onClick={() => { setCreating(false); setNewTitle(''); }}
          className="px-2 py-2 rounded-lg text-xs border"
          style={{ borderColor: 'var(--worship-border)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <select
      value={value ?? '__none__'}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '__none__') {
          onChange(null);
        } else if (v === '__new__') {
          setCreating(true);
        } else {
          const id = Number(v);
          const picked = options.find((o) => o.id === id);
          if (picked) onChange(picked);
        }
      }}
      className="w-full px-3 py-2 rounded-lg border text-sm bg-[var(--worship-cream)]"
      style={{ borderColor: 'var(--worship-border)' }}
    >
      <option value="__none__">— Standalone sermon —</option>
      {showLegacy && (
        <option value="__none__" disabled>
          (was: {fallbackText})
        </option>
      )}
      {options.map((s) => (
        <option key={s.id} value={s.id}>{s.title}</option>
      ))}
      <option value="__new__">+ Create new series…</option>
    </select>
  );
}
