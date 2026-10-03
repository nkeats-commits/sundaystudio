import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  AlertCircle, ArrowUp, Check, ChevronRight, CircleHelp, Loader2, MessageCircle,
  Plus, ShieldCheck, Trash2, X,
} from 'lucide-react';
import {
  getGetAssistantConversationQueryKey,
  getListAssistantConversationsQueryKey,
  useCreateAssistantConversation,
  useDeleteAssistantConversation,
  useGetAssistantConversation,
  useGetMe,
  useListAssistantConversations,
  useSendAssistantMessage,
  type AssistantConversation,
} from '@workspace/api-client-react';
import { AppLayout } from '../components/layout/AppLayout';

const EMPTY_CONVERSATIONS: AssistantConversation[] = [];

function errorText(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Assistant() {
  const queryClient = useQueryClient();
  const meQuery = useGetMe();
  const conversationsQuery = useListAssistantConversations();
  const conversations = conversationsQuery.data ?? EMPTY_CONVERSATIONS;
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [retryText, setRetryText] = useState('');
  const [pendingText, setPendingText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AssistantConversation | null>(null);
  const [actionError, setActionError] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const createConversation = useCreateAssistantConversation();
  const deleteConversation = useDeleteAssistantConversation();
  const sendMessage = useSendAssistantMessage();
  const detailQuery = useGetAssistantConversation(activeId ?? 0, {
    query: {
      enabled: activeId !== null,
      queryKey: getGetAssistantConversationQueryKey(activeId ?? 0),
    },
  });

  useEffect(() => {
    const end = transcriptEndRef.current;
    if (end && typeof end.scrollIntoView === 'function') {
      end.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [detailQuery.data?.messages.length, pendingText]);

  const profile = meQuery.data?.profile;
  const profileReady = Boolean(profile?.churchName?.trim() && profile?.leaderName?.trim());
  const profileContext = useMemo(() => {
    if (!profile) return [];
    return [
      profile.denomination?.trim() && 'denomination',
      profile.theology?.trim() && 'theology',
      profile.traditions?.trim() && 'traditions',
      profile.musicStyle?.trim() && 'music style',
      (profile.toneDescription?.trim() || profile.derivedToneDescription?.trim()) &&
        'pastoral voice',
      profile.missionStatement?.trim() && 'mission',
      profile.focusAreas?.length && 'ministry focus areas',
    ].filter((value): value is string => Boolean(value));
  }, [profile]);

  const startNewChat = () => {
    setActiveId(null);
    setDraft('');
    setRetryText('');
    setPendingText('');
    setActionError('');
  };

  const selectConversation = (id: number) => {
    setActiveId(id);
    setRetryText('');
    setPendingText('');
    setActionError('');
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sendMessage.isPending || createConversation.isPending) return;
    setActionError('');
    setRetryText('');
    setPendingText(content);
    setDraft('');
    let conversationId = activeId;
    try {
      if (conversationId === null) {
        const created = await createConversation.mutateAsync();
        conversationId = created.id;
        setActiveId(created.id);
        await queryClient.invalidateQueries({ queryKey: getListAssistantConversationsQueryKey() });
      }
      await sendMessage.mutateAsync({ id: conversationId, data: { content } });
      setPendingText('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetAssistantConversationQueryKey(conversationId) }),
        queryClient.invalidateQueries({ queryKey: getListAssistantConversationsQueryKey() }),
      ]);
    } catch (error) {
      setActionError(errorText(error, 'Your message could not be sent. Please try again.'));
      setRetryText(content);
      if (conversationId !== null) {
        await queryClient.invalidateQueries({ queryKey: getGetAssistantConversationQueryKey(conversationId) });
        await queryClient.invalidateQueries({ queryKey: getListAssistantConversationsQueryKey() });
      }
      setPendingText('');
      setDraft(content);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(draft);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setActionError('');
    try {
      await deleteConversation.mutateAsync({ id: target.id });
      await queryClient.invalidateQueries({ queryKey: getListAssistantConversationsQueryKey() });
      queryClient.removeQueries({ queryKey: getGetAssistantConversationQueryKey(target.id) });
      if (activeId === target.id) startNewChat();
      setDeleteTarget(null);
    } catch {
      // The generated mutation retains its error for the confirmation dialog to show.
    }
  };

  const detailError = detailQuery.isError
    ? errorText(detailQuery.error, 'This conversation could not be loaded.')
    : '';
  const isPending = sendMessage.isPending || createConversation.isPending;

  return (
    <AppLayout title="Pastoral Assistant">
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-[1440px] flex-col">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--worship-border)] pb-5">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--worship-muted-slate)]">A thinking partner for ministry</p>
            <h1 data-testid="heading-assistant" className="font-serif text-3xl text-[var(--worship-navy)] md:text-[2.15rem]">Pastoral Assistant</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--worship-slate)]">Work through a decision, prepare for a conversation, or make room to reflect—grounded in the context of your church.</p>
          </div>
          <button
            type="button"
            data-testid="button-new-conversation"
            onClick={startNewChat}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--worship-navy)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a2a4a]"
          >
            <Plus className="h-4 w-4" /> New conversation
          </button>
        </header>

        <div className="grid min-h-[560px] flex-1 overflow-hidden rounded-2xl border border-[var(--worship-border)] bg-[var(--worship-white)] shadow-[0_10px_35px_rgba(31,42,68,0.06)] lg:grid-cols-[264px_minmax(0,1fr)]">
          <aside className="flex max-h-[260px] flex-col border-b border-[var(--worship-border)] bg-[#f7f2e9] lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--worship-slate)]">Conversations</h2>
              <span data-testid="text-conversation-count" className="rounded-full bg-white px-2 py-0.5 text-xs text-[var(--worship-muted-warm)]">{conversations.length}</span>
            </div>
            {conversationsQuery.isLoading ? (
              <div data-testid="status-conversations-loading" aria-label="Loading conversations" className="space-y-2 px-3">
                {[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-[var(--worship-sand)]/60" />)}
              </div>
            ) : conversationsQuery.isError ? (
              <div role="alert" data-testid="status-conversations-error" className="mx-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                {errorText(conversationsQuery.error, 'Saved conversations could not be loaded.')}
                <button type="button" data-testid="button-retry-conversations" onClick={() => void conversationsQuery.refetch()} className="mt-2 block font-semibold underline">Try again</button>
              </div>
            ) : conversations.length === 0 ? (
              <p data-testid="text-conversations-empty" className="px-4 py-3 text-xs leading-5 text-[var(--worship-muted-slate)]">Your saved conversations will appear here.</p>
            ) : (
              <ul data-testid="list-conversations" className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
                {conversations.map((conversation) => {
                  const selected = activeId === conversation.id;
                  return (
                    <li key={conversation.id} data-testid={`item-conversation-${conversation.id}`}>
                      <div className={`group flex items-center gap-1 rounded-lg ${selected ? 'bg-white shadow-sm ring-1 ring-[var(--worship-border)]' : 'hover:bg-white/70'}`}>
                        <button type="button" data-testid={`button-select-conversation-${conversation.id}`} onClick={() => selectConversation(conversation.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                          <span className={`block truncate text-sm ${selected ? 'font-semibold text-[var(--worship-navy)]' : 'font-medium text-[var(--worship-charcoal)]'}`}>{conversation.title || 'Untitled conversation'}</span>
                          <span className="mt-0.5 block text-[11px] text-[var(--worship-muted-slate)]">{formatDate(conversation.updatedAt)}</span>
                        </button>
                        <button type="button" data-testid={`button-delete-conversation-${conversation.id}`} onClick={() => setDeleteTarget(conversation)} aria-label={`Delete ${conversation.title || 'conversation'}`} className="mr-1 rounded-md p-2 text-[var(--worship-muted-slate)] opacity-60 hover:bg-red-50 hover:text-red-700 md:opacity-0 md:group-hover:opacity-100">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div data-testid="panel-profile-context" className="border-t border-[var(--worship-border)] bg-[#f1e8d9] p-4">
              <div className="mb-2 flex items-center gap-2 text-[var(--worship-navy)]">
                {profileReady ? <Check className="h-4 w-4 text-[var(--worship-success)]" /> : <CircleHelp className="h-4 w-4 text-[var(--worship-muted-warm)]" />}
                <span className="text-xs font-bold">Church context</span>
              </div>
              {meQuery.isLoading ? (
                <div className="h-8 animate-pulse rounded bg-white/70" />
              ) : meQuery.isError ? (
                <div role="alert" data-testid="status-profile-error" className="text-xs leading-5 text-red-800">
                  {errorText(meQuery.error, 'Profile context could not be checked.')}
                  <button type="button" data-testid="button-retry-profile" onClick={() => void meQuery.refetch()} className="ml-1 font-semibold underline">Retry</button>
                </div>
              ) : profileReady ? (
                <>
                  <p data-testid="text-profile-context" className="text-xs font-semibold leading-5 text-[var(--worship-navy)]">{profile?.churchName}</p>
                  <p data-testid="text-profile-context-description" className="mt-1 text-[11px] leading-4 text-[var(--worship-slate)]">
                    Guidance draws on your church profile{profileContext.length ? `, including ${profileContext.join(', ')}` : ''}.
                  </p>
                </>
              ) : (
                <>
                  <p data-testid="text-profile-incomplete" className="text-xs leading-5 text-[var(--worship-slate)]">Add your church and leader details to give guidance a useful foundation.</p>
                  <Link href="/church" data-testid="link-complete-profile" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--worship-navy)] underline decoration-[var(--worship-gold)] underline-offset-2">Complete profile <ChevronRight className="h-3 w-3" /></Link>
                </>
              )}
            </div>
          </aside>

          <section className="flex min-h-[530px] min-w-0 flex-col bg-[#fffdf9]">
            <div className="flex items-center justify-between border-b border-[var(--worship-border)] px-5 py-3 md:px-7">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--worship-navy)] text-[var(--worship-pale-gold)]"><MessageCircle className="h-4 w-4" /></div>
                <div>
                  <p data-testid="text-active-conversation-title" className="max-w-[52vw] truncate text-sm font-semibold text-[var(--worship-navy)]">{activeId ? detailQuery.data?.title || conversations.find((item) => item.id === activeId)?.title || 'Conversation' : 'A new conversation'}</p>
                  <p className="text-[11px] text-[var(--worship-muted-slate)]">Private pastoral reflection</p>
                </div>
              </div>
              <span className="hidden items-center gap-1.5 text-[11px] text-[var(--worship-muted-warm)] sm:flex"><ShieldCheck className="h-3.5 w-3.5" /> Grounded in your context</span>
            </div>

            <div data-testid="transcript" aria-live="polite" className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
              {activeId === null ? (
                <div data-testid="empty-new-chat" className="mx-auto flex min-h-[330px] max-w-xl flex-col items-center justify-center text-center">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--worship-border)] bg-[#f7f2e9] text-[var(--worship-navy)]"><MessageCircle className="h-6 w-6" /></div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.17em] text-[var(--worship-muted-slate)]">Make space to think</p>
                  <h2 className="font-serif text-2xl text-[var(--worship-navy)]">What’s weighing on you?</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-[var(--worship-slate)]">Bring a ministry decision, a difficult conversation, or a question you’re still working through. We’ll take it one step at a time.</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {['Help me think through a ministry decision', 'Prepare for a difficult conversation', 'What questions should I be asking?'].map((suggestion) => (
                      <button key={suggestion} type="button" data-testid={`button-prompt-${suggestion.slice(0, 8).replaceAll(' ', '-').toLowerCase()}`} onClick={() => setDraft(suggestion)} className="rounded-full border border-[var(--worship-border)] bg-white px-3 py-2 text-xs text-[var(--worship-slate)] transition-colors hover:border-[var(--worship-gold)] hover:text-[var(--worship-navy)]">{suggestion}</button>
                    ))}
                  </div>
                </div>
              ) : detailQuery.isLoading ? (
                <div data-testid="status-transcript-loading" className="mx-auto max-w-3xl space-y-5">
                  <div className="ml-auto h-20 w-3/5 animate-pulse rounded-2xl bg-[var(--worship-sand)]/45" />
                  <div className="h-28 w-4/5 animate-pulse rounded-2xl bg-[#f2eadf]" />
                </div>
              ) : detailError ? (
                <div role="alert" data-testid="status-transcript-error" className="mx-auto mt-8 max-w-lg rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
                  <p className="font-semibold">This conversation could not be loaded.</p>
                  <p className="mt-1">{detailError}</p>
                  <button type="button" data-testid="button-retry-transcript" onClick={() => void detailQuery.refetch()} className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold hover:bg-red-100">Try again</button>
                </div>
              ) : (detailQuery.data?.messages.length ?? 0) > 0 || pendingText ? (
                <div data-testid="list-messages" className="mx-auto max-w-3xl space-y-6">
                  {(detailQuery.data?.messages ?? []).map((message) => (
                    <article key={message.id} data-testid={`message-${message.role}-${message.id}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {message.role === 'assistant' && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--worship-navy)] text-[var(--worship-pale-gold)]"><MessageCircle className="h-4 w-4" /></div>}
                      <div className={`max-w-[88%] rounded-2xl px-4 py-3 md:max-w-[78%] ${message.role === 'user' ? 'rounded-br-md bg-[var(--worship-navy)] text-white' : 'rounded-bl-md border border-[var(--worship-border)] bg-white text-[var(--worship-charcoal)]'}`}>
                        <p className={`mb-1 text-[10px] font-bold uppercase tracking-[0.12em] ${message.role === 'user' ? 'text-white/65' : 'text-[var(--worship-muted-slate)]'}`}>{message.role === 'user' ? 'You' : 'Sunday Studio'}</p>
                        <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                      </div>
                      {message.role === 'user' && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--worship-border)] bg-[#f1e8d9] text-xs font-bold text-[var(--worship-navy)]">You</div>}
                    </article>
                  ))}
                  {pendingText && (
                    <article data-testid="status-assistant-pending" className="flex justify-end gap-3">
                      <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[var(--worship-navy)] px-4 py-3 text-white">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/65">You</p>
                        <p className="whitespace-pre-wrap text-sm leading-6">{pendingText}</p>
                      </div>
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--worship-border)] bg-[#f1e8d9] text-xs font-bold text-[var(--worship-navy)]">You</div>
                    </article>
                  )}
                  {isPending && <div data-testid="status-generating" className="flex items-center gap-3 text-xs text-[var(--worship-muted-slate)]"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--worship-navy)] text-[var(--worship-pale-gold)]"><MessageCircle className="h-4 w-4" /></div><span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Considering your question…</span></div>}
                </div>
              ) : (
                <div data-testid="empty-conversation" className="mx-auto flex min-h-[300px] max-w-lg flex-col items-center justify-center text-center">
                  <p className="font-serif text-xl text-[var(--worship-navy)]">A fresh start</p>
                  <p className="mt-2 text-sm text-[var(--worship-slate)]">Write what’s on your mind. Your conversation will be saved here.</p>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>

            <div className="border-t border-[var(--worship-border)] bg-[#faf6ef] px-4 pb-3 pt-3 md:px-7">
              {actionError && (
                <div role="alert" data-testid="status-send-error" className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1"><span>{actionError}</span>{retryText && <button type="button" data-testid="button-retry-send" onClick={() => void send(retryText)} disabled={isPending} className="ml-2 font-bold underline disabled:opacity-50">Retry</button>}</div>
                  <button type="button" data-testid="button-dismiss-error" aria-label="Dismiss error" onClick={() => setActionError('')} className="rounded p-0.5 hover:bg-red-100"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
              <form onSubmit={handleSubmit} data-testid="form-send-message" className="flex items-end gap-2 rounded-xl border border-[var(--worship-border)] bg-white p-2 shadow-sm focus-within:border-[var(--worship-gold)] focus-within:ring-2 focus-within:ring-[var(--worship-gold)]/15">
                <label className="sr-only" htmlFor="assistant-message">Your message</label>
                <textarea id="assistant-message" data-testid="input-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); } }} maxLength={8000} rows={2} placeholder="Share what you’re working through…" className="max-h-36 min-h-[48px] flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-5 text-[var(--worship-charcoal)] outline-none placeholder:text-[var(--worship-muted-slate)]" disabled={isPending} />
                <button type="submit" data-testid="button-send-message" disabled={!draft.trim() || isPending} aria-label={isPending ? 'Sending message' : 'Send message'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--worship-navy)] text-white transition-colors hover:bg-[#1a2a4a] disabled:cursor-not-allowed disabled:opacity-40">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
                </button>
              </form>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[10px] leading-4 text-[var(--worship-muted-slate)]">
                <span>Enter to send · Shift + Enter for a new line · {draft.length}/8000</span>
                <span data-testid="text-support-boundaries">A reflective aid, not divine authority or professional care.</span>
              </div>
              <details data-testid="details-support-boundaries" className="mt-1">
                <summary className="cursor-pointer text-[10px] font-medium text-[var(--worship-slate)] underline decoration-[var(--worship-border)] underline-offset-2">Important boundaries</summary>
                <p className="mt-1 max-w-3xl text-[11px] leading-4 text-[var(--worship-muted-warm)]">This assistant is not divine authority and is not a substitute for emergency, medical, legal, or mental-health professionals. For immediate danger, contact local emergency services or a trusted person who can help now.</p>
              </details>
            </div>
          </section>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--worship-navy)]/45 p-4" data-testid="dialog-delete-conversation">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" className="w-full max-w-sm rounded-2xl border border-[var(--worship-border)] bg-[var(--worship-cream)] p-6 shadow-xl">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-800"><Trash2 className="h-5 w-5" /></div>
            <h2 id="delete-dialog-title" className="font-serif text-xl text-[var(--worship-navy)]">Delete this conversation?</h2>
            <p className="mt-2 text-sm leading-5 text-[var(--worship-slate)]">“{deleteTarget.title || 'Untitled conversation'}” and its messages will be removed permanently.</p>
            {deleteConversation.isError && <p role="alert" data-testid="status-delete-error" className="mt-3 text-xs text-red-800">{errorText(deleteConversation.error, 'The conversation could not be deleted.')}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" data-testid="button-cancel-delete" onClick={() => setDeleteTarget(null)} disabled={deleteConversation.isPending} className="rounded-lg border border-[var(--worship-border)] px-4 py-2 text-sm font-medium text-[var(--worship-slate)] hover:bg-white disabled:opacity-50">Keep it</button>
              <button type="button" data-testid="button-confirm-delete" onClick={() => void confirmDelete()} disabled={deleteConversation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 disabled:opacity-50">{deleteConversation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Delete</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}