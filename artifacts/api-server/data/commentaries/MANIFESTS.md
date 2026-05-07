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

### Provenance note (batch 1: JFB, Barnes, Pulpit)

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
- `calvin-commentaries`    → `https://biblehub.com/commentaries/calvin/` (48 of 65 non-Revelation books — Calvin wrote no Revelation commentary and skipped Chronicles, Samuel, Kings, Ruth, Judges, Esther, Ezra, Nehemiah, Job, Proverbs, Ecclesiastes, Song of Songs, 2-3 John; the gate uses `minBooksOverride=45, minChaptersOverride=750`)
- `spurgeon-treasury`      → `https://biblehub.com/commentaries/tod/` (Psalms only — pass `psalmsOnly=true`)

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
