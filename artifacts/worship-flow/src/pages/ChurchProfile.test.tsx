import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/church',
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

const refetch = mock.fn(async () => undefined);
let meQuery: Record<string, unknown>;

mock.module('@clerk/react', {
  namedExports: {
    useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  },
});

mock.module('wouter', {
  namedExports: {
    useLocation: () => ['/church', mock.fn()],
  },
});

mock.module('sonner', {
  namedExports: {
    toast: {
      success: mock.fn(),
      error: mock.fn(),
    },
  },
});

mock.module('../components/layout/AppLayout', {
  namedExports: {
    AppLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  },
});

mock.module('@workspace/api-client-react', {
  namedExports: {
    getGetMeQueryKey: () => ['/api/me'],
    getListManuscriptsQueryKey: () => ['/api/manuscripts'],
    useGetMe: () => meQuery,
    useUpdateChurchProfile: () => ({
      isPending: false,
      mutateAsync: mock.fn(),
    }),
    useListManuscripts: () => ({ data: [] }),
    useCreateManuscript: () => ({ mutate: mock.fn() }),
    useDeleteManuscript: () => ({ mutate: mock.fn() }),
    useAnalyzeManuscripts: () => ({ mutate: mock.fn() }),
  },
});

const { cleanup, render, screen } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const ChurchProfile = (await import('./ChurchProfile')).default;

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChurchProfile />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  refetch.mock.resetCalls();
});

afterEach(() => {
  cleanup();
});

test('does not render a blank editable profile while current data is loading', () => {
  meQuery = {
    data: undefined,
    isLoading: true,
    isFetched: false,
    isError: false,
    isSuccess: false,
    refetch,
  };

  renderProfile();

  assert.ok(screen.getByLabelText('Loading your saved profile'));
  assert.equal(screen.queryByRole('button', { name: 'Save Profile' }), null);
  assert.equal(screen.queryByLabelText('CHURCH NAME *'), null);
});

test('shows a recoverable error instead of an unsafe blank profile form', async () => {
  meQuery = {
    data: undefined,
    isLoading: false,
    isFetched: true,
    isError: true,
    isSuccess: false,
    refetch,
  };

  renderProfile();

  assert.match(
    screen.getByRole('alert').textContent ?? '',
    /couldn.t load your saved profile/i,
  );
  assert.equal(screen.queryByRole('button', { name: 'Save Profile' }), null);
  screen.getByRole('button', { name: 'Try again' }).click();
  assert.equal(refetch.mock.callCount(), 1);
});