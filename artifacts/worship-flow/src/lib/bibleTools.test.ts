import assert from 'node:assert/strict';
import test from 'node:test';
import { readBibleToolsQuery } from './bibleTools';

test('prefills a verse lookup from a passage query', () => {
  assert.deepEqual(readBibleToolsQuery('?passage=John%203%3A16'), {
    mode: 'verse',
    passage: 'John 3:16',
    term: '',
  });
});

test('prefills a word lookup from a term and keeps optional passage context', () => {
  assert.deepEqual(readBibleToolsQuery('?passage=Romans%208&term=G26'), {
    mode: 'word',
    passage: 'Romans 8',
    term: 'G26',
  });
});

test('malformed or absent query values safely produce an empty verse state', () => {
  assert.deepEqual(readBibleToolsQuery(''), {
    mode: 'verse',
    passage: '',
    term: '',
  });
  assert.deepEqual(readBibleToolsQuery('?term=%E0%A4%A'), {
    mode: 'verse',
    passage: '',
    term: '',
  });
});