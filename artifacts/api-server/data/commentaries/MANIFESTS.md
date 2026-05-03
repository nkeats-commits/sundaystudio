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

To add a fourth source backed by BibleHub, add a `case` in the script's
`main()` switch with the BibleHub path segment, then run the script. To add
a source from a different upstream, write a new ingest function that
populates the same `Map<canonical, BookOut>` shape and pass it to
`writeBooks()`.
