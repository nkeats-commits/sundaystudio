import assert from 'node:assert/strict';
import test from 'node:test';
import {
  crossReferenceLookupResource,
  lexicalLookupResource,
  selectedWordLookupResource,
  readBibleToolsQuery,
  translationLookupResource,
} from './bibleTools';

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

test('translation lookup saves preserve the public-domain source metadata', () => {
  assert.deepEqual(
    translationLookupResource({
      sourceId: 'kjv',
      sourceTitle: 'King James Version',
      sourceAuthor: 'Public Domain Committee',
      sourceUrl: 'https://example.test/kjv',
      attribution: 'King James Version, public domain',
      reference: 'John 3:16',
      book: 'John',
      chapter: 3,
      verse: 16,
      text: 'For God so loved the world…',
    }),
    {
      resourceType: 'bible-text',
      title: 'John 3:16',
      author: 'Public Domain Committee',
      publisher: 'King James Version',
      url: 'https://example.test/kjv',
      excerpt: 'For God so loved the world…',
      notes: 'King James Version, public domain',
      relatedPassage: 'John 3:16',
      tags: ['Bible Tools', 'Bible text'],
    },
  );
});

test('cross-reference and lexical lookups become independently saveable resources', () => {
  assert.deepEqual(
    crossReferenceLookupResource({
      sourceId: 'treasury',
      sourceTitle: 'Treasury of Scripture Knowledge',
      sourceAuthor: 'R. A. Torrey',
      sourceUrl: 'https://example.test/treasury',
      attribution: 'Treasury of Scripture Knowledge, public domain',
      sourceReference: 'John 3:16',
      targets: ['Romans 5:8', '1 John 4:9'],
      note: 'Related theme',
    }),
    {
      resourceType: 'cross-reference',
      title: 'John 3:16 cross-references',
      author: 'R. A. Torrey',
      publisher: 'Treasury of Scripture Knowledge',
      url: 'https://example.test/treasury',
      excerpt: 'Related passages: Romans 5:8, 1 John 4:9\nNote: Related theme',
      notes: 'Treasury of Scripture Knowledge, public domain',
      relatedPassage: 'John 3:16',
      tags: ['Bible Tools', 'Cross-reference'],
    },
  );

  assert.deepEqual(
    lexicalLookupResource({
      sourceId: 'strongs',
      sourceTitle: "Strong's Greek Dictionary",
      sourceAuthor: 'James Strong',
      sourceUrl: 'https://example.test/strongs',
      attribution: "Strong's Greek Dictionary, public domain",
      key: 'G26',
      term: 'love',
      strongsNumber: 'G26',
      originalWord: 'ἀγάπη',
      transliteration: 'agapē',
      language: 'Greek',
      definition: 'Affection and benevolence.',
      references: ['John 3:16'],
    }),
    {
      resourceType: 'lexicon',
      title: 'love word study',
      author: 'James Strong',
      publisher: "Strong's Greek Dictionary",
      url: 'https://example.test/strongs',
       excerpt:
         "Original-language word: ἀγάπη\nLanguage: Greek\nTransliteration: agapē\nStrong's identifier: G26\n\nAffection and benevolence.\n\nFound in: John 3:16",
      notes: "Strong's Greek Dictionary, public domain",
      relatedPassage: 'John 3:16',
      tags: ['Bible Tools', 'Lexicon'],
    },
  );

  assert.match(
    lexicalLookupResource({
      sourceId: 'eastons',
      sourceTitle: "Easton's Bible Dictionary",
      sourceAuthor: 'Matthew George Easton',
      sourceUrl: 'https://example.test/eastons',
      attribution: "Easton's Bible Dictionary, public domain",
      key: 'love',
      term: 'love',
      originalWord: 'love',
      transliteration: '',
      language: 'English',
      definition: 'A dictionary definition.',
      references: [],
    }).excerpt ?? '',
    /Found in: Verified occurrences are unavailable for this entry\./,
  );
});

test('lexical saves prefer the current study passage as context', () => {
  assert.equal(
    lexicalLookupResource(
      {
        sourceId: 'strongs',
        sourceTitle: "Strong's Greek Dictionary",
        sourceAuthor: 'James Strong',
        sourceUrl: 'https://example.test/strongs',
        attribution: "Strong's Greek Dictionary, public domain",
        key: 'G26',
        term: 'love',
        strongsNumber: 'G26',
        originalWord: 'ἀγάπη',
        transliteration: 'agapē',
        language: 'Greek',
        definition: 'Affection and benevolence.',
        references: ['John 3:16'],
      },
      'Romans 8:1-11',
    ).relatedPassage,
    'Romans 8:1-11',
  );
});

test('selected-word saves preserve token context, provenance, and other occurrences', () => {
  const payload = selectedWordLookupResource(
    {
      translationSourceId: 'kjv-1769',
      reference: 'John 3:16',
      tokenIndex: 3,
      tokenText: 'loved',
      status: 'verified',
      candidates: [],
    },
    {
      sourceId: 'strongs',
      sourceTitle: "Strong's Greek Dictionary",
      sourceAuthor: 'James Strong',
      sourceUrl: 'https://example.test/strongs',
      attribution: "Strong's Greek Dictionary, public domain",
      key: 'g25',
      term: 'love',
      strongsNumber: 'G25',
      originalWord: 'ἀγαπάω',
      transliteration: 'agapaō',
      language: 'Greek',
      definition: 'To love.',
      references: ['John 3:16', '1 John 4:9'],
      selectedVerse: 'John 3:16',
      alsoFoundIn: ['1 John 4:9'],
    },
  );
  assert.equal(payload.relatedPassage, 'John 3:16');
  assert.match(String(payload.excerpt), /Selected word: loved/);
  assert.match(String(payload.excerpt), /Token position: 4/);
  assert.match(String(payload.excerpt), /Exact occurrence: John 3:16/);
  assert.match(String(payload.excerpt), /Also found in: 1 John 4:9/);
  assert.match(String(payload.notes), /Selected-word provenance/);
});