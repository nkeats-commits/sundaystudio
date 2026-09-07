import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/sermons/new',
});

Object.defineProperties(globalThis, {
  window: { configurable: true, writable: true, value: dom.window },
  document: { configurable: true, writable: true, value: dom.window.document },
  navigator: { configurable: true, writable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, writable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, writable: true, value: dom.window.Node },
  getComputedStyle: { configurable: true, writable: true, value: dom.window.getComputedStyle },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, writable: true, value: true },
});
Object.defineProperty(globalThis, 'React', {
  configurable: true,
  writable: true,
  value: React,
});

const Icon = (props: Record<string, unknown>) => React.createElement('span', props);

let routeState: [boolean, { id: string } | undefined] = [false, undefined];
let sermonState: { data: Record<string, unknown> | null; isLoading: boolean } = {
  data: null,
  isLoading: false,
};
let previewImplementation: () => Promise<PreviewResponse>;
let previewCalls: Record<string, unknown>[] = [];

type PreviewResponse = {
  publicDomain: Array<Record<string, unknown>>;
  library: Array<Record<string, unknown>>;
  legacyMode: boolean;
  referenceContext: {
    translations: [];
    crossReferences: [];
    lexicalEntries: [];
  };
};

const emptyPreview: PreviewResponse = {
  publicDomain: [],
  library: [],
  legacyMode: false,
  referenceContext: {
    translations: [],
    crossReferences: [],
    lexicalEntries: [],
  },
};

mock.module('wouter', {
  namedExports: {
    Link: ({
      href,
      children,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement('a', { href, ...props }, children),
    useLocation: () => ['/sermons/new', () => undefined],
    useRoute: () => routeState,
  },
});

mock.module('lucide-react', {
  namedExports: {
    AlertTriangle: Icon,
    BookOpen: Icon,
    Calendar: Icon,
    CheckCircle2: Icon,
    ChevronRight: Icon,
    Download: Icon,
    FileText: Icon,
    Lightbulb: Icon,
    ListTree: Icon,
    Loader2: Icon,
    Mail: Icon,
    MessageCircleQuestion: Icon,
    Music: Icon,
    Pencil: Icon,
    Plus: Icon,
    Printer: Icon,
    RefreshCw: Icon,
    Save: Icon,
    ScrollText: Icon,
    Sparkles: Icon,
    Trash2: Icon,
    Undo2: Icon,
    Users: Icon,
    X: Icon,
  },
});

mock.module('@tanstack/react-query', {
  namedExports: {
    useQueryClient: () => ({
      getQueryData: () => undefined,
      setQueryData: () => undefined,
      invalidateQueries: async () => undefined,
    }),
  },
});

mock.module('@workspace/api-client-react', {
  namedExports: {
    useGetSermon: () => sermonState,
    useCreateSermon: () => ({ isPending: false, mutateAsync: async () => ({ id: 1 }) }),
    useUpdateSermon: () => ({ isPending: false, mutateAsync: async () => sermonState.data }),
    useExportSermon: () => ({ isPending: false, mutateAsync: async () => ({ content: '', format: 'markdown' }) }),
    useListSermonSeries: () => ({ data: [], isLoading: false }),
    useCreateSermonSeries: () => ({ mutateAsync: async ({ data }: { data: { title: string } }) => ({ id: 1, title: data.title }) }),
    useBuildServiceFromSermon: () => ({ isPending: false, mutateAsync: async () => ({ id: 1 }) }),
    previewSermonResources: async (body: Record<string, unknown>) => {
      previewCalls.push(body);
      return previewImplementation();
    },
    getListSermonSeriesQueryKey: () => ['sermon-series'],
    getGetSermonQueryKey: () => ['sermon'],
    getListServicePlansQueryKey: () => ['service-plans'],
    useGetMe: () => ({ data: { onboardingCompletedAt: '2026-01-01', profile: null }, isLoading: false }),
    useGetBillingStatus: () => ({ data: { state: { kind: 'active' } }, isLoading: false, refetch: async () => undefined }),
  },
});

mock.module('../hooks/useJobGenerate', {
  namedExports: {
    useJobGenerate: () => ({
      data: null,
      isPending: false,
      partialText: '',
      error: null,
      mutate: async () => null,
      reset: () => undefined,
    }),
  },
});

mock.module('../hooks/useChurchProfileReady', {
  namedExports: { useChurchProfileReady: () => ({ ready: true, loading: false, churchName: 'Test Church' }) },
});
mock.module('../hooks/useSubscriptionStatus', {
  namedExports: { useSubscriptionStatus: () => ({ allowed: true, isLoading: false, refetch: async () => undefined }) },
});
mock.module('../hooks/useTrialNudge', {
  namedExports: { useTrialNudge: () => ({ maybeNudge: () => undefined }) },
});
mock.module('../components/layout/AppLayout', {
  namedExports: {
    AppLayout: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children),
  },
});
mock.module('../components/ProfileRequiredGate', {
  namedExports: { ProfileRequiredBanner: () => null },
});
mock.module('../components/ScholarlySourcesChip', {
  namedExports: { ScholarlySourcesChip: () => null },
});
mock.module('../components/PersonalizationChip', {
  namedExports: { PersonalizationChip: () => null },
});
mock.module('../lib/sermonStaleness', {
  namedExports: {
    buildSnapshot: () => ({}),
    computeSectionHash: () => '',
    staleSections: () => new Set(),
  },
});
mock.module('sonner', {
  namedExports: { toast: { success: () => undefined, error: () => undefined } },
});

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { default: SermonBuilder } = await import('./SermonBuilder');

function sermonWithStudy(passage: string) {
  return {
    id: 42,
    title: 'Grace',
    sermonDate: null,
    passage,
    secondaryPassages: [],
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
    excludedResourceIds: [],
    excludedSourceIds: [],
    tags: [],
    sectionHashes: {},
    study: {
      context: 'Context',
      observation: 'Observation',
      interpretation: 'Interpretation',
      application: 'Application',
      crossReferences: [],
      interpretiveCautions: [],
      resourceInsights: '',
      consultedSources: [],
      referenceContext: { translations: [], crossReferences: [], lexicalEntries: [] },
      wordStudies: [
        {
          term: 'love',
          originalWord: 'agape',
          transliteration: 'agapē',
          language: 'Greek',
          strongsNumber: 'G26',
          definition: 'Love.',
          significance: 'A study of love.',
        },
        {
          term: 'grace',
          originalWord: 'charis',
          transliteration: 'charis',
          language: 'Greek',
          definition: 'Grace.',
          significance: 'A study of grace.',
        },
      ],
    },
  };
}

function renderBuilder(existing = false) {
  routeState = existing ? [true, { id: '42' }] : [false, undefined];
  sermonState = {
    data: existing ? sermonWithStudy('John 3:16') : null,
    isLoading: false,
  };
  return render(<SermonBuilder />);
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/sermons/new');
  previewCalls = [];
  previewImplementation = async () => emptyPreview;
});

afterEach(() => {
  cleanup();
});

test('opens Bible Tools with the primary passage, or without a query when blank', () => {
  renderBuilder();

  const bibleToolsLink = () => screen.getByRole('link', { name: /Open Bible Tools/i });
  assert.equal(bibleToolsLink().getAttribute('href'), '/bible-tools');

  fireEvent.change(screen.getByLabelText('PRIMARY PASSAGE *'), { target: { value: 'John 3:16' } });
  assert.equal(bibleToolsLink().getAttribute('href'), '/bible-tools?passage=John%203%3A16');
});

test("updates Bible Tools links when editing a saved sermon's passage", () => {
  renderBuilder(true);

  const bibleToolsLink = () => screen.getByRole('link', { name: /Open Bible Tools/i });
  const exploreLinks = () => screen.getAllByRole('link', { name: 'Explore' });

  assert.equal(bibleToolsLink().getAttribute('href'), '/bible-tools?passage=John%203%3A16');
  assert.equal(exploreLinks()[0].getAttribute('href'), '/bible-tools?passage=John%203%3A16&term=G26');
  assert.equal(exploreLinks()[1].getAttribute('href'), '/bible-tools?passage=John%203%3A16&term=grace');

  fireEvent.change(screen.getByLabelText('PRIMARY PASSAGE *'), { target: { value: 'Romans 8:1-11' } });

  assert.equal(bibleToolsLink().getAttribute('href'), '/bible-tools?passage=Romans%208%3A1-11');
  assert.equal(exploreLinks()[0].getAttribute('href'), '/bible-tools?passage=Romans%208%3A1-11&term=G26');
  assert.equal(exploreLinks()[1].getAttribute('href'), '/bible-tools?passage=Romans%208%3A1-11&term=grace');

  fireEvent.change(screen.getByLabelText('PRIMARY PASSAGE *'), { target: { value: '' } });

  assert.equal(bibleToolsLink().getAttribute('href'), '/bible-tools');
  assert.equal(exploreLinks()[0].getAttribute('href'), '/bible-tools?term=G26');
  assert.equal(exploreLinks()[1].getAttribute('href'), '/bible-tools?term=grace');
});

test('keeps the Sermon Resources preview loading state visible while the request is pending', async () => {
  previewImplementation = () => new Promise<PreviewResponse>(() => undefined);
  renderBuilder(true);

  await waitFor(() => {
    assert.ok(screen.getByText('Checking what matches…'));
  });
  assert.ok(previewCalls.length >= 2);
});

test('shows an actionable empty preview when no Sermon Resources match', async () => {
  renderBuilder(true);

  await waitFor(() => {
    assert.ok(screen.getByText(/Nothing matches this sermon/));
  });
  assert.ok(screen.getByText(/Add resources in Sermon Resources/));
});

test('shows matching Sermon Resources in the successful preview', async () => {
  previewImplementation = async () => ({
    ...emptyPreview,
    library: [{ id: 7, title: 'Grace notes', author: 'A pastor', relatedPassage: 'John 3:16', alwaysRelevant: false }],
  });
  renderBuilder(true);

  await waitFor(() => {
    assert.ok(screen.getByText('Grace notes'));
  });
});

test('shows a retry action when the Sermon Resources preview fails', async () => {
  let shouldFail = true;
  previewImplementation = () => shouldFail
    ? Promise.reject(new Error('Preview unavailable'))
    : Promise.resolve({
      ...emptyPreview,
      library: [{ id: 7, title: 'Grace notes', author: '', relatedPassage: 'John 3:16', alwaysRelevant: false }],
    });
  renderBuilder(true);

  await waitFor(() => {
    assert.ok(screen.getByRole('alert'));
  });
  assert.match(screen.getByRole('alert').textContent ?? '', /could not be loaded/i);
  shouldFail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));

  await waitFor(() => {
    assert.ok(screen.getByText('Grace notes'));
  });
});