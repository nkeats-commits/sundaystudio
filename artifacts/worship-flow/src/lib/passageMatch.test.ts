/**
 * Pin the client-side matcher's contract so it can never silently drift
 * from the server's `parsePassageRef` / `libraryRowMatches` (see
 * artifacts/api-server/src/lib/scholarlyMerge.test.ts for the mirror set).
 *
 * Run with: `pnpm --filter @workspace/worship-flow run test`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  libraryRowMatches,
  parsePassageRef,
  sermonPassagePairs,
} from './passageMatch';

/* -------------------------------------------------------------------------- */
/* parsePassageRef                                                            */
/* -------------------------------------------------------------------------- */

test('parsePassageRef: handles canonical and abbreviated book names', () => {
  assert.deepEqual(parsePassageRef('Romans 8:28'), [{ book: 'romans', chapter: 8 }]);
  assert.deepEqual(parsePassageRef('Rom 8'), [{ book: 'romans', chapter: 8 }]);
  assert.deepEqual(parsePassageRef('Ps 23'), [{ book: 'psalms', chapter: 23 }]);
  assert.deepEqual(parsePassageRef('1 John 4:7-21'), [{ book: '1 john', chapter: 4 }]);
});

test('parsePassageRef: chapter ranges and cross-chapter verse spans', () => {
  assert.deepEqual(parsePassageRef('John 14-15'), [
    { book: 'john', chapter: 14 },
    { book: 'john', chapter: 15 },
  ]);
  assert.deepEqual(parsePassageRef('Romans 8:28-9:3'), [
    { book: 'romans', chapter: 8 },
    { book: 'romans', chapter: 9 },
  ]);
});

test('parsePassageRef: combo references with continuation', () => {
  assert.deepEqual(parsePassageRef('Romans 8:28; 12:1'), [
    { book: 'romans', chapter: 8 },
    { book: 'romans', chapter: 12 },
  ]);
});

test('parsePassageRef: returns [] for unparseable input', () => {
  assert.deepEqual(parsePassageRef('Christmas Eve'), []);
  assert.deepEqual(parsePassageRef(''), []);
  assert.deepEqual(parsePassageRef(null), []);
  assert.deepEqual(parsePassageRef(undefined), []);
});

/* -------------------------------------------------------------------------- */
/* libraryRowMatches                                                          */
/* -------------------------------------------------------------------------- */

test('libraryRowMatches: empty relatedPassage is always relevant', () => {
  const sermon = parsePassageRef('Romans 8:1-11');
  assert.equal(libraryRowMatches('', sermon), true);
  assert.equal(libraryRowMatches('   ', sermon), true);
});

test('libraryRowMatches: unparseable relatedPassage is NOT a wildcard', () => {
  const sermon = parsePassageRef('Romans 8:1-11');
  assert.equal(libraryRowMatches('Christmas Eve', sermon), false);
  assert.equal(libraryRowMatches('topical / grace', sermon), false);
});

test('libraryRowMatches: requires (book, chapter) overlap', () => {
  const sermon = parsePassageRef('Romans 8:1-11');
  assert.equal(libraryRowMatches('Romans 8:28', sermon), true);
  assert.equal(libraryRowMatches('Romans 8', sermon), true);
  assert.equal(libraryRowMatches('Romans 12:1-2', sermon), false);
  assert.equal(libraryRowMatches('Galatians 5:22', sermon), false);
});

test('libraryRowMatches: secondary sermon passages broaden the include set', () => {
  const sermon = sermonPassagePairs('Romans 8:1-11', ['John 3:16']);
  assert.equal(libraryRowMatches('John 3:1-21', sermon), true);
  assert.equal(libraryRowMatches('Romans 8:38-39', sermon), true);
  assert.equal(libraryRowMatches('Acts 2:42', sermon), false);
});

/* -------------------------------------------------------------------------- */
/* sermonPassagePairs                                                         */
/* -------------------------------------------------------------------------- */

test('sermonPassagePairs: dedupes across primary + secondary', () => {
  const pairs = sermonPassagePairs('Romans 8:1-11', ['Romans 8:28', 'John 3:16']);
  assert.deepEqual(pairs, [
    { book: 'romans', chapter: 8 },
    { book: 'john', chapter: 3 },
  ]);
});
