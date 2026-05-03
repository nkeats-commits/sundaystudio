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
license + source URL for traceability.
