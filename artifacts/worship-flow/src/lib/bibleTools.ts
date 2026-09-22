import type {
  CreateSermonResourceBody,
  CrossReferenceHit,
  LexicalReferenceHit,
  SelectedWordStudy,
  TranslationReferenceHit,
} from '@workspace/api-client-react';

export type BibleToolsLookupMode = 'verse' | 'word';

type BibleLookupResource = Pick<
  CreateSermonResourceBody,
  | 'resourceType'
  | 'title'
  | 'author'
  | 'publisher'
  | 'url'
  | 'excerpt'
  | 'notes'
  | 'relatedPassage'
>;

/**
 * Return a stable identity for a Bible Tools resource.
 *
 * Tags are intentionally excluded because they are editable library metadata,
 * not part of the lookup result itself. The remaining fields preserve the
 * source, provenance, and displayed result content needed to distinguish
 * translation, cross-reference, and lexicon entries.
 */
export function bibleLookupResourceKey(resource: BibleLookupResource): string {
  return JSON.stringify([
    resource.resourceType ?? '',
    resource.title,
    resource.author ?? '',
    resource.publisher ?? '',
    resource.url ?? '',
    resource.excerpt ?? '',
    resource.notes ?? '',
    resource.relatedPassage ?? '',
  ]);
}

export interface BibleToolsQuery {
  mode: BibleToolsLookupMode;
  passage: string;
  term: string;
}

/**
 * Read optional context passed from Sermon Builder without allowing malformed
 * query strings to break the empty-tool state.
 */
export function readBibleToolsQuery(search: string): BibleToolsQuery {
  try {
    // URLSearchParams replaces malformed percent escapes with U+FFFD instead
    // of throwing, so validate the encoding before reading the values.
    decodeURIComponent(search);
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const passage = params.get('passage')?.trim() ?? '';
    const term = params.get('term')?.trim() ?? '';
    return { mode: term ? 'word' : 'verse', passage, term };
  } catch {
    return { mode: 'verse', passage: '', term: '' };
  }
}

/**
 * Map a bounded Bible lookup result into the existing Sermon Resource shape.
 *
 * These saves are intentionally just library rows: they do not set any
 * sermon attachment fields or affect the translation used by generation.
 * The existing fields preserve the source metadata without requiring a
 * schema migration:
 *   - resourceType: lookup type
 *   - publisher: public-domain edition/source title
 *   - notes: source attribution
 *   - url: provenance link
 */
export function translationLookupResource(
  hit: TranslationReferenceHit,
): CreateSermonResourceBody {
  return {
    resourceType: 'bible-text',
    title: hit.reference,
    author: hit.sourceAuthor,
    publisher: hit.sourceTitle,
    url: hit.sourceUrl,
    excerpt: hit.text,
    notes: hit.attribution,
    relatedPassage: hit.reference,
    tags: ['Bible Tools', 'Bible text'],
  };
}

export function crossReferenceLookupResource(
  hit: CrossReferenceHit,
): CreateSermonResourceBody {
  return {
    resourceType: 'cross-reference',
    title: `${hit.sourceReference} cross-references`,
    author: hit.sourceAuthor,
    publisher: hit.sourceTitle,
    url: hit.sourceUrl,
    excerpt: [
      `Related passages: ${hit.targets.join(', ')}`,
      hit.note ? `Note: ${hit.note}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    notes: hit.attribution,
    relatedPassage: hit.sourceReference,
    tags: ['Bible Tools', 'Cross-reference'],
  };
}

export function lexicalLookupResource(
  hit: LexicalReferenceHit,
  contextPassage = '',
): CreateSermonResourceBody {
  const originalLanguage = [
    `Original-language word: ${hit.originalWord || 'Unavailable'}`,
    `Language: ${hit.language}`,
    `Transliteration: ${hit.transliteration || 'Not provided by this source'}`,
    hit.strongsNumber ? `Strong's identifier: ${hit.strongsNumber}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const occurrences = hit.references.length > 0
    ? `Found in: ${hit.references.join(', ')}`
    : 'Found in: Verified occurrences are unavailable for this entry.';
  return {
    resourceType: 'lexicon',
    title: `${hit.term} word study`,
    author: hit.sourceAuthor,
    publisher: hit.sourceTitle,
    url: hit.sourceUrl,
    excerpt: [
      originalLanguage,
      hit.definition,
      occurrences,
    ]
      .filter(Boolean)
      .join('\n\n'),
    notes: hit.attribution,
    relatedPassage: contextPassage.trim() || hit.references.join(', '),
    tags: ['Bible Tools', 'Lexicon'],
  };
}

export function selectedWordLookupResource(
  study: SelectedWordStudy,
  candidate: SelectedWordStudy['candidates'][number],
): CreateSermonResourceBody {
  const selectedContext = [
    `Selected word: ${study.tokenText}`,
    `Passage: ${study.reference}`,
    `Token position: ${study.tokenIndex + 1}`,
    `Exact occurrence: ${candidate.selectedVerse}`,
  ].join('\n');
  const originalLanguage = [
    `Original-language word: ${candidate.originalWord || 'Unavailable'}`,
    `Language: ${candidate.language}`,
    `Transliteration: ${candidate.transliteration || 'Not provided by this source'}`,
    candidate.strongsNumber ? `Strong's identifier: ${candidate.strongsNumber}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const occurrences = candidate.alsoFoundIn.length > 0
    ? `Also found in: ${candidate.alsoFoundIn.join(', ')}`
    : 'Also found in: No other bounded verified occurrences.';
  return {
    resourceType: 'lexicon',
    title: `${study.tokenText} in ${study.reference}`,
    author: candidate.sourceAuthor,
    publisher: candidate.sourceTitle,
    url: candidate.sourceUrl,
    excerpt: [selectedContext, originalLanguage, candidate.definition, occurrences]
      .filter(Boolean)
      .join('\n\n'),
    notes: `${candidate.attribution}\nSelected-word provenance: ${study.translationSourceId} token alignment`,
    relatedPassage: study.reference,
    tags: ['Bible Tools', 'Lexicon', 'Selected word'],
  };
}