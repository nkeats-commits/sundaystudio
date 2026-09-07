import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/bible-tools',
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
  crossReferences: Array<{
    sourceId: string;
    sourceTitle: string;
    sourceAuthor: string;
    sourceUrl: string;
    attribution: string;
    sourceReference: string;
    targets: string[];
    note?: string;
  }>;
  lexicalEntries: Array<{
    sourceId: string;
    sourceTitle: string;
    sourceAuthor: string;
    sourceUrl: string;
    attribution: string;
    key: string;
    term: string;
    strongsNumber?: string;
    originalWord: string;
    transliteration: string;
    language: string;
    definition: string;
    references: string[];
  }>;
};

type LookupCallbacks = {
  onSuccess?: (data: ReferenceBundle) => void;
  onError?: () => void;
};

let lookupState: {
  isPending: boolean;
  isError: boolean;
  mutate: (variables: { data: Record<string, unknown> }, callbacks: LookupCallbacks) => void;
};
let savedResourcePayloads: Record<string, unknown>[] = [];
let lastLookup:
  | {
      variables: { data: Record<string, unknown> };
      callbacks: LookupCallbacks;
    }
  | undefined;
let activeRerender: ((ui: React.ReactElement) => void) | undefined;

const enabledSources = {
  data: {
    enabledSourceIds: ['kjv-1769', 'tsk-1830', 'strongs-1890', 'matthew-henry-concise'],
    sources: [
      { id: 'kjv-1769', kind: 'translation' },
      { id: 'tsk-1830', kind: 'cross-reference' },
      { id: 'strongs-1890', kind: 'lexicon' },
      { id: 'matthew-henry-concise', kind: 'commentary' },
    ],
  },
  isLoading: false,
};

const sampleResults: ReferenceBundle = {
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
  crossReferences: [
    {
      sourceId: 'tsk-1830',
      sourceTitle: 'Treasury of Scripture Knowledge',
      sourceAuthor: 'R. A. Torrey',
      sourceUrl: 'https://example.test/tsk',
      attribution: 'Treasury of Scripture Knowledge, public domain',
      sourceReference: 'John 3:16',
      targets: ['Romans 5:8', '1 John 4:9'],
      note: 'Related theme',
    },
  ],
  lexicalEntries: [
    {
      sourceId: 'strongs-1890',
      sourceTitle: "Strong's Greek Dictionary",
      sourceAuthor: 'James Strong',
      sourceUrl: 'https://example.test/strongs',
      attribution: "Strong's Greek Dictionary, public domain",
      key: 'G26',
      term: 'love',
      strongsNumber: 'G26',
      originalWord: 'ἀγάπη',
      transliteration: 'agapē',
      language: 'Greek',
      definition: 'Affection and benevolence.',
      references: ['John 3:16'],
    },
  ],
};

const Icon = (props: Record<string, unknown>) => React.createElement('span', props);

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
    useLocation: () => ['/bible-tools', () => undefined],
  },
});

mock.module('lucide-react', {
  namedExports: {
    ArrowRight: Icon,
    BookmarkPlus: Icon,
    BookOpen: Icon,
    Check: Icon,
    ExternalLink: Icon,
    Library: Icon,
    Loader2: Icon,
    RotateCcw: Icon,
    Search: Icon,
    Sparkles: Icon,
    XCircle: Icon,
  },
});

mock.module('@tanstack/react-query', {
  namedExports: {
    useQueryClient: () => ({ invalidateQueries: async () => undefined }),
  },
});

mock.module('@workspace/api-client-react', {
  namedExports: {
    getListSermonResourcesQueryKey: () => ['sermon-resources'],
    useCreateSermonResource: () => ({
      isPending: false,
      mutate: (
        variables: { data: Record<string, unknown> },
        callbacks: { onSuccess?: () => void },
      ) => {
        savedResourcePayloads.push(variables.data);
        callbacks.onSuccess?.();
      },
    }),
    useListScholarlySources: () => enabledSources,
    useLookupBibleReferences: () => lookupState,
  },
});

mock.module('sonner', {
  namedExports: {
    toast: { success: () => undefined, error: () => undefined },
  },
});

mock.module('../components/layout/AppLayout', {
  namedExports: {
    AppLayout: ({ children }: { children: React.ReactNode }) =>
      React.createElement('main', null, children),
  },
});

const { act, cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { default: BibleTools } = await import('./BibleTools');

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

function renderPage(width: number) {
  setViewport(width);
  const view = render(<BibleTools />);
  activeRerender = (ui) => view.rerender(ui);
  return view;
}

function submitForm() {
  const form = screen.getByRole('button', { name: /look up/i }).closest('form');
  assert.ok(form);
  fireEvent.submit(form);
}

function setLookupPending(pending: boolean) {
  lookupState.isPending = pending;
  activeRerender?.(<BibleTools />);
}

async function completeLookup(results: ReferenceBundle) {
  await act(async () => {
    lookupState.isPending = false;
    lastLookup?.callbacks.onSuccess?.(results);
    activeRerender?.(<BibleTools />);
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/bible-tools');
  lookupState = {
    isPending: false,
    isError: false,
    mutate: (variables, callbacks) => {
      lastLookup = { variables, callbacks };
    },
  };
  savedResourcePayloads = [];
  lastLookup = undefined;
  activeRerender = undefined;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

test('completes a verse lookup with grouped, attributed results at desktop width', async () => {
  renderPage(1280);

  assert.match(
    screen.getByText(/3 Bible reference sources enabled for lookup/).textContent ?? '',
    /Source preferences are managed in Sermon Resources/,
  );

  fireEvent.change(screen.getByLabelText('PASSAGE'), { target: { value: 'John 3:16' } });
  fireEvent.change(screen.getByLabelText("OPTIONAL WORDS OR STRONG'S KEYS"), {
    target: { value: 'love, G26' },
  });
  submitForm();

  assert.deepEqual(lastLookup?.variables, {
    data: { passage: 'John 3:16', terms: ['love', 'G26'] },
  });

  setLookupPending(true);
  assert.ok(screen.getByRole('status'));
  assert.match(screen.getByRole('status').textContent ?? '', /Searching enabled sources/);

  await completeLookup(sampleResults);

  assert.equal(screen.getByRole('heading', { name: 'Bible text' }).textContent, 'Bible text');
  assert.equal(screen.getByRole('heading', { name: 'Cross-references' }).textContent, 'Cross-references');
  assert.equal(screen.getByRole('heading', { name: 'Dictionary / lexicon' }).textContent, 'Dictionary / lexicon');
  assert.ok(screen.getByText('For God so loved the world.'));
  assert.ok(screen.getByText('Romans 5:8, 1 John 4:9'));
  assert.ok(screen.getByText('Affection and benevolence.'));
  assert.ok(
    screen.getByText(
      'This is reference text from an enabled public-domain edition, not your selected translation.',
    ),
  );
  assert.ok(screen.getByText('King James Version, public domain'));
  assert.equal(screen.getAllByRole('link', { name: /Provenance/ }).length, 3);
  assert.equal(screen.getByRole('button', { name: 'Reset' }).textContent?.trim(), 'Reset');
});

test('saves each Bible lookup type and disables the button after saving', async () => {
  renderPage(390);
  fireEvent.change(screen.getByLabelText('PASSAGE'), { target: { value: 'John 3:16' } });
  submitForm();
  await completeLookup(sampleResults);

  const saveButtons = screen.getAllByRole('button', { name: 'Save to Sermon Resources' });
  assert.equal(saveButtons.length, 3);
  for (const button of saveButtons) fireEvent.click(button);

  await waitFor(() => {
    assert.equal(savedResourcePayloads.length, 3);
    assert.equal(
      screen.getAllByRole('button', { name: 'Saved to Sermon Resources' }).length,
      3,
    );
  });
  assert.deepEqual(
    savedResourcePayloads.map((payload) => payload.resourceType),
    ['bible-text', 'cross-reference', 'lexicon'],
  );
  assert.equal(savedResourcePayloads[0].publisher, 'King James Version');
  assert.equal(savedResourcePayloads[0].relatedPassage, 'John 3:16');
  assert.equal(savedResourcePayloads[0].notes, 'King James Version, public domain');
  assert.equal(savedResourcePayloads[1].publisher, 'Treasury of Scripture Knowledge');
  assert.equal(savedResourcePayloads[1].relatedPassage, 'John 3:16');
  assert.equal(
    savedResourcePayloads[1].notes,
    'Treasury of Scripture Knowledge, public domain',
  );
  assert.equal(savedResourcePayloads[2].publisher, "Strong's Greek Dictionary");
  assert.equal(savedResourcePayloads[2].relatedPassage, 'John 3:16');
  assert.equal(savedResourcePayloads[2].notes, "Strong's Greek Dictionary, public domain");

  const savedButtons = screen.getAllByRole('button', { name: 'Saved to Sermon Resources' });
  assert.ok(savedButtons.every((button) => (button as HTMLButtonElement).disabled));
  fireEvent.click(savedButtons[0]);
  assert.equal(savedResourcePayloads.length, 3);
});

test('sends a term-only word lookup and shows the empty state at mobile width', async () => {
  renderPage(390);

  fireEvent.click(screen.getByRole('button', { name: 'Word Lookup' }));
  fireEvent.change(screen.getByLabelText("WORD OR STRONG'S NUMBER"), { target: { value: 'G26' } });
  submitForm();

  assert.deepEqual(lastLookup?.variables, { data: { terms: ['G26'] } });

  await completeLookup({
    translations: [],
    crossReferences: [],
    lexicalEntries: [],
  });

  assert.ok(screen.getByRole('heading', { name: 'No matching reference entries' }));
  assert.match(
    screen.getByText(/None of your enabled public-domain collections matched this lookup/).textContent ?? '',
    /enable more Bible references in Sermon Resources/,
  );
  assert.equal(screen.getByRole('link', { name: /Review enabled sources/ }).getAttribute('href'), '/resources#bible-references');
});

test('keeps validation and request errors actionable on mobile', async () => {
  renderPage(390);

  submitForm();
  assert.equal(screen.getByRole('alert').textContent, 'Enter a Bible passage to look up.');

  fireEvent.change(screen.getByLabelText('PASSAGE'), { target: { value: 'not a passage' } });
  submitForm();
  assert.equal(screen.getByRole('alert').textContent, 'Enter a passage such as John 3:16 or Psalm 23.');

  fireEvent.change(screen.getByLabelText('PASSAGE'), { target: { value: 'John 3:16' } });
  submitForm();
  await act(async () => {
    lastLookup?.callbacks.onError?.();
  });

  assert.ok(screen.getByRole('alert').textContent?.includes('The lookup could not be completed.'));
  assert.ok(screen.getByRole('button', { name: 'Try again' }));
});

test('reset clears lookup results and returns to the ready state on mobile', async () => {
  renderPage(390);

  fireEvent.change(screen.getByLabelText('PASSAGE'), { target: { value: 'John 3:16' } });
  submitForm();
  await completeLookup(sampleResults);

  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

  await waitFor(() => {
    assert.ok(screen.getByRole('heading', { name: 'Ready when you are' }));
  });
  assert.equal((screen.getByLabelText('PASSAGE') as HTMLInputElement).value, '');
  assert.equal(screen.queryByText('For God so loved the world.'), null);
});