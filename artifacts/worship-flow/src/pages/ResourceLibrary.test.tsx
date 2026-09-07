import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/resources',
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

const sourcesState = {
  data: {
    enabledSourceIds: [],
    sources: [],
  },
  isLoading: false,
};
const listState = {
  data: [] as Array<Record<string, unknown>>,
  isLoading: false,
};
let lookupState: {
  isPending: boolean;
  mutate: (variables: { data: Record<string, unknown> }, callbacks: LookupCallbacks) => void;
};
let lastLookup: { callbacks: LookupCallbacks } | undefined;
let activeRerender: ((ui: React.ReactElement) => void) | undefined;

type LookupCallbacks = {
  onSuccess?: (data: ReferenceBundle) => void;
  onError?: (error: unknown) => void;
};

type ReferenceBundle = {
  translations: Array<{
    sourceId: string;
    sourceTitle: string;
    sourceAuthor: string;
    sourceUrl: string;
    attribution: string;
    reference: string;
    text: string;
  }>;
  crossReferences: [];
  lexicalEntries: [];
};

const emptyResults: ReferenceBundle = {
  translations: [],
  crossReferences: [],
  lexicalEntries: [],
};

const successfulResults: ReferenceBundle = {
  translations: [
    {
      sourceId: 'kjv-1769',
      sourceTitle: 'King James Version',
      sourceAuthor: 'Public Domain Committee',
      sourceUrl: 'https://example.test/kjv',
      attribution: 'King James Version, public domain',
      reference: 'John 3:16',
      text: 'For God so loved the world.',
    },
  ],
  crossReferences: [],
  lexicalEntries: [],
};

mock.module('@clerk/react', {
  namedExports: { useAuth: () => ({ getToken: async () => null }) },
});
mock.module('wouter', {
  namedExports: { useLocation: () => ['/resources', () => undefined] },
});
mock.module('lucide-react', {
  namedExports: {
    BookOpen: Icon,
    Globe: Icon,
    Link: Icon,
    Loader2: Icon,
    Pencil: Icon,
    Plus: Icon,
    Save: Icon,
    Search: Icon,
    ShieldCheck: Icon,
    Trash2: Icon,
    Upload: Icon,
    X: Icon,
  },
});
mock.module('@tanstack/react-query', {
  namedExports: {
    useQueryClient: () => ({
      invalidateQueries: async () => undefined,
      setQueryData: () => undefined,
    }),
  },
});
mock.module('@workspace/api-client-react', {
  namedExports: {
    useListSermonResources: () => listState,
    useCreateSermonResource: () => ({ isPending: false, mutate: () => undefined }),
    useUpdateSermonResource: () => ({ isPending: false, mutate: () => undefined }),
    useDeleteSermonResource: () => ({ isPending: false, mutate: () => undefined }),
    useListScholarlySources: () => sourcesState,
    useUpdateScholarlySourcePreferences: () => ({ isPending: false, mutate: () => undefined }),
    useLookupBibleReferences: () => lookupState,
    getListSermonResourcesQueryKey: () => ['sermon-resources'],
    getListScholarlySourcesQueryKey: () => ['scholarly-sources'],
  },
});
mock.module('sonner', {
  namedExports: { toast: { success: () => undefined, error: () => undefined } },
});
mock.module('../components/layout/AppLayout', {
  namedExports: {
    AppLayout: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children),
  },
});
mock.module('../components/AddCommentaryModal', {
  namedExports: { AddCommentaryModal: () => null },
});
mock.module('../components/CoverageBadge', {
  namedExports: { CoverageBadge: () => null },
});
mock.module('../lib/bibleTools', {
  namedExports: {
    crossReferenceLookupResource: () => ({}),
    lexicalLookupResource: () => ({}),
    translationLookupResource: () => ({}),
  },
});

const { act, cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { default: ResourceLibrary } = await import('./ResourceLibrary');

function renderPage() {
  const view = render(<ResourceLibrary />);
  activeRerender = (ui) => view.rerender(ui);
  return view;
}

function beginLookup() {
  fireEvent.change(screen.getByPlaceholderText('Passage, e.g. John 3:16'), {
    target: { value: 'John 3:16' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/resources');
  lastLookup = undefined;
  lookupState = {
    isPending: false,
    mutate: (_variables, callbacks) => {
      lastLookup = { callbacks };
      lookupState.isPending = true;
      activeRerender?.(<ResourceLibrary />);
    },
  };
});

afterEach(() => {
  cleanup();
  activeRerender = undefined;
});

test('keeps the preview loading action visible while a Bible reference lookup is pending', () => {
  renderPage();
  beginLookup();

  const previewButton = screen.getByRole('button', { name: /Loading/ });
  assert.equal((previewButton as HTMLButtonElement).disabled, true);
  assert.equal(previewButton.getAttribute('aria-busy'), 'true');
});

test('shows an actionable empty state when no reference collection matches', async () => {
  renderPage();
  beginLookup();

  await act(async () => {
    lookupState.isPending = false;
    lastLookup?.callbacks.onSuccess?.(emptyResults);
    activeRerender?.(<ResourceLibrary />);
  });

  assert.ok(screen.getByText('No enabled reference collection matched that lookup.'));
});

test('shows successful Bible reference preview results with their provenance action', async () => {
  renderPage();
  beginLookup();

  await act(async () => {
    lookupState.isPending = false;
    lastLookup?.callbacks.onSuccess?.(successfulResults);
    activeRerender?.(<ResourceLibrary />);
  });

  assert.ok(screen.getByText('For God so loved the world.'));
  assert.ok(screen.getByRole('link', { name: 'provenance' }));
  assert.ok(screen.getByRole('button', { name: 'Save to Sermon Resources' }));
});

test('lists saved Bible lookups with source attribution and related passages', () => {
  listState.data = [
    {
      id: 1,
      userId: 'test-user',
      resourceType: 'bible-text',
      title: 'John 3:16',
      author: 'Public Domain Committee',
      publisher: 'King James Version',
      year: '',
      pageOrLocation: '',
      url: 'https://example.test/kjv',
      excerpt: 'For God so loved the world.',
      summary: '',
      notes: 'King James Version, public domain',
      relatedPassage: 'John 3:16',
      tags: ['Bible Tools', 'Bible text'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      userId: 'test-user',
      resourceType: 'cross-reference',
      title: 'John 3:16 cross-references',
      author: 'R. A. Torrey',
      publisher: 'Treasury of Scripture Knowledge',
      year: '',
      pageOrLocation: '',
      url: 'https://example.test/tsk',
      excerpt: 'Related passages: Romans 5:8, 1 John 4:9',
      summary: '',
      notes: 'Treasury of Scripture Knowledge, public domain',
      relatedPassage: 'John 3:16',
      tags: ['Bible Tools', 'Cross-reference'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      userId: 'test-user',
      resourceType: 'lexicon',
      title: 'love word study',
      author: 'James Strong',
      publisher: "Strong's Greek Dictionary",
      year: '',
      pageOrLocation: '',
      url: 'https://example.test/strongs',
      excerpt: 'ἀγάπη (agapē)\n\nAffection and benevolence.',
      summary: '',
      notes: "Strong's Greek Dictionary, public domain",
      relatedPassage: 'John 3:16',
      tags: ['Bible Tools', 'Lexicon'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  renderPage();

  assert.ok(screen.getByText('John 3:16 cross-references'));
  assert.ok(screen.getByText('love word study'));
  assert.ok(screen.getByText(/Edition: King James Version/));
  assert.ok(screen.getByText(/Edition: Treasury of Scripture Knowledge/));
  assert.ok(screen.getByText(/Edition: Strong's Greek Dictionary/));
  assert.match(document.body.textContent ?? '', /Attribution:\s*King James Version, public domain/);
  assert.match(
    document.body.textContent ?? '',
    /Attribution:\s*Treasury of Scripture Knowledge, public domain/,
  );
  assert.match(
    document.body.textContent ?? '',
    /Attribution:\s*Strong's Greek Dictionary, public domain/,
  );
  assert.equal(screen.getAllByText('John 3:16').length, 4);
});

test('finds each saved Bible lookup type by publisher, attribution, or provenance URL', () => {
  listState.data = [
    {
      id: 1,
      userId: 'test-user',
      resourceType: 'bible-text',
      title: 'John 3:16',
      author: 'Public Domain Committee',
      publisher: 'King James Version',
      year: '',
      pageOrLocation: '',
      url: 'https://example.test/kjv',
      excerpt: 'For God so loved the world.',
      summary: '',
      notes: 'King James Version, public domain',
      relatedPassage: 'John 3:16',
      tags: ['Bible Tools', 'Bible text'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      userId: 'test-user',
      resourceType: 'cross-reference',
      title: 'John 3:16 cross-references',
      author: 'R. A. Torrey',
      publisher: 'Treasury of Scripture Knowledge',
      year: '',
      pageOrLocation: '',
      url: 'https://example.test/tsk',
      excerpt: 'Related passages: Romans 5:8, 1 John 4:9',
      summary: '',
      notes: 'Treasury of Scripture Knowledge, public domain',
      relatedPassage: 'John 3:16',
      tags: ['Bible Tools', 'Cross-reference'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      userId: 'test-user',
      resourceType: 'lexicon',
      title: 'love word study',
      author: 'James Strong',
      publisher: "Strong's Greek Dictionary",
      year: '',
      pageOrLocation: '',
      url: 'https://example.test/strongs',
      excerpt: 'ἀγάπη (agapē)\n\nAffection and benevolence.',
      summary: '',
      notes: "Strong's Greek Dictionary, public domain",
      relatedPassage: 'John 3:16',
      tags: ['Bible Tools', 'Lexicon'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  renderPage();
  const searchInput = screen.getByPlaceholderText('Search by title, author, passage, source, tags…');

  fireEvent.change(searchInput, { target: { value: 'King James Version' } });
  assert.equal(screen.getAllByRole('heading', { name: 'John 3:16', exact: true }).length, 1);
  assert.equal(screen.queryAllByRole('heading', { name: 'John 3:16 cross-references', exact: true }).length, 0);
  assert.equal(screen.queryAllByRole('heading', { name: 'love word study', exact: true }).length, 0);

  fireEvent.change(searchInput, { target: { value: 'public domain' } });
  assert.equal(screen.getAllByRole('heading', { name: 'John 3:16', exact: true }).length, 1);
  assert.equal(screen.getAllByRole('heading', { name: 'John 3:16 cross-references', exact: true }).length, 1);
  assert.equal(screen.getAllByRole('heading', { name: 'love word study', exact: true }).length, 1);

  fireEvent.change(searchInput, { target: { value: 'example.test/strongs' } });
  assert.equal(screen.queryAllByRole('heading', { name: 'John 3:16', exact: true }).length, 0);
  assert.equal(screen.queryAllByRole('heading', { name: 'John 3:16 cross-references', exact: true }).length, 0);
  assert.equal(screen.getAllByRole('heading', { name: 'love word study', exact: true }).length, 1);
});

test('explains when a search has no saved resource matches and lets the user clear it', () => {
  listState.data = [
    {
      id: 1,
      userId: 'test-user',
      resourceType: 'commentary',
      title: 'A saved commentary',
      author: 'A trusted author',
      publisher: '',
      year: '',
      pageOrLocation: '',
      url: '',
      excerpt: '',
      summary: '',
      notes: '',
      relatedPassage: '',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  renderPage();
  const searchInput = screen.getByPlaceholderText('Search by title, author, passage, source, tags…');

  fireEvent.change(searchInput, { target: { value: 'not in my library' } });

  assert.ok(screen.getByRole('heading', { name: 'No saved resources matched your search' }));
  assert.ok(screen.getByText('Try a different title, author, passage, source, or tag.'));
  assert.ok(screen.queryByRole('heading', { name: 'Your library is empty' }) === null);

  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

  assert.equal((searchInput as HTMLInputElement).value, '');
  assert.ok(screen.getByRole('heading', { name: 'A saved commentary' }));
  assert.equal(screen.queryByRole('heading', { name: 'No saved resources matched your search' }), null);
});

test('keeps the empty-library guidance when no search is active', () => {
  listState.data = [];
  sourcesState.data = { enabledSourceIds: [], sources: [] };

  renderPage();

  assert.ok(screen.getByRole('heading', { name: 'Your library is empty' }));
  assert.ok(screen.getByText('Add a bundled public-domain commentary above, or paste an excerpt from a commentary or article you trust to start building your reference set.'));
  assert.ok(screen.getByRole('button', { name: 'Add your first resource' }));
  assert.equal(screen.queryByRole('button', { name: 'Clear search' }), null);
});

test('shows a retry action when the Bible reference preview fails', async () => {
  renderPage();
  beginLookup();

  await act(async () => {
    lookupState.isPending = false;
    lastLookup?.callbacks.onError?.(new Error('Reference lookup unavailable'));
    activeRerender?.(<ResourceLibrary />);
  });

  assert.match(screen.getByRole('alert').textContent ?? '', /Reference lookup unavailable/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
  assert.equal(lookupState.isPending, true);
  assert.ok(lastLookup);
});

test('explains which Bible reference source failed when the API provides it', async () => {
  renderPage();
  beginLookup();

  await act(async () => {
    lookupState.isPending = false;
    lastLookup?.callbacks.onError?.({
      data: {
        error: 'Bible translation lookup failed. Please try again.',
        source: 'translation',
      },
    });
    activeRerender?.(<ResourceLibrary />);
  });

  assert.match(
    screen.getByRole('alert').textContent ?? '',
    /Bible translation lookup failed/,
  );
  assert.ok(screen.getByRole('button', { name: 'Retry preview' }));
});

test('uses the generic fallback when a preview failure has no usable details', async () => {
  renderPage();
  beginLookup();

  await act(async () => {
    lookupState.isPending = false;
    lastLookup?.callbacks.onError?.({});
    activeRerender?.(<ResourceLibrary />);
  });

  assert.match(
    screen.getByRole('alert').textContent ?? '',
    /Could not preview references\./,
  );
  assert.ok(screen.getByRole('button', { name: 'Retry preview' }));
});