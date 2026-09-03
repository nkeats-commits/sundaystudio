import assert from 'node:assert/strict';
import { mock, test, beforeEach, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
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

let currentLocation = '/dashboard';
const setLocationCalls: string[] = [];

mock.module('@clerk/react', {
  namedExports: {
    useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  },
});

mock.module('wouter', {
  namedExports: {
    useLocation: () => [
      currentLocation,
      (nextLocation: string) => {
        currentLocation = nextLocation;
        setLocationCalls.push(nextLocation);
      },
    ],
  },
});

const { render, screen, waitFor, cleanup } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const { OnboardingWizard } = await import('./OnboardingWizard');

type Profile = {
  churchName: string;
  leaderName: string;
  leaderRole: string;
  denomination: string;
  musicStyle: string;
  theology: string;
};

type MeResponse = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  onboardingCompletedAt: string | null;
  profile: Profile | null;
};

const initialMe: MeResponse = {
  userId: 'user-1',
  email: 'pastor@example.com',
  firstName: 'Pastor',
  lastName: 'Example',
  imageUrl: null,
  onboardingCompletedAt: null,
  profile: null,
};

const savedProfile: Profile = {
  churchName: 'Grace Community Church',
  leaderName: 'Pastor Jane Smith',
  leaderRole: 'Lead Pastor',
  denomination: '',
  musicStyle: '',
  theology: '',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingWizard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentLocation = '/dashboard';
  setLocationCalls.length = 0;
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanup();
  mock.timers.reset();
});

test('keeps the wizard mounted while a successful profile save refetches the current user', async () => {
  let getMeCalls = 0;
  let resolveRefetch: ((value: Response) => void) | undefined;
  const refetchPending = new Promise<Response>((resolve) => {
    resolveRefetch = resolve;
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/me') {
      getMeCalls += 1;
      return getMeCalls === 1
        ? response(initialMe)
        : refetchPending;
    }
    if (url === '/api/me/church') {
      return response(savedProfile);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  renderWizard();
  const user = userEvent.setup();
  await user.type(await screen.findByPlaceholderText('Grace Community Church'), savedProfile.churchName);
  await user.type(screen.getByPlaceholderText('Pastor John Smith'), savedProfile.leaderName);
  await user.click(screen.getByRole('button', { name: /^Next/ }));

  await screen.findByRole('heading', { name: 'What would you like to do first?' });
  assert.equal(getMeCalls, 2);
  assert.ok(screen.getByText('Step 2 of 3'));
  assert.ok(screen.getByRole('button', { name: /Plan this Sunday.s service/ }));

  resolveRefetch?.(response({ ...initialMe, profile: savedProfile }));
});

test('keeps profile values visible and offers a retry when profile save fails', async () => {
  let saveAttempts = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/me') return response(initialMe);
    if (url === '/api/me/church') {
      saveAttempts += 1;
      return saveAttempts === 1 ? response({ error: 'temporary failure' }, 500) : response(savedProfile);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  renderWizard();
  const user = userEvent.setup();
  const churchName = await screen.findByPlaceholderText('Grace Community Church');
  const leaderName = screen.getByPlaceholderText('Pastor John Smith');
  await user.type(churchName, savedProfile.churchName);
  await user.type(leaderName, savedProfile.leaderName);
  await user.click(screen.getByRole('button', { name: /^Next/ }));

  const profileError = await screen.findByRole('alert');
  assert.match(profileError.textContent ?? '', /couldn.t save your profile/i);
  assert.equal((churchName as HTMLInputElement).value, savedProfile.churchName);
  assert.equal((leaderName as HTMLInputElement).value, savedProfile.leaderName);
  assert.ok(screen.getByRole('button', { name: /Try again/ }));

  await user.click(screen.getByRole('button', { name: /Try again/ }));
  await screen.findByRole('heading', { name: 'What would you like to do first?' });
  assert.equal(saveAttempts, 2);
});

test('keeps step two visible and retries a failed skip', async () => {
  let completeAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/me') return response(initialMe);
    if (url === '/api/me/church') return response(savedProfile);
    if (url === '/api/onboarding/complete') {
      completeAttempts += 1;
      return completeAttempts === 1
        ? response({ error: 'temporary failure' }, 500)
        : response({ onboardingCompletedAt: '2026-09-03T00:00:00.000Z' });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  renderWizard();
  const user = userEvent.setup();
  await user.type(await screen.findByPlaceholderText('Grace Community Church'), savedProfile.churchName);
  await user.type(screen.getByPlaceholderText('Pastor John Smith'), savedProfile.leaderName);
  await user.click(screen.getByRole('button', { name: /^Next/ }));
  await screen.findByRole('heading', { name: 'What would you like to do first?' });

  await user.click(screen.getByRole('button', { name: 'Skip for now' }));
  const skipError = await screen.findByRole('alert');
  assert.match(skipError.textContent ?? '', /couldn.t skip setup/i);
  assert.ok(screen.getByText('Step 2 of 3'));
  assert.ok(screen.getByRole('button', { name: /Plan this Sunday.s service/ }));

  await user.click(screen.getByRole('button', { name: 'Skip for now' }));
  await waitFor(() => assert.equal(screen.queryByText('What would you like to do first?'), null));
  assert.equal(completeAttempts, 2);
});

test('keeps step three and the selected path visible when completion fails, then closes after retry', async () => {
  let completeAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/me') return response(initialMe);
    if (url === '/api/me/church') return response(savedProfile);
    if (url === '/api/onboarding/complete') {
      completeAttempts += 1;
      return completeAttempts === 1
        ? response({ error: 'temporary failure' }, 500)
        : response({ onboardingCompletedAt: '2026-09-03T00:00:00.000Z' });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  renderWizard();
  const user = userEvent.setup();
  await user.type(await screen.findByPlaceholderText('Grace Community Church'), savedProfile.churchName);
  await user.type(screen.getByPlaceholderText('Pastor John Smith'), savedProfile.leaderName);
  await user.click(screen.getByRole('button', { name: /^Next/ }));
  await screen.findByRole('heading', { name: 'What would you like to do first?' });
  await user.click(screen.getByRole('button', { name: /Plan this Sunday.s service/ }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('heading', { name: "You're all set!" });

  await user.click(screen.getByRole('button', { name: 'Open Service Builder' }));
  const completionError = await screen.findByRole('alert');
  assert.match(completionError.textContent ?? '', /couldn.t finish setup/i);
  assert.ok(screen.getByRole('heading', { name: "You're all set!" }));
  assert.ok(screen.getByRole('button', { name: 'Open Service Builder' }));
  assert.equal(setLocationCalls.length, 0);

  await user.click(screen.getByRole('button', { name: 'Open Service Builder' }));
  await waitFor(() => assert.equal(screen.queryByRole('heading', { name: "You're all set!" }), null));
  assert.deepEqual(setLocationCalls, ['/service-builder']);
});