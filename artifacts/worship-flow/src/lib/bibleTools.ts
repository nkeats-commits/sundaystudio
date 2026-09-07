export type BibleToolsLookupMode = 'verse' | 'word';

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