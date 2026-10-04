import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/assistant' });
Object.defineProperties(globalThis, {
  window: { configurable: true, writable: true, value: dom.window },
  document: { configurable: true, writable: true, value: dom.window.document },
  navigator: { configurable: true, writable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, writable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, writable: true, value: dom.window.Node },
  getComputedStyle: { configurable: true, writable: true, value: dom.window.getComputedStyle },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, writable: true, value: true },
});
Object.defineProperty(globalThis, 'React', { configurable: true, writable: true, value: React });

const conversation = { id: 17, title: 'A hard decision', createdAt: '2025-02-01T12:00:00Z', updatedAt: '2025-02-02T12:00:00Z' };
let profile: Record<string, unknown> | null = {
  churchName: 'Cedar Grove Church',
  leaderName: 'Morgan Lee',
  traditions: 'Weekly communion',
  musicStyle: 'Hymns and contemporary worship',
  theology: 'Reformed',
  toneDescription: 'Warm and plainspoken',
  missionStatement: 'Welcome our neighbors',
  focusAreas: ['Discipleship'],
};
let conversations: typeof conversation[] = [];
let detail: Record<string, unknown> | undefined;
const refetchConversations = mock.fn(async () => undefined);
const createMutate = mock.fn(async () => conversation);
const sendMutate = mock.fn(async (_input?: unknown) => ({ userMessage: {}, assistantMessage: {} }));
const deleteMutate = mock.fn(async () => undefined);
let sendFailure: Error | null = null;

mock.module('@tanstack/react-query', {
  namedExports: {
    useQueryClient: () => ({
      invalidateQueries: mock.fn(async () => undefined),
      removeQueries: mock.fn(),
    }),
  },
});
mock.module('wouter', {
  namedExports: {
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
  },
});
mock.module('../components/layout/AppLayout', {
  namedExports: {
    AppLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  },
});
mock.module('@workspace/api-client-react', {
  namedExports: {
    getGetAssistantConversationQueryKey: (id: number) => [`/api/assistant/conversations/${id}`],
    getListAssistantConversationsQueryKey: () => ['/api/assistant/conversations'],
    useGetMe: () => ({ data: { profile }, isLoading: false, isError: false, refetch: mock.fn() }),
    useListAssistantConversations: () => ({ data: conversations, isLoading: false, isError: false, refetch: refetchConversations }),
    useGetAssistantConversation: () => ({ data: detail, isLoading: false, isError: false, refetch: mock.fn() }),
    useCreateAssistantConversation: () => ({ mutateAsync: createMutate, isPending: false }),
    useSendAssistantMessage: () => ({
      mutateAsync: async (input: unknown) => {
        if (sendFailure) throw sendFailure;
        return sendMutate(input);
      },
      isPending: false,
    }),
    useDeleteAssistantConversation: () => ({ mutateAsync: deleteMutate, isPending: false, isError: false }),
  },
});

const { render, cleanup, screen, fireEvent, act } = await import('@testing-library/react');
const { default: Assistant } = await import('./Assistant');

beforeEach(() => {
  profile = {
    churchName: 'Cedar Grove Church',
    leaderName: 'Morgan Lee',
    traditions: 'Weekly communion',
    musicStyle: 'Hymns and contemporary worship',
    theology: 'Reformed',
    toneDescription: 'Warm and plainspoken',
    missionStatement: 'Welcome our neighbors',
    focusAreas: ['Discipleship'],
  };
  conversations = [];
  detail = undefined;
  sendFailure = null;
  createMutate.mock.resetCalls();
  sendMutate.mock.resetCalls();
  deleteMutate.mock.resetCalls();
  document.body.innerHTML = '';
});
afterEach(() => cleanup());

test('renders a profile-grounded new conversation and pastoral boundaries', () => {
  render(<Assistant />);
  assert.ok(screen.getByTestId('heading-assistant'));
  assert.equal(screen.getByTestId('text-profile-context').textContent, 'Cedar Grove Church');
  const contextDescription = screen.getByTestId('text-profile-context-description').textContent ?? '';
  assert.match(contextDescription, /theology, traditions, music style, pastoral voice, mission, ministry focus areas/);
  assert.ok(screen.getByTestId('empty-new-chat'));
  const boundaries = screen.getByTestId('details-support-boundaries').textContent ?? '';
  assert.match(boundaries, /not divine authority/);
  assert.match(boundaries, /not a substitute for emergency, medical, legal, or mental-health professionals/);
});

test('switches between saved conversations and displays the selected transcript', async () => {
  conversations = [
    conversation,
    { ...conversation, id: 18, title: 'Planning a memorial' },
  ];
  detail = {
    ...conversation,
    messages: [{ id: 1, conversationId: 17, role: 'assistant', content: 'Let’s begin with what matters most.' }],
  };
  render(<Assistant />);
  await act(async () => fireEvent.click(screen.getByTestId('button-select-conversation-17')));
  assert.equal(screen.getByTestId('text-active-conversation-title').textContent, 'A hard decision');
  assert.match(screen.getByTestId('list-messages').textContent ?? '', /what matters most/);

  detail = {
    ...conversation,
    id: 18,
    title: 'Planning a memorial',
    messages: [{ id: 2, conversationId: 18, role: 'assistant', content: 'Let’s consider the family’s needs.' }],
  };
  await act(async () => fireEvent.click(screen.getByTestId('button-select-conversation-18')));
  assert.equal(screen.getByTestId('text-active-conversation-title').textContent, 'Planning a memorial');
  assert.match(screen.getByTestId('list-messages').textContent ?? '', /family’s needs/);
});

test('renders assistant Markdown as formatted content while keeping user messages plain text', async () => {
  conversations = [conversation];
  detail = {
    ...conversation,
    messages: [
      {
        id: 3,
        conversationId: 17,
        role: 'assistant',
        content: [
          '## A Few Clarifying Questions',
          '',
          '- **How late, and how often?** Occasional tardiness is a different conversation.',
          '- **Is this new behavior?**',
          '',
          '---',
          '',
          '> “I noticed you have been arriving late. Is everything okay?”',
        ].join('\n'),
      },
      {
        id: 4,
        conversationId: 17,
        role: 'user',
        content: '**Please keep the words literal.**',
      },
    ],
  };

  render(<Assistant />);
  await act(async () => fireEvent.click(screen.getByTestId('button-select-conversation-17')));

  const assistantContent = screen.getByTestId('message-content-3');
  assert.equal(assistantContent.querySelector('h2')?.textContent, 'A Few Clarifying Questions');
  assert.equal(assistantContent.querySelectorAll('ul li').length, 2);
  assert.equal(assistantContent.querySelector('strong')?.textContent, 'How late, and how often?');
  assert.ok(assistantContent.querySelector('hr'));
  assert.ok(assistantContent.querySelector('blockquote'));
  assert.doesNotMatch(assistantContent.textContent ?? '', /##|\*\*|---/);

  const userMessage = screen.getByTestId('message-user-4');
  assert.equal(userMessage.querySelector('strong'), null);
  assert.match(userMessage.textContent ?? '', /\*\*Please keep the words literal\.\*\*/);
});

test('offers profile completion when church context is missing', () => {
  profile = null;
  render(<Assistant />);
  assert.ok(screen.getByTestId('text-profile-incomplete'));
  assert.equal(screen.getByTestId('link-complete-profile').getAttribute('href'), '/church');
});

test('starts a saved conversation and sends the entered message through generated mutations', async () => {
  render(<Assistant />);
  fireEvent.change(screen.getByTestId('input-message'), { target: { value: 'Help me weigh this decision.' } });
  await act(async () => {
    fireEvent.click(screen.getByTestId('button-send-message'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(createMutate.mock.callCount(), 1);
  assert.equal(sendMutate.mock.callCount(), 1);
});

test('keeps a failed submission available for a retry', async () => {
  sendFailure = new Error('Generation failed. Your message is saved.');
  render(<Assistant />);
  fireEvent.change(screen.getByTestId('input-message'), { target: { value: 'Help me prepare for a hard conversation.' } });
  await act(async () => {
    fireEvent.click(screen.getByTestId('button-send-message'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal((screen.getByTestId('input-message') as HTMLTextAreaElement).value, 'Help me prepare for a hard conversation.');
  assert.ok(screen.getByTestId('status-send-error'));
  assert.ok(screen.getByTestId('button-retry-send'));
});