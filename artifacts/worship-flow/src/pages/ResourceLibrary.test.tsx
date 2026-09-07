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
  data: [],
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
  onError?: (error: Error) => void;
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