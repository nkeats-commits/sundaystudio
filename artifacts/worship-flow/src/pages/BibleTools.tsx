import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BookmarkPlus,
  BookOpen,
  Check,
  ExternalLink,
  Library,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  getListSermonResourcesQueryKey,
  useCreateSermonResource,
  useListScholarlySources,
  useLookupBibleReferences,
  type CreateSermonResourceBody,
  type ReferenceBundle,
  type LexicalReferenceHit,
  type TranslationReferenceHit,
  type CrossReferenceHit,
} from '@workspace/api-client-react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  crossReferenceLookupResource,
  lexicalLookupResource,
  readBibleToolsQuery,
  translationLookupResource,
  type BibleToolsLookupMode,
} from '../lib/bibleTools';
import { toast } from 'sonner';

type LookupMode = BibleToolsLookupMode;

function splitTerms(value: string): string[] {
  return value.split(/[,;\n]/).map((term) => term.trim()).filter(Boolean);
}

function likelyPassage(value: string): boolean {
  return /\d+\s*(?::\s*\d+(?:\s*[-–]\s*\d+)?)?/.test(value);
}

function SourceMeta({
  title,
  author,
  attribution,
  sourceUrl,
  onSave,
  saved,
  saving,
}: {
  title: string;
  author: string;
  attribution: string;
  sourceUrl: string;
  onSave?: () => void;
  saved?: boolean;
  saving?: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--worship-slate)]">
      <span className="font-medium text-[var(--worship-navy)]">{title}</span>
      <span aria-hidden="true">·</span>
      <span>{author}</span>
      <span aria-hidden="true">·</span>
      <span>{attribution}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[var(--worship-gold)] underline"
        >
          Provenance <ExternalLink className="h-3 w-3" />
        </a>
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={saved || saving}
            className="inline-flex items-center gap-1 font-medium text-[var(--worship-navy)] disabled:cursor-default disabled:opacity-70"
          >
            {saved ? <Check className="h-3 w-3" /> : <BookmarkPlus className="h-3 w-3" />}
            {saved ? 'Saved to Sermon Resources' : saving ? 'Saving…' : 'Save to Sermon Resources'}
          </button>
        )}
      </div>
    </div>
  );
}

function ResultGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section aria-labelledby={`bible-tools-${title.replace(/\W+/g, '-').toLowerCase()}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3
          id={`bible-tools-${title.replace(/\W+/g, '-').toLowerCase()}`}
          className="font-serif text-lg text-[var(--worship-navy)]"
        >
          {title}
        </h3>
        <span className="rounded-full bg-[var(--worship-cream)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">
          {count} {count === 1 ? 'result' : 'results'}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function TranslationResult({
  hit,
  onSave,
  saved,
  saving,
}: {
  hit: TranslationReferenceHit;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
}) {
  return (
    <article className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--worship-border)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold text-[var(--worship-navy)]">{hit.reference}</h4>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--worship-gold)]">
          public-domain reference text
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--worship-charcoal)]">{hit.text}</p>
      <p className="mt-2 text-[11px] italic text-[var(--worship-slate)]">
        This is reference text from an enabled public-domain edition, not your selected translation.
      </p>
      <SourceMeta
        title={hit.sourceTitle}
        author={hit.sourceAuthor}
        attribution={hit.attribution}
        sourceUrl={hit.sourceUrl}
        onSave={onSave}
        saved={saved}
        saving={saving}
      />
    </article>
  );
}

function CrossReferenceResult({
  hit,
  onSave,
  saved,
  saving,
}: {
  hit: CrossReferenceHit;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
}) {
  return (
    <article className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--worship-border)' }}>
      <h4 className="font-semibold text-[var(--worship-navy)]">{hit.sourceReference}</h4>
      <p className="mt-1 text-sm leading-relaxed text-[var(--worship-charcoal)]">
        {hit.targets.join(', ')}
      </p>
      {hit.note && <p className="mt-2 text-xs italic text-[var(--worship-slate)]">{hit.note}</p>}
      <SourceMeta
        title={hit.sourceTitle}
        author={hit.sourceAuthor}
        attribution={hit.attribution}
        sourceUrl={hit.sourceUrl}
        onSave={onSave}
        saved={saved}
        saving={saving}
      />
    </article>
  );
}

function LexicalResult({
  hit,
  onSave,
  saved,
  saving,
}: {
  hit: LexicalReferenceHit;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
}) {
  return (
    <article className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--worship-border)' }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-[var(--worship-navy)]">{hit.term}</h4>
          <p className="mt-1 font-serif text-base text-[var(--worship-charcoal)]">
            {hit.originalWord}{' '}
            <span className="font-sans text-xs italic text-[var(--worship-slate)]">{hit.transliteration}</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          <span className="rounded bg-[var(--worship-cream)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--worship-navy)]">
            {hit.language}
          </span>
          {hit.strongsNumber && (
            <span className="rounded bg-[var(--worship-navy)]/10 px-2 py-1 text-[10px] font-bold text-[var(--worship-navy)]">
              {hit.strongsNumber}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--worship-charcoal)]">{hit.definition}</p>
      {hit.references.length > 0 && (
        <p className="mt-2 text-xs text-[var(--worship-slate)]">
          Related references: {hit.references.join(', ')}
        </p>
      )}
      <SourceMeta
        title={hit.sourceTitle}
        author={hit.sourceAuthor}
        attribution={hit.attribution}
        sourceUrl={hit.sourceUrl}
        onSave={onSave}
        saved={saved}
        saving={saving}
      />
    </article>
  );
}

function Results({
  results,
  savedKeys,
  onSave,
  saving,
}: {
  results: ReferenceBundle;
  savedKeys: Set<string>;
  onSave: (key: string, payload: CreateSermonResourceBody) => void;
  saving: boolean;
}) {
  const total = results.translations.length + results.crossReferences.length + results.lexicalEntries.length;
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center" style={{ borderColor: 'var(--worship-border)' }}>
        <Search className="mx-auto h-6 w-6 text-[var(--worship-gold)]" />
        <h3 className="mt-2 font-serif text-lg text-[var(--worship-navy)]">No matching reference entries</h3>
        <p className="mx-auto mt-1 max-w-xl text-sm text-[var(--worship-slate)]">
          None of your enabled public-domain collections matched this lookup. Try a different reference or term, or enable more Bible references in Sermon Resources.
        </p>
        <Link href="/resources#bible-references" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--worship-gold)] underline">
          Review enabled sources <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <ResultGroup title="Bible text" count={results.translations.length}>
        {results.translations.map((hit) => (
          <TranslationResult
            key={`${hit.sourceId}-${hit.reference}`}
            hit={hit}
            onSave={() =>
              onSave(
                `translation:${hit.sourceId}:${hit.reference}`,
                translationLookupResource(hit),
              )
            }
            saved={savedKeys.has(`translation:${hit.sourceId}:${hit.reference}`)}
            saving={saving}
          />
        ))}
      </ResultGroup>
      <ResultGroup title="Cross-references" count={results.crossReferences.length}>
        {results.crossReferences.map((hit, index) => (
          <CrossReferenceResult
            key={`${hit.sourceId}-${hit.sourceReference}-${index}`}
            hit={hit}
            onSave={() =>
              onSave(
                `cross-reference:${hit.sourceId}:${hit.sourceReference}:${index}`,
                crossReferenceLookupResource(hit),
              )
            }
            saved={savedKeys.has(`cross-reference:${hit.sourceId}:${hit.sourceReference}:${index}`)}
            saving={saving}
          />
        ))}
      </ResultGroup>
      <ResultGroup title="Dictionary / lexicon" count={results.lexicalEntries.length}>
        {results.lexicalEntries.map((hit) => (
          <LexicalResult
            key={`${hit.sourceId}-${hit.key}`}
            hit={hit}
            onSave={() =>
              onSave(`lexicon:${hit.sourceId}:${hit.key}`, lexicalLookupResource(hit))
            }
            saved={savedKeys.has(`lexicon:${hit.sourceId}:${hit.key}`)}
            saving={saving}
          />
        ))}
      </ResultGroup>
    </div>
  );
}

export default function BibleTools() {
  const [location] = useLocation();
  const initial = useMemo(
    () => readBibleToolsQuery(typeof window === 'undefined' ? '' : window.location.search),
    [],
  );
  const [mode, setMode] = useState<LookupMode>(initial.mode);
  const [passage, setPassage] = useState(initial.passage);
  const [terms, setTerms] = useState('');
  const [term, setTerm] = useState(initial.term);
  const [results, setResults] = useState<ReferenceBundle | null>(null);
  const [validationError, setValidationError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const lookup = useLookupBibleReferences();
  const createResource = useCreateSermonResource();
  const qc = useQueryClient();
  const sources = useListScholarlySources();

  useEffect(() => {
    // Query parameters are intentionally read only on first render. This keeps
    // an in-progress lookup intact if the router updates the location.
    void location;
  }, [location]);

  const enabledReferenceCount = sources.data?.enabledSourceIds.filter((id) =>
    sources.data.sources.find((source) => source.id === id && source.kind !== 'commentary'),
  ).length;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setValidationError('');
    setRequestError('');
    setResults(null);

    if (mode === 'verse') {
      const value = passage.trim();
      if (!value) {
        setValidationError('Enter a Bible passage to look up.');
        return;
      }
      if (!likelyPassage(value)) {
        setValidationError('Enter a passage such as John 3:16 or Psalm 23.');
        return;
      }
      lookup.mutate(
        { data: { passage: value, terms: splitTerms(terms) } },
        {
          onSuccess: setResults,
          onError: () => setRequestError('The lookup could not be completed. Please try again.'),
        },
      );
      return;
    }

    const value = term.trim();
    if (!value) {
      setValidationError("Enter a word, phrase, or Strong's number to look up.");
      return;
    }
    const contextPassage = passage.trim();
    lookup.mutate(
      {
        data: contextPassage
          ? { passage: contextPassage, terms: [value] }
          : { terms: [value] },
      },
      {
        onSuccess: setResults,
        onError: () => setRequestError('The lookup could not be completed. Please try again.'),
      },
    );
  };

  const switchMode = (next: LookupMode) => {
    setMode(next);
    setResults(null);
    setValidationError('');
    setRequestError('');
  };

  const reset = () => {
    setPassage('');
    setTerms('');
    setTerm('');
    setResults(null);
    setValidationError('');
    setRequestError('');
  };

  const saveLookup = (key: string, payload: CreateSermonResourceBody) => {
    if (savedKeys.has(key)) return;
    createResource.mutate(
      { data: payload },
      {
        onSuccess: () => {
          setSavedKeys((current) => new Set(current).add(key));
          void qc.invalidateQueries({ queryKey: getListSermonResourcesQueryKey() });
          toast.success('Saved to Sermon Resources');
        },
        onError: () => toast.error('Could not save this lookup result. Please try again.'),
      },
    );
  };

  const hasSources = enabledReferenceCount !== undefined && enabledReferenceCount > 0;

  return (
    <AppLayout title="Bible Tools">
      <div className="mx-auto max-w-5xl">
        <div className="mb-7">
          <div className="flex items-center gap-2 text-[var(--worship-gold)]">
            <BookOpen className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Sermon Prep</span>
          </div>
          <h1 className="mt-2 font-serif text-3xl text-[var(--worship-navy)]">Bible Tools</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--worship-slate)]">
            Look up passage text, cross-references, and word-study entries from the enabled public-domain reference catalog.
          </p>
        </div>

        <div className="worship-card !p-0 overflow-hidden">
          <div className="border-b p-5 md:p-6" style={{ borderColor: 'var(--worship-border)' }}>
            <div className="mb-5 grid grid-cols-2 rounded-xl border p-1" style={{ borderColor: 'var(--worship-border)' }}>
              {(['verse', 'word'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => switchMode(option)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                    mode === option
                      ? 'bg-[var(--worship-navy)] text-white'
                      : 'text-[var(--worship-slate)] hover:bg-[var(--worship-cream)]'
                  }`}
                  aria-pressed={mode === option}
                >
                  {option === 'verse' ? 'Verse Lookup' : 'Word Lookup'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} noValidate>
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                {mode === 'verse' ? (
                  <>
                    <div>
                      <label htmlFor="bible-passage" className="mb-1 block text-xs font-semibold text-[var(--worship-slate)]">
                        PASSAGE
                      </label>
                      <input
                        id="bible-passage"
                        value={passage}
                        onChange={(event) => setPassage(event.target.value)}
                        placeholder="John 3:16 or Psalm 23"
                        autoComplete="off"
                        className="w-full rounded-lg border bg-[var(--worship-cream)] px-3 py-2.5 text-sm outline-none focus:border-[var(--worship-gold)]"
                        style={{ borderColor: 'var(--worship-border)' }}
                        aria-invalid={!!validationError}
                      />
                    </div>
                    <div>
                      <label htmlFor="bible-terms" className="mb-1 block text-xs font-semibold text-[var(--worship-slate)]">
                        OPTIONAL WORDS OR STRONG&apos;S KEYS
                      </label>
                      <input
                        id="bible-terms"
                        value={terms}
                        onChange={(event) => setTerms(event.target.value)}
                        placeholder="love, G26"
                        autoComplete="off"
                        className="w-full rounded-lg border bg-[var(--worship-cream)] px-3 py-2.5 text-sm outline-none focus:border-[var(--worship-gold)]"
                        style={{ borderColor: 'var(--worship-border)' }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label htmlFor="bible-term" className="mb-1 block text-xs font-semibold text-[var(--worship-slate)]">
                        WORD OR STRONG&apos;S NUMBER
                      </label>
                      <input
                        id="bible-term"
                        value={term}
                        onChange={(event) => setTerm(event.target.value)}
                        placeholder="love, G26, or H430"
                        autoComplete="off"
                        className="w-full rounded-lg border bg-[var(--worship-cream)] px-3 py-2.5 text-sm outline-none focus:border-[var(--worship-gold)]"
                        style={{ borderColor: 'var(--worship-border)' }}
                        aria-invalid={!!validationError}
                      />
                    </div>
                    <div>
                      <label htmlFor="bible-context-passage" className="mb-1 block text-xs font-semibold text-[var(--worship-slate)]">
                        OPTIONAL PASSAGE CONTEXT
                      </label>
                      <input
                        id="bible-context-passage"
                        value={passage}
                        onChange={(event) => setPassage(event.target.value)}
                        placeholder="John 3:16"
                        autoComplete="off"
                        className="w-full rounded-lg border bg-[var(--worship-cream)] px-3 py-2.5 text-sm outline-none focus:border-[var(--worship-gold)]"
                        style={{ borderColor: 'var(--worship-border)' }}
                      />
                    </div>
                  </>
                )}
                <button
                  type="submit"
                  disabled={lookup.isPending}
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white worship-btn-primary disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
                >
                  {lookup.isPending ? (
                    <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Looking up…</span>
                  ) : (
                    <span className="inline-flex items-center gap-2"><Search className="h-4 w-4" /> Look up</span>
                  )}
                </button>
              </div>
              {validationError && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{validationError}</p>}
              {requestError && (
                <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                  <span>{requestError}</span>
                  <button type="submit" className="font-semibold underline">Try again</button>
                </div>
              )}
            </form>

            <div className="mt-5 flex flex-col gap-2 rounded-lg border bg-[var(--worship-cream)]/60 p-3 text-xs text-[var(--worship-slate)] sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--worship-border)' }}>
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--worship-gold)]" />
                <span>
                  {sources.isLoading
                    ? 'Checking your enabled Bible reference sources…'
                    : hasSources
                      ? `${enabledReferenceCount} Bible reference source${enabledReferenceCount === 1 ? '' : 's'} enabled for lookup.`
                      : 'No Bible reference sources are enabled yet.'}{' '}
                  Source preferences are managed in Sermon Resources.
                </span>
              </div>
              <Link href="/resources#bible-references" className="inline-flex shrink-0 items-center gap-1 font-medium text-[var(--worship-gold)] underline">
                Manage sources <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="p-5 md:p-6">
            {!results && !lookup.isPending && (
              <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: 'var(--worship-border)' }}>
                <Library className="mx-auto h-7 w-7 text-[var(--worship-gold)]" />
                <h2 className="mt-2 font-serif text-xl text-[var(--worship-navy)]">Ready when you are</h2>
                <p className="mx-auto mt-1 max-w-lg text-sm text-[var(--worship-slate)]">
                  Start with a passage for verse text and cross-references, or switch to Word Lookup for a term-only dictionary search.
                </p>
              </div>
            )}
            {lookup.isPending && (
              <div role="status" aria-live="polite" className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--worship-navy)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--worship-gold)]" /> Searching enabled sources…
                </div>
                <div className="h-16 animate-pulse rounded-lg bg-[var(--worship-cream)]" />
                <div className="h-16 animate-pulse rounded-lg bg-[var(--worship-cream)]" />
              </div>
            )}
            {results && !lookup.isPending && (
              <div>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-xl text-[var(--worship-navy)]">Lookup results</h2>
                    <p className="mt-1 text-xs text-[var(--worship-slate)]">
                      Results are bounded and labeled with the public-domain source that provided them.
                    </p>
                  </div>
                  <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--worship-slate)] hover:text-[var(--worship-navy)]">
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </button>
                </div>
                <Results
                  results={results}
                  savedKeys={savedKeys}
                  onSave={saveLookup}
                  saving={createResource.isPending}
                />
              </div>
            )}
            {lookup.isError && !requestError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                <div className="flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4" /> Lookup unavailable</div>
                <p className="mt-1">Please check your connection and try again.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}