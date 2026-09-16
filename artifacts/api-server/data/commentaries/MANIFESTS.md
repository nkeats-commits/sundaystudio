# Bundled scholarly commentary sources

Each subdirectory is one registered source the Sermon Builder can consult
when a user has enabled it in Settings → Sources.

Layout:

```
data/commentaries/
  <source-id>/
    MANIFEST.json   ← registry metadata (id, title, author, year, license,
                       sourceUrl, description). Always required.
    <book-slug>.json ← one file per Bible book that has data, keyed by
                       chapter (string). Optional — sources without book
                       files are still registered (and toggleable in
                       Settings) but contribute no excerpts at lookup time.
```

`<book-slug>` uses lowercase canonical names with dashes (e.g.
`romans.json`, `1-corinthians.json`, `song-of-songs.json`).

The shape of a `<book-slug>.json` file:

```json
{
  "book": "Romans",
  "chapters": {
    "8": {
      "title": "More Than Conquerors",
      "text": "There is therefore now no condemnation… (concise commentary text)"
    },
    "12": { "title": "Living Sacrifices", "text": "…" }
  }
}
```

`text` is plain text (no HTML, no markdown). Lookup truncates to ≤ 1500 chars
when injected into a prompt to mirror the existing `resourceBlurb` cap.

All bundled content MUST be public-domain. The `MANIFEST.json` records the
license + source URL for traceability. Each per-book `<book-slug>.json` also
records the URL it was sourced from in a top-level `_sourceUrl` field
(ignored by the loader; present purely for provenance / future re-ingest).

### Provenance note (BibleHub-hosted editions)

The original task spec named CCEL as the upstream for these three works, but
CCEL only ships a per-work plain-text dump for JFB (and that dump's per-book
headers vary too much to parse reliably across the canon — Genesis is "FIRST
BOOK OF MOSES, CALLED \n GENESIS", Joshua is "THE \n BOOK OF JOSHUA", several
books have no explicit header, etc.). Barnes and Pulpit have no CCEL dump at
all. To ship all three with one consistent parser we pulled chapter text
from BibleHub's per-chapter HTML pages instead. The works themselves are
identical PD editions; only the host changed. Each manifest records the
actual `sourceUrl` (BibleHub) and the originally-intended `originalSourceUrl`
(CCEL) for traceability.

Per the task spec, Barnes was expected to have partial OT coverage. The
upstream BibleHub edition actually carries Barnes for the entire OT — only
4 chapters are genuinely empty (Exodus 36, 37, 39, and 2 Chronicles 10, the
1 Kings // 2 Chronicles parallel) and those are tracked in the script's
`KNOWN_EMPTY_UPSTREAM` allowlist.

### Provenance note (bundle: Poole, Wesley, Ellicott)

The three bundled works are public-domain editions published before 1929:

- **Matthew Poole's Annotations** — the 1683-1685 work, cross-checked against
  the 1683 digitized *Annotations upon the Holy Bible* record at
  [Internet Archive](https://archive.org/details/bim_early-english-books-1641-1700_annotations-upon-the-hol_poole-matthew_1683).
  Chapter text is normalized from BibleHub's Poole per-chapter pages. The
  attribution shown to users is the title and author from the manifest.
- **John Wesley's Explanatory Notes** — Wesley's *Explanatory Notes Upon the
  New Testament* (1755) and the companion Old Testament notes published
  1754-1765. CCEL identifies the New Testament text as John Wesley's work and
  public domain at [Wesley's Notes](https://www.ccel.org/ccel/wesley/notes.i.html);
  Bible Study Tools also explicitly identifies the whole-Bible files as public
  domain. The importer uses its per-book chapter pages because CCEL's exposed
  reader is New Testament-only. The importer uses BibleHub's `wes` chapter
  pages for the checked-in whole-Bible corpus. All 66 canonical books are
  present; 14 pages contain only an attribution footer and no separate note:
  2 Samuel 22 and 24; 1 Chronicles 14 and 18; Psalms 70, 100, 108, 116,
  117, 128, and 143; and Isaiah 36, 37, and 39.
- **Ellicott's Commentary for English Readers** — the 1878-1905 multi-volume
  edition edited by Charles John Ellicott. Volume 1 is preserved in the
  [Internet Archive record](https://archive.org/details/biblecommentaryf01elliuoft),
  which identifies the work and publication provenance. Chapter text is
  normalized from BibleHub's Ellicott per-chapter pages; contributors vary by
  book, so the manifest attributes the edition to Ellicott as editor. The
  digitized host has no usable notes for Zephaniah or Zechariah, and 14 other
  chapter pages contain only an attribution footer: Genesis 39 and 44;
  Numbers 2, 5, and 7; Joshua 12, 17, and 20; 2 Samuel 9; Psalms 108 and 117;
  Jeremiah 45; Ezekiel 15; and 1 John 3.

BibleHub and Bible Study Tools are text hosts, not the license evidence. Their
page markup is only an ingest transport: the generated JSON is checked in and
runtime code never fetches either site. Poole is expected to cover all 66 books
and 1,189 canonical chapters. Wesley is expected to cover all 66 books and
1,175 chapters. Ellicott is expected to cover 64 books and 1,158 chapters. Any
gap outside those hand-checked inventories fails the ingest gate rather than
creating a partial-looking corpus.

## How to ingest a new source

The repo ships one shared ingest script that scrapes BibleHub's per-chapter
commentary pages and writes the per-book JSON files into the source's
data directory:

```sh
pnpm --filter @workspace/scripts run ingest-commentary <source-id>
```

Currently wired sources:

- `jamieson-fausset-brown` → `https://biblehub.com/commentaries/jfb/`
- `barnes-notes`           → `https://biblehub.com/commentaries/barnes/`
- `pulpit-commentary`      → `https://biblehub.com/commentaries/pulpit/`
- `adam-clarke`            → `https://biblehub.com/commentaries/clarke/`
- `john-gill`              → `https://biblehub.com/commentaries/gill/`
- `keil-delitzsch`         → `https://biblehub.com/commentaries/kad/` (OT only — pass `otOnly=true`)
- `calvin-commentaries`    → `https://biblehub.com/commentaries/calvin/` (48 books / 817 chapters — Calvin wrote no Revelation commentary and skipped Chronicles, Samuel, Kings, Ruth, Judges, Esther, Ezra, Nehemiah, Job, Proverbs, Ecclesiastes, Song of Songs, 2-3 John; 30 verified upstream gaps: Leviticus 12, Jeremiah 52, and Ezekiel 21–48)
- `spurgeon-treasury`      → `https://biblehub.com/commentaries/tod/` (Psalms only — pass `psalmsOnly=true`)
- `matthew-poole`          → `https://biblehub.com/commentaries/poole/` (whole Bible)
- `ellicott-english-readers` → `https://biblehub.com/commentaries/ellicott/` (64 books / 1,158 chapters; known gaps above)
- `wesley-explanatory-notes` → `https://biblehub.com/commentaries/wes/` (66 books / 1,175 chapters; known gaps above)
- `joseph-benson`          → `https://biblehub.com/commentaries/benson/` (66 books / 1,186 chapters; three verified upstream gaps)
- `john-trapp`             → `https://www.sermonindex.net/commentary/trapp/` (65 books / 1,186 chapters; three verified upstream gaps)
- `thomas-scott`           → `https://www.sermonindex.net/commentary/tscott/` (Psalms 1–150 except Psalm 59; 149 chapters)
- `augustine-expositions`  → `https://www.newadvent.org/fathers/1801.htm` (Augustine's Expositions on the Psalms; 150 chapters)
- `luther-galatians`       → `https://ccel.org/ccel/luther/galatians.html` (Luther's Commentary on Galatians; 6 chapters)

Why BibleHub: CCEL only publishes plain-text dumps for a few works, and the
JFB dump's per-book headers vary across the canon (`THE FIRST BOOK OF MOSES,
CALLED \n GENESIS`, `THE \n BOOK OF JOSHUA`, `THE EPISTLE OF PAUL THE APOSTLE
TO THE \n ROMANS`, etc.). BibleHub's per-chapter pages share one consistent
DOM shape, so the same parser handles all three.

The script:

- fetches `<base>/<book-slug>/<chapter>.htm` for every (book, chapter) pair
  in the canon at concurrency 12,
- strips `<script>`/`<style>` blocks (BibleHub embeds inline ad JS),
- extracts the commentary text immediately after the first few
  `<div class="versenum">` markers (skipping the page-chrome chunk before
  verse 1),
- truncates to ~1400 chars on a sentence boundary (the registry caps at
  1500 anyway),
- wipes pre-existing `*.json` files in the source dir (preserving
  `MANIFEST.json`) before writing,
- aborts with a non-zero exit if the parsed total is implausibly small
  (guard against silent BibleHub DOM drift).

The normal minimum cleaned excerpt length is 200 characters. Wesley uses a
100-character floor because a few authentic chapter notes are intentionally
brief (for example, Psalms 131 and 150); footer-only pages become empty after
boilerplate cleanup and still fail the completeness gate unless allowlisted.

To add another source backed by BibleHub, add a `case` in the script's
`main()` switch with the BibleHub path segment, then run the script. To add
a source from a different upstream, write a dedicated extractor and ingest
function that populates the same `Map<canonical, BookOut>` shape and pass it
to `writeBooks()`. The Augustine and Luther ingesters are examples for
passage-keyed New Advent and CCEL readers; their source-specific exact
inventories are kept in `commentaryValidation.ts`.

### Provenance note (bundle: Benson, Trapp, Scott)

- **Benson's Commentary on the Old and New Testaments** — Joseph Benson's
  nineteenth-century commentary, represented here by the 1850 edition. The
  BibleHub chapter pages are the checked-in text host; the edition itself is
  public domain. The manifest identifies BibleHub as the transport source and
  attributes the work to Joseph Benson. 2 Samuel 22, Isaiah 37, and Isaiah 39
  are verified attribution-only upstream pages.
- **Trapp's Complete Commentary on the Old and New Testaments** — John Trapp's
  seventeenth-century five-volume work, published across 1647–1660 and public
  domain. SermonIndex supplies pages for 65 books; Exodus 37, Isaiah 39, and
  Jude 1 are verified upstream gaps. The checked-in data is normalized from
  those pages and runtime code never fetches the site.
- **Thomas Scott's Explanatory Notes on the Bible** — Scott's explanatory
  notes were published in weekly parts from 1788–1792 and are public domain.
  SermonIndex currently exposes the Psalms corpus for this source, with Psalm
  59 unavailable upstream. The manifest and derived coverage intentionally say
  “Psalms only” rather than implying whole-Bible coverage.

- **Augustine's Expositions on the Psalms** — Augustine's exposition is
  represented by the anonymous English translation in *Nicene and Post-Nicene
  Fathers, First Series*, volume 8 (1888), edited by Philip Schaff. New Advent
  exposes the verified edition as one page for each of Psalms 1–150. New
  Advent is the transport host, not the license evidence; the 1888 volume is
  public domain. The manifest and derived coverage intentionally say “Psalms
  only” rather than implying whole-Bible coverage.
- **Luther's Commentary on Galatians** — Martin Luther's commentary is
  represented by Theodore Graebner's abridged English translation, published
  by Concordia Publishing House in 1918 and hosted by CCEL. The edition has
  six passage-keyed chapter pages, Galatians 1–6. CCEL is the transport host,
  not the license evidence; the 1918 edition is public domain. This is a
  later-Reformation source and its manifest intentionally does not imply
  coverage outside Galatians.

- **Calvin's Commentaries** — Calvin's 48-book corpus contains 30 verified
  upstream omissions: Leviticus 12, Jeremiah 52, and Ezekiel 21–48. Each
  BibleHub page returns the chapter text and Calvin attribution footer but no
  commentary body. They are recorded in `KNOWN_EMPTY_UPSTREAM`, so the exact
  coverage gate expects 817 chapters rather than treating the omissions as
  ingest failures.

SermonIndex is the text host for Trapp and Scott, not the license evidence.
The importer strips the scripture lead-in, verse headings, HTML, and citation
footer from each chapter page before writing normalized JSON. The generated
files are checked in and the runtime loader never fetches SermonIndex.
New Advent's support banner/publication block and CCEL's XHTML reader
navigation are parser failures, not source gaps. They must be removed during
ingest; empty pages, page chrome, and attribution/license text must never be
accepted as commentary.

### Failure checklist

Before accepting a new corpus, verify that the ingest command exits
successfully, the book and chapter totals match the manifest's documented
scope, representative JSON entries contain no HTML or navigation text, and
lookup tests hit a common passage. A missing body marker, HTTP failure,
unexpectedly short chapter, or unexpected chapter gap must remain fatal; do
not lower the completeness floor to make a run pass.

## Maintenance validation

Run the offline corpus audit before committing a refreshed bundle:

```sh
pnpm --filter @workspace/scripts run validate-commentary
```

The command audits all bundled source directories. It checks required
attribution metadata, expected book and chapter totals, the verified
`KNOWN_EMPTY_UPSTREAM` gap inventory for exact sources, source-specific
minimum excerpt lengths, clean text without host/page artifacts, provenance
URLs on refreshed book files, and one representative chapter hit per source.
It exits non-zero and reports the source plus book/chapter when any check
fails. Matthew Henry's original bundle remains a legacy exception for
per-book provenance and exact gap inventory; Calvin now uses the exact
verified-gap gate. All checked-in book/chapter totals and text cleanliness
remain enforced.
