import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BookmarkPlus,
  BookOpen,
  Check,
  Copy,
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
  useListSermonResources,
  useListScholarlySources,
  useLookupBibleReferences,
  type CreateSermonResourceBody,
  type ReferenceBundle,
  type LexicalReferenceHit,
  type SelectedWordStudy,
  type TranslationReferenceHit,
  type CrossReferenceHit,
} from '@workspace/api-client-react';
import { AppLayout } from '../components/layout/AppLayout';
import {
  crossReferenceLookupResource,
  bibleLookupResourceKey,
  lexicalLookupResource,
  selectedWordLookupResource,
  readBibleToolsQuery,
  translationLookupResource,
  type BibleToolsLookupMode,
} from '../lib/bibleTools';
import { toast } from 'sonner';

type LookupMode = BibleToolsLookupMode;

function splitTerms(value: string): string[] {
  return value.split(/[,;\n]/).map((term) => term.trim()).filter(Boolean);
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard access is unavailable.');
}

function likelyPassage(value: string): boolean {
  return /\d+\s*(?::\s*\d+(?:\s*[-–]\s*\d+)?)?/.test(value);
}

function selectableVerseText(
  hit: TranslationReferenceHit,
  onSelectWord?: (tokenIndex: number, tokenText: string) => void,
): React.ReactNode {
  if (!hit.wordAlignmentAvailable || !onSelectWord) return hit.text;
  const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;
  for (const match of hit.text.matchAll(wordPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push(hit.text.slice(cursor, start));
    const tokenText = match[0];
    const currentTokenIndex = tokenIndex;
    parts.push(
      <button
        key={`${hit.reference}-${currentTokenIndex}-${start}`}
        type="button"
        onClick={() => onSelectWord(currentTokenIndex, tokenText)}
        className="cursor-pointer rounded-sm border-b border-dotted border-[var(--worship-gold)]/60 px-0.5 underline decoration-transparent underline-offset-4 transition-colors hover:bg-[var(--worship-gold)]/15 hover:decoration-[var(--worship-gold)] focus:bg-[var(--worship-gold)]/15 focus:decoration-[var(--worship-gold)] focus:outline-none"
        title={`Study “${tokenText}”`}
        aria-label={`Study word ${tokenText} in ${hit.reference}`}
      >
        {tokenText}
      </button>,
    );
    cursor = start + tokenText.length;
    tokenIndex += 1;
  }
  if (cursor < hit.text.length) parts.push(hit.text.slice(cursor));
  return parts;
}

function SourceMeta({
  title,
  author,
  attribution,
  sourceUrl,
  onSave,
  saved,
  saving,
  onCopy,
  copied,
}: {
  title: string;
  author: string;
  attribution: string;
  sourceUrl: string;
  onSave?: () => void;
  saved?: boolean;
  saving?: boolean;
  onCopy?: () => void;
  copied?: boolean;
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
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 font-medium text-[var(--worship-navy)]"
            aria-label={copied ? 'Copied excerpt' : 'Copy excerpt'}
          >
            <Copy className="h-3 w-3" />
            {copied ? 'Copied' : 'Copy excerpt'}
          </button>
        )}
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
  onCopy,
  copied,
  onSelectWord,
}: {
  hit: TranslationReferenceHit;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
  onCopy: () => void;
  copied: boolean;
  onSelectWord?: (tokenIndex: number, tokenText: string) => void;
}) {
  return (
    <article className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--worship-border)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold text-[var(--worship-navy)]">{hit.reference}</h4>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--worship-gold)]">
            public-domain reference text
          </span>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
              hit.wordAlignmentAvailable
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-[var(--worship-cream)] text-[var(--worship-slate)]'
            }`}
          >
            {hit.wordAlignmentAvailable ? 'Word study available' : 'Passage text only'}
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--worship-charcoal)]">
        {selectableVerseText(hit, onSelectWord)}
      </p>
      {hit.wordAlignmentAvailable && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--worship-cream)] px-2.5 py-1 text-[11px] font-medium text-[var(--worship-slate)]">
          <Sparkles className="h-3 w-3 text-[var(--worship-gold)]" />
          Words with a dotted underline can be selected for verified original-language study.
        </p>
      )}
      {!hit.wordAlignmentAvailable && (
        <p className="mt-2 inline-flex rounded-full bg-[var(--worship-cream)] px-2.5 py-1 text-[11px] text-[var(--worship-slate)]">
          Word selection is not available for this edition. Use the Word Lookup tab to study a term manually.
        </p>
      )}
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
        onCopy={onCopy}
        copied={copied}
      />
    </article>
  );
}

function SelectedWordStudyCard({
  study,
  onSave,
  savedKeys,
  onCopy,
  copiedKey,
  onLookupOccurrence,
  onManualLookup,
  saving,
}: {
  study: SelectedWordStudy;
  onSave: (key: string, payload: CreateSermonResourceBody) => void;
  savedKeys: Set<string>;
  onCopy: (key: string, value: string) => void;
  copiedKey: string | null;
  onLookupOccurrence: (reference: string) => void;
  onManualLookup: (term: string) => void;
  saving: boolean;
}) {
  return (
    <section
      aria-labelledby="selected-word-study"
      className="rounded-xl border bg-[var(--worship-cream)]/60 p-4 md:p-5"
      style={{ borderColor: 'var(--worship-gold)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--worship-gold)]">Selected word study</p>
          <h3 id="selected-word-study" className="mt-1 font-serif text-xl text-[var(--worship-navy)]">
            “{study.tokenText}” in {study.reference}
          </h3>
          <p className="mt-1 text-xs text-[var(--worship-slate)]">
            Exact displayed token · position {study.tokenIndex + 1}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
          study.status === 'verified'
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-amber-100 text-amber-900'
        }`}>
          {study.status === 'verified' ? 'Verified alignment' : 'Alignment unavailable'}
        </span>
      </div>

      {study.status === 'unavailable' || study.candidates.length === 0 ? (
        <div className="mt-4 rounded-lg border bg-white p-3 text-sm text-[var(--worship-charcoal)]" style={{ borderColor: 'var(--worship-border)' }}>
          <p>{study.message ?? 'No verified original-language entry is available for this word.'}</p>
          <button
            type="button"
            onClick={() => onManualLookup(study.tokenText)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--worship-gold)] hover:underline"
          >
            Use manual Word Lookup <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {study.candidates.length > 1 && (
            <p className="text-xs text-[var(--worship-slate)]">
              This translated word has multiple verified candidates in the selected verse. Review each entry instead of assuming a one-to-one match.
            </p>
          )}
          {study.candidates.map((candidate) => {
            const payload = selectedWordLookupResource(study, candidate);
            const key = bibleLookupResourceKey(payload);
            const copyValue = [
              `Selected word: ${study.tokenText} (${study.reference})`,
              `Original-language word: ${candidate.originalWord || 'Unavailable'}`,
              `Language: ${candidate.language}`,
              candidate.transliteration ? `Transliteration: ${candidate.transliteration}` : '',
              candidate.strongsNumber ? `Strong's identifier: ${candidate.strongsNumber}` : '',
              `Definition: ${candidate.definition}`,
              `Exact occurrence: ${candidate.selectedVerse}`,
              candidate.alsoFoundIn.length > 0
                ? `Also found in: ${candidate.alsoFoundIn.join(', ')}`
                : 'Also found in: No other bounded verified occurrences.',
            ].filter(Boolean).join('\n');
            return (
              <article key={`${candidate.sourceId}-${candidate.key}`} className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--worship-border)' }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">Original-language candidate</p>
                    <h4 className="mt-1 font-serif text-xl text-[var(--worship-navy)]">{candidate.originalWord || 'Original word unavailable'}</h4>
                    <p className="mt-0.5 text-sm text-[var(--worship-charcoal)]">{candidate.term}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded bg-[var(--worship-cream)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--worship-navy)]">{candidate.language}</span>
                    {candidate.strongsNumber && (
                      <span className="rounded bg-[var(--worship-navy)]/10 px-2 py-1 text-[10px] font-bold text-[var(--worship-navy)]">{candidate.strongsNumber}</span>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 border-t pt-3 text-sm sm:grid-cols-2" style={{ borderColor: 'var(--worship-border)' }}>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">Transliteration</dt>
                    <dd className="mt-0.5 italic text-[var(--worship-charcoal)]">{candidate.transliteration || 'Not provided by this source'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">Selected verse</dt>
                    <dd className="mt-0.5 font-medium text-[var(--worship-charcoal)]">{candidate.selectedVerse}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">Definition</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--worship-charcoal)]">{candidate.definition}</p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">Also found in</p>
                {candidate.alsoFoundIn.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {candidate.alsoFoundIn.map((reference) => (
                      <button
                        key={reference}
                        type="button"
                        onClick={() => onLookupOccurrence(reference)}
                        className="rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--worship-navy)] hover:bg-[var(--worship-cream)]"
                        style={{ borderColor: 'var(--worship-border)' }}
                      >
                        {reference} <ArrowRight className="inline h-3 w-3" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs italic text-[var(--worship-slate)]">No other bounded verified occurrences.</p>
                )}
                <SourceMeta
                  title={candidate.sourceTitle}
                  author={candidate.sourceAuthor}
                  attribution={candidate.attribution}
                  sourceUrl={candidate.sourceUrl}
                  onSave={() => onSave(key, payload)}
                  saved={savedKeys.has(key)}
                  saving={saving}
                  onCopy={() => onCopy(key, copyValue)}
                  copied={copiedKey === key}
                />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CrossReferenceResult({
  hit,
  onSave,
  saved,
  saving,
  onCopy,
  copied,
  onLookupPassage,
}: {
  hit: CrossReferenceHit;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
  onCopy: () => void;
  copied: boolean;
  onLookupPassage: (passage: string) => void;
}) {
  return (
    <article className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--worship-border)' }}>
      <h4 className="font-semibold text-[var(--worship-navy)]">{hit.sourceReference}</h4>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">
        Related passages
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {hit.targets.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => onLookupPassage(target)}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--worship-navy)] hover:bg-[var(--worship-cream)]"
            style={{ borderColor: 'var(--worship-border)' }}
            aria-label={`Look up ${target}`}
          >
            {target}
            <ArrowRight className="h-3 w-3" />
          </button>
        ))}
      </div>
      {hit.note && <p className="mt-2 text-xs italic text-[var(--worship-slate)]">{hit.note}</p>}
      <SourceMeta
        title={hit.sourceTitle}
        author={hit.sourceAuthor}
        attribution={hit.attribution}
        sourceUrl={hit.sourceUrl}
        onSave={onSave}
        saved={saved}
        saving={saving}
        onCopy={onCopy}
        copied={copied}
      />
    </article>
  );
}

function LexicalResult({
  hit,
  onSave,
  saved,
  saving,
  onCopy,
  copied,
  onFocusWord,
}: {
  hit: LexicalReferenceHit;
  onSave: () => void;
  saved: boolean;
  saving: boolean;
  onCopy: () => void;
  copied: boolean;
  onFocusWord: (term: string) => void;
}) {
  return (
    <article className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--worship-border)' }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-[var(--worship-navy)]">{hit.term}</h4>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">
            Original-language word
          </p>
          <p className="mt-0.5 break-words font-serif text-lg text-[var(--worship-charcoal)]">
            {hit.originalWord || 'Original word unavailable'}
          </p>
        </div>
        <div className="flex max-w-full flex-wrap justify-end gap-1.5">
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
      <dl className="mt-3 grid gap-2 border-t pt-3 text-sm sm:grid-cols-2" style={{ borderColor: 'var(--worship-border)' }}>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">Language</dt>
          <dd className="mt-0.5 text-[var(--worship-charcoal)]">{hit.language}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">Transliteration</dt>
          <dd className="mt-0.5 break-words italic text-[var(--worship-charcoal)]">
            {hit.transliteration || 'Not provided by this source'}
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">Definition</p>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--worship-charcoal)]">{hit.definition}</p>
      </div>
      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--worship-slate)]">Found in</p>
        {hit.references.length > 0 ? (
          <p className="mt-1 break-words text-xs leading-relaxed text-[var(--worship-charcoal)]">{hit.references.join(', ')}</p>
        ) : (
          <p className="mt-1 text-xs italic text-[var(--worship-slate)]">
            Verified occurrences are unavailable for this entry.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onFocusWord(hit.term)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--worship-gold)] hover:underline"
      >
        Study this word <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <SourceMeta
        title={hit.sourceTitle}
        author={hit.sourceAuthor}
        attribution={hit.attribution}
        sourceUrl={hit.sourceUrl}
        onSave={onSave}
        saved={saved}
        saving={saving}
        onCopy={onCopy}
        copied={copied}
      />
    </article>
  );
}

function Results({
  results,
  selectedStudy,
  studyLabel,
  passage,
  savedKeys,
  onSave,
  onCopy,
  copiedKey,
  onLookupPassage,
  onFocusWord,
  onSelectWord,
  onLookupOccurrence,
  saving,
}: {
  results: ReferenceBundle;
  selectedStudy: SelectedWordStudy | null;
  studyLabel: string;
  passage: string;
  savedKeys: Set<string>;
  onSave: (key: string, payload: CreateSermonResourceBody) => void;
  onCopy: (key: string, value: string) => void;
  copiedKey: string | null;
  onLookupPassage: (passage: string) => void;
  onFocusWord: (term: string) => void;
  onSelectWord: (hit: TranslationReferenceHit, tokenIndex: number, tokenText: string) => void;
  onLookupOccurrence: (reference: string) => void;
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

  const sourceTitles = Array.from(
    new Set([
      ...results.translations.map((hit) => hit.sourceTitle),
      ...results.crossReferences.map((hit) => hit.sourceTitle),
      ...results.lexicalEntries.map((hit) => hit.sourceTitle),
    ]),
  );
  const prioritizedTranslations = [
    ...results.translations.filter((hit) => hit.wordAlignmentAvailable),
    ...results.translations.filter((hit) => !hit.wordAlignmentAvailable),
  ];

  return (
    <div className="space-y-7">
      <section className="rounded-xl border bg-[var(--worship-cream)]/60 p-4" style={{ borderColor: 'var(--worship-border)' }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--worship-gold)]">Study focus</p>
            <h3 className="mt-1 font-serif text-xl text-[var(--worship-navy)]">{studyLabel}</h3>
            <p className="mt-1 text-xs text-[var(--worship-slate)]">
              Start with the passage text, then follow related passages or explore a word in context.
            </p>
          </div>
          {passage && (
            <Link
              href={`/sermons/new?passage=${encodeURIComponent(passage)}`}
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--worship-gold)] hover:underline"
            >
              Open in Sermon Builder <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        <p className="mt-3 text-[11px] text-[var(--worship-slate)]">
          Sources contributing to this lookup: <span className="font-medium text-[var(--worship-navy)]">{sourceTitles.join(' · ')}</span>
        </p>
      </section>
      {(results.selectedWordStudy ?? selectedStudy) && (
        <SelectedWordStudyCard
          study={results.selectedWordStudy ?? selectedStudy!}
          onSave={onSave}
          savedKeys={savedKeys}
          onCopy={onCopy}
          copiedKey={copiedKey}
          onLookupOccurrence={onLookupOccurrence}
          onManualLookup={onFocusWord}
          saving={saving}
        />
      )}
      <ResultGroup title="Passage text" count={results.translations.length}>
        {prioritizedTranslations.map((hit) => {
          const payload = translationLookupResource(hit);
          const key = bibleLookupResourceKey(payload);
          return (
            <TranslationResult
              key={`${hit.sourceId}-${hit.reference}`}
              hit={hit}
              onSave={() => onSave(key, payload)}
              saved={savedKeys.has(key)}
              saving={saving}
              onCopy={() => onCopy(key, `${hit.reference}\n${hit.text}`)}
              copied={copiedKey === key}
              onSelectWord={(tokenIndex, tokenText) => onSelectWord(hit, tokenIndex, tokenText)}
            />
          );
        })}
      </ResultGroup>
      <ResultGroup title="Cross-references" count={results.crossReferences.length}>
        {results.crossReferences.map((hit, index) => {
          const payload = crossReferenceLookupResource(hit);
          const key = bibleLookupResourceKey(payload);
          return (
            <CrossReferenceResult
              key={`${hit.sourceId}-${hit.sourceReference}-${index}`}
              hit={hit}
              onSave={() => onSave(key, payload)}
              saved={savedKeys.has(key)}
              saving={saving}
              onCopy={() =>
                onCopy(
                  key,
                  `${hit.sourceReference}: ${hit.targets.join(', ')}${hit.note ? `\n${hit.note}` : ''}`,
                )
              }
              copied={copiedKey === key}
              onLookupPassage={onLookupPassage}
            />
          );
        })}
      </ResultGroup>
      <ResultGroup title="Dictionary / lexicon" count={results.lexicalEntries.length}>
        {results.lexicalEntries.map((hit) => {
          const payload = lexicalLookupResource(hit, passage);
          const key = bibleLookupResourceKey(payload);
          return (
            <LexicalResult
              key={`${hit.sourceId}-${hit.key}`}
              hit={hit}
              onSave={() => onSave(key, payload)}
              saved={savedKeys.has(key)}
              saving={saving}
              onCopy={() =>
                onCopy(
                  key,
                  `${hit.term}${hit.strongsNumber ? ` (${hit.strongsNumber})` : ''}\n${hit.definition}\n${
                    hit.references.length > 0
                      ? `Found in: ${hit.references.join(', ')}`
                      : 'Verified occurrences are unavailable for this entry.'
                  }`,
                )
              }
              copied={copiedKey === key}
              onFocusWord={onFocusWord}
            />
          );
        })}
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
  const [selectedStudy, setSelectedStudy] = useState<SelectedWordStudy | null>(null);
  const [validationError, setValidationError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [locallySavedKeys, setLocallySavedKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const lookup = useLookupBibleReferences();
  const createResource = useCreateSermonResource();
  const resources = useListSermonResources();
  const qc = useQueryClient();
  const sources = useListScholarlySources();

  const savedKeys = useMemo(() => {
    const keys = new Set(locallySavedKeys);
    for (const resource of resources.data ?? []) {
      if (!['bible-text', 'cross-reference', 'lexicon'].includes(resource.resourceType)) {
        continue;
      }
      keys.add(bibleLookupResourceKey(resource));
    }
    return keys;
  }, [locallySavedKeys, resources.data]);

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
    setSelectedStudy(null);

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

  const lookupPassage = (nextPassage: string, preserveStudy = false) => {
    const value = nextPassage.trim();
    if (!value) return;
    setMode('verse');
    setPassage(value);
    setTerms('');
    setTerm('');
    setValidationError('');
    setRequestError('');
    setResults(null);
    if (!preserveStudy) setSelectedStudy(null);
    setCopiedKey(null);
    lookup.mutate(
      { data: { passage: value, terms: [] } },
      {
        onSuccess: setResults,
        onError: () => setRequestError('The lookup could not be completed. Please try again.'),
      },
    );
  };

  const focusWord = (value: string) => {
    const nextTerm = value.trim();
    if (!nextTerm) return;
    const contextPassage = passage.trim();
    setMode('word');
    setTerm(nextTerm);
    setValidationError('');
    setRequestError('');
    setResults(null);
    setSelectedStudy(null);
    setCopiedKey(null);
    lookup.mutate(
      {
        data: contextPassage
          ? { passage: contextPassage, terms: [nextTerm] }
          : { terms: [nextTerm] },
      },
      {
        onSuccess: setResults,
        onError: () => setRequestError('The lookup could not be completed. Please try again.'),
      },
    );
  };

  const selectWord = (hit: TranslationReferenceHit, tokenIndex: number, tokenText: string) => {
    const contextPassage = passage.trim() || hit.reference;
    setMode('verse');
    setPassage(contextPassage);
    setTerm('');
    setValidationError('');
    setRequestError('');
    setResults(null);
    setSelectedStudy(null);
    setCopiedKey(null);
    lookup.mutate(
      {
        data: {
          passage: contextPassage,
          terms: splitTerms(terms),
          selectedWord: {
            translationSourceId: hit.sourceId,
            reference: hit.reference,
            tokenIndex,
            tokenText,
            passageContext: contextPassage,
          },
        },
      },
      {
        onSuccess: (data) => {
          setResults(data);
          setSelectedStudy(data.selectedWordStudy ?? null);
        },
        onError: () => setRequestError('The selected word study could not be completed. Please try again.'),
      },
    );
  };

  const copyResult = (key: string, value: string) => {
    void copyToClipboard(value)
      .then(() => {
        setCopiedKey(key);
        toast.success('Copied to clipboard');
      })
      .catch(() => toast.error('Could not copy this result. Please try again.'));
  };

  const switchMode = (next: LookupMode) => {
    setMode(next);
    setResults(null);
    setValidationError('');
    setRequestError('');
    setCopiedKey(null);
    setSelectedStudy(null);
  };

  const reset = () => {
    setPassage('');
    setTerms('');
    setTerm('');
    setResults(null);
    setSelectedStudy(null);
    setValidationError('');
    setRequestError('');
    setCopiedKey(null);
  };

  const saveLookup = (key: string, payload: CreateSermonResourceBody) => {
    if (savedKeys.has(key)) return;
    createResource.mutate(
      { data: payload },
      {
        onSuccess: () => {
          setLocallySavedKeys((current) => new Set(current).add(key));
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
            Look up passage text, cross-references, and word-study entries from the enabled public-domain reference catalog. In supported passages, select a word with a dotted underline to study its verified original-language alignment.
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
                  selectedStudy={selectedStudy}
                  studyLabel={
                    mode === 'verse'
                      ? passage.trim()
                      : `${term.trim()}${passage.trim() ? ` in ${passage.trim()}` : ''}`
                  }
                  passage={passage.trim()}
                  savedKeys={savedKeys}
                  onSave={saveLookup}
                  onCopy={copyResult}
                  copiedKey={copiedKey}
                  onLookupPassage={lookupPassage}
                  onFocusWord={focusWord}
                  onSelectWord={selectWord}
                  onLookupOccurrence={(reference) => lookupPassage(reference, true)}
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