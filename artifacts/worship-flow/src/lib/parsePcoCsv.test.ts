/**
 * Pure-mapper tests for the CSV import flow.
 * Run with: `pnpm --filter @workspace/worship-flow run test`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFormat,
  normalizeDate,
  mapPcoRow,
  mapPcoRows,
  mapGenericRows,
  dedupeByTitle,
  splitNewVsDuplicate,
  normalizeTitleForDedupe,
} from './parsePcoCsv';

test('detectFormat: recognises PCO export by Arrangement 1 Name header', () => {
  assert.equal(
    detectFormat(['Id', 'Title', 'CCLI', 'Arrangement 1 Name', 'Arrangement 1 BPM']),
    'pco',
  );
});

test('detectFormat: falls back to generic when "title" header is present (any casing)', () => {
  assert.equal(detectFormat(['Title', 'Artist', 'BPM']), 'generic');
  assert.equal(detectFormat(['title', 'artist']), 'generic');
  assert.equal(detectFormat(['  TITLE  ', 'Artist']), 'generic');
});

test('detectFormat: returns "unknown" when no usable title-ish column exists', () => {
  assert.equal(detectFormat(['foo', 'bar', 'baz']), 'unknown');
  assert.equal(detectFormat([]), 'unknown');
});

test('detectFormat: rejects "song" / "name" lookalikes — title column is required', () => {
  // Without an explicit `title` column, we refuse to auto-import — too
  // easy to confuse a contact list ("Name, Email") for a song list.
  assert.equal(detectFormat(['Song', 'Tempo']), 'unknown');
  assert.equal(detectFormat(['Name', 'Email']), 'unknown');
  assert.equal(detectFormat(['song name', 'artist']), 'unknown');
});

test('normalizeDate: PCO "May 03, 2026" → ISO date (calendar day, not UTC)', () => {
  // Important: the PCO date string has no timezone, so "May 03, 2026"
  // must round-trip to "2026-05-03" regardless of the user's local
  // timezone. The original implementation used getUTC* and shifted the
  // calendar day in non-UTC zones (e.g. UTC-7 → "2026-05-02").
  assert.equal(normalizeDate('May 03, 2026'), '2026-05-03');
  assert.equal(normalizeDate('March 29, 2026'), '2026-03-29');
  assert.equal(normalizeDate('January 1, 2026'), '2026-01-01');
  assert.equal(normalizeDate('December 31, 2025'), '2025-12-31');
});

test('normalizeDate: already-ISO dates pass through unchanged', () => {
  assert.equal(normalizeDate('2026-05-03'), '2026-05-03');
});

test('normalizeDate: passes through unparseable strings unchanged', () => {
  assert.equal(normalizeDate('soon'), 'soon');
});

test('normalizeDate: handles undefined and empty', () => {
  assert.equal(normalizeDate(undefined), undefined);
  assert.equal(normalizeDate('   '), undefined);
});

test('mapPcoRow: extracts title, BPM, key, themes, CCLI, last scheduled date', () => {
  const row: Record<string, string> = {
    Id: '215638',
    Title: 'Here I Am To Worship',
    CCLI: '3266032',
    Themes: 'Jesus / Life Of Jesus, Light, Thankfulness, Worship',
    Notes: '',
    'Last Scheduled Date': 'March 29, 2026',
    'Song Tag 1': '',
    'Song Tag 2': '',
    'Arrangement 1 Name': 'Catalyst',
    'Arrangement 1 BPM': '',
    'Arrangement 1 Length': '0',
    'Arrangement 1 Notes': '',
    'Arrangement 1 Keys': 'D',
    'Arrangement 1 Chord Chart Key': 'D',
    'Arrangement 2 Name': 'CL // Str Quartet',
    'Arrangement 2 BPM': '82',
    'Arrangement 2 Chord Chart Key': 'G',
  };
  const out = mapPcoRow(row);
  assert.ok(out, 'expected a song');
  assert.equal(out!.title, 'Here I Am To Worship');
  assert.equal(out!.key, 'D'); // Default arrangement = slot 1 (Catalyst)
  assert.equal(out!.ccli, '3266032');
  assert.equal(out!.lastScheduledDate, '2026-03-29');
  assert.deepEqual(out!.tags, [
    'Jesus / Life Of Jesus',
    'Light',
    'Thankfulness',
    'Worship',
  ]);
});

test('mapPcoRow: drops rows with no title', () => {
  assert.equal(mapPcoRow({ Title: '' }), null);
  assert.equal(mapPcoRow({ Title: '   ' }), null);
});

test('mapPcoRow: picks default arrangement = first slot whose Name is non-empty', () => {
  const row: Record<string, string> = {
    Title: 'Test Song',
    'Arrangement 1 Name': '',
    'Arrangement 1 BPM': '60', // should be ignored
    'Arrangement 2 Name': 'Live',
    'Arrangement 2 BPM': '120',
    'Arrangement 2 Chord Chart Key': 'G',
  };
  const out = mapPcoRow(row);
  assert.equal(out!.bpm, 120);
  assert.equal(out!.key, 'G');
});

test('mapPcoRow: clamps invalid BPM (out of 30..300 range)', () => {
  const row: Record<string, string> = {
    Title: 'Test',
    'Arrangement 1 Name': 'A',
    'Arrangement 1 BPM': '0',
  };
  assert.equal(mapPcoRow(row)!.bpm, undefined);
  const row2 = { ...row, 'Arrangement 1 BPM': '500' };
  assert.equal(mapPcoRow(row2)!.bpm, undefined);
  const row3 = { ...row, 'Arrangement 1 BPM': '76' };
  assert.equal(mapPcoRow(row3)!.bpm, 76);
});

test('mapPcoRow: falls back to first key in Keys when Chord Chart Key is empty', () => {
  const row: Record<string, string> = {
    Title: 'Test',
    'Arrangement 1 Name': 'A',
    'Arrangement 1 Keys': 'F: Original Key, G',
    'Arrangement 1 Chord Chart Key': '',
  };
  assert.equal(mapPcoRow(row)!.key, 'F');
});

test('mapPcoRow: merges Themes + Song Tag 1 + Song Tag 2 with case-insensitive dedupe', () => {
  const row: Record<string, string> = {
    Title: 'Test',
    Themes: 'Worship, Praise',
    'Song Tag 1': 'praise, Communion',
    'Song Tag 2': 'WORSHIP',
  };
  const out = mapPcoRow(row)!;
  assert.deepEqual(out.tags, ['Worship', 'Praise', 'Communion']);
});

test('mapPcoRows: drops untitled rows in bulk', () => {
  const rows = [
    { Title: 'Song A' },
    { Title: '' },
    { Title: 'Song B' },
    { Title: '   ' },
  ];
  const out = mapPcoRows(rows);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((s) => s.title), ['Song A', 'Song B']);
});

test('mapGenericRows: title required; case-insensitive header matching', () => {
  const headers = ['title', 'Artist', 'BPM', 'Key'];
  const rows = [
    { title: 'Amazing Grace', Artist: 'Trad', BPM: '70', Key: 'G' },
    { title: '', Artist: 'X', BPM: '120', Key: 'D' },
    { title: 'In Christ Alone', Artist: '', BPM: 'banana', Key: 'C' },
  ];
  const out = mapGenericRows(rows, headers);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Amazing Grace');
  assert.equal(out[0].artist, 'Trad');
  assert.equal(out[0].bpm, 70);
  assert.equal(out[0].key, 'G');
  assert.equal(out[1].title, 'In Christ Alone');
  assert.equal(out[1].bpm, undefined); // "banana" not coercible
  assert.equal(out[1].key, 'C');
  assert.equal(out[1].artist, undefined); // empty cell
});

test('mapGenericRows: tags + themes columns merge and dedupe', () => {
  const headers = ['title', 'tags', 'themes'];
  const rows = [{ title: 'Song', tags: 'Worship, Praise', themes: 'praise, Joy' }];
  const out = mapGenericRows(rows, headers);
  assert.deepEqual(out[0].tags, ['Worship', 'Praise', 'Joy']);
});

test('dedupeByTitle: drops intra-file duplicates case-insensitively (server-aligned)', () => {
  // Mirrors server's normalizeTitle = trim + toLowerCase. Internal
  // whitespace is NOT collapsed (so "Amazing Grace" and "Amazing  Grace"
  // are distinct), matching what the server will actually do on insert.
  const songs = [
    { title: 'Amazing Grace' },
    { title: 'amazing grace' },
    { title: 'In Christ Alone' },
    { title: '  Amazing Grace  ' }, // surrounding whitespace only
  ];
  const { unique, intraFileDupes } = dedupeByTitle(songs);
  assert.equal(unique.length, 2);
  assert.equal(intraFileDupes, 2);
  assert.equal(unique[0].title, 'Amazing Grace');
});

test('normalizeTitleForDedupe: matches server normalizeTitle (trim + lowercase only)', () => {
  assert.equal(normalizeTitleForDedupe('Amazing Grace'), 'amazing grace');
  assert.equal(normalizeTitleForDedupe('  Amazing Grace  '), 'amazing grace');
  // Internal whitespace is preserved, mirroring the server.
  assert.equal(normalizeTitleForDedupe('Amazing  Grace'), 'amazing  grace');
});

test('splitNewVsDuplicate: separates rows already in the user repertoire', () => {
  const songs = [
    { title: 'Amazing Grace' },
    { title: 'In Christ Alone' },
    { title: 'Goodness Of God' },
  ];
  const existing = ['Amazing Grace', 'goodness of god', '  10,000 Reasons  '];
  const { newSongs, existingMatches } = splitNewVsDuplicate(songs, existing);
  assert.deepEqual(
    newSongs.map((s) => s.title),
    ['In Christ Alone'],
  );
  assert.deepEqual(
    existingMatches.map((s) => s.title),
    ['Amazing Grace', 'Goodness Of God'],
  );
});
