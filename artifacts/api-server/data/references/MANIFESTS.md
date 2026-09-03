# Public-domain Bible reference inventory

The reference catalog is intentionally separate from `data/commentaries`.
Translation rows are keyed by canonical book/chapter/verse, Treasury rows by
source passage, and dictionary rows by a stable lexical key. The API exposes
metadata and bounded passage lookups; it never serves these files directly.

## Sources

| ID | Edition / data type | Provenance and rights evidence |
| --- | --- | --- |
| `kjv-1769` | King James Version, 1769; selected verse text | Project Gutenberg eBook 10 (`gutenberg.org/ebooks/10`), public-domain text |
| `asv-1901` | American Standard Version, 1901; selected verse text | Project Gutenberg eBook 5317 (`gutenberg.org/ebooks/5317`), public-domain text |
| `tsk-1830` | Treasury of Scripture Knowledge, 1830; selected cross-references | Internet Archive scan (`archive.org/details/treasuryofscript0000drra`); 1830 edition is public domain |
| `strongs-1890` | Strong's Exhaustive Concordance, 1890; selected lexical entries | Internet Archive scan (`archive.org/details/strongsexhaustiv00stro`); 1890 edition is public domain |
| `eastons-1897` | Easton's Bible Dictionary, 1897; selected dictionary entries | Project Gutenberg eBook 64651 (`gutenberg.org/ebooks/64651`); 1897 edition is public domain |

The bundled rows are a small, hand-curated first slice of those editions, not
a claim of complete Bible coverage. Each source must retain its exact edition,
provenance URL, license, and attribution text when expanded. Do not add an
aggregator dump with ambiguous rights; validate duplicate keys, malformed
passages, and missing provenance before registration.

The indexed additions in this slice remain covered by the source manifest for
their collection: KJV and ASV verse rows, TSK passage relationships, Strong's
lexical entries, and Easton's dictionary entries. A data-row addition does not
change the edition, publication year, attribution, provenance URL, or
public-domain evidence above.