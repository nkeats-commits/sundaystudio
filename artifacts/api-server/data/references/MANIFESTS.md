# Public-domain Bible reference inventory

The reference catalog is intentionally separate from `data/commentaries`.
Translation rows are keyed by canonical book/chapter/verse, Treasury rows by
source passage, and dictionary rows by a stable lexical key. The API exposes
metadata and bounded passage lookups; it never serves these files directly.
Token alignments are separate translation-owned indexes. They are only used
when the request names the same translation source, verse, token position, and
displayed token text.

## Sources

| ID | Edition / data type | Provenance and rights evidence |
| --- | --- | --- |
| `kjv-1769` | King James Version, 1769; 31,102 verses across all 66 books | Pinned structured snapshot of `jsubroto/bible-api`; the underlying 1769 KJV is public domain |
| `asv-1901` | American Standard Version, 1901; 31,086 indexed verses across all 66 books | Pinned high-fidelity USX snapshot of `openbibleinfo/American-Standard-Version-Bible`; public-domain mark |
| `tsk-1830` | Treasury of Scripture Knowledge, 1830; 30,412 source passages with relationships | Pinned SoulLiberty source snapshot as distributed by `neuu-org/bible-crossrefs-dataset`; public-domain TSK text |
| `strongs-1890` | Strong's Exhaustive Concordance, 1890; 14,197 lexical entries plus verified occurrence references | Pinned Open Scriptures Hebrew/Greek dictionary data; source XML identifies the 1890 work as public domain. Verse occurrences are derived from the pinned STEPBible TAHOT/TAGNT tagged-word snapshot (CC BY 4.0, revision `c5407786ede9b26a8998366524076f7c739dccdd`) |
| `eastons-1897` | Easton's Bible Dictionary, 1897; 3,961 dictionary entries | Pinned structured source from `garydavenport73/eastons-bible-dictionary-json`; 1897 edition is public domain |

## Token alignment coverage

The alignment files are generated from the pinned STEPBible TAHOT/TAGNT
snapshot (CC BY 4.0, revision
`c5407786ede9b26a8998366524076f7c739dccdd`) and retain source provenance in
each translation manifest. `kjv-1769/alignments.json` currently covers the
verified John 3:16 token sequence (25 rows); every other KJV verse is listed
as an explicit alignment gap. `asv-1901/alignments.json` is intentionally
empty until an ASV-specific tagged source is validated, so ASV words are never
silently matched to KJV tokens.

An alignment row is accepted only when its token position and displayed word
match the translation row exactly. Strong's identifiers are retained as
candidate identifiers; the API resolves them only through enabled lexical
sources and returns an unavailable state when coverage or lexical data is
missing.

The KJV, Strong's, and Easton's corpora have no known source gaps in the
bundled indexes. The ASV source contains 31,086 verses rather than the KJV's
31,102 verse keys because these sixteen verse numbers are absent from the
verified USX edition: `Matthew 17:21`, `Matthew 18:11`, `Matthew 23:14`,
`Mark 7:16`, `Mark 9:44`, `Mark 9:46`, `Mark 11:26`, `Mark 15:28`,
`Luke 17:36`, `Luke 23:17`, `John 5:4`, `Acts 8:37`, `Acts 15:34`,
`Acts 24:7`, `Acts 28:29`, and `Romans 16:24`. These are textual-variant
omissions, not silently inferred or copied from the KJV.

The TSK source contains 31,102 unique canonical verse keys, but 690 have no
cross-reference relationship and therefore are not indexed as lookup rows.
The API exposes only rows with at least one verified target. Raw files stay
server-side; lookup responses remain bounded and attributed.

Strong's occurrence references are not inferred from English translations,
glosses, or definitions. The ingestion pipeline reads the tagged original
language records from the pinned STEPBible snapshot, normalizes them to
canonical book/chapter/verse references, removes duplicates, and records the
occurrence source metadata in the Strong's manifest. Entries without a tagged
occurrence keep an empty reference list, which the UI presents as unavailable
rather than as evidence that the word has no uses.

The ingestion command is `pnpm --filter @workspace/scripts run
ingest-references` with pinned source roots, including
`--strongs-occurrence-root` pointing at the checked-out STEPBible TAHOT/TAGNT
files, and `--alignment-root` pointing at translation-specific tagged alignment
exports. It normalizes duplicate TSK shard keys and Strong's occurrence keys,
rejects malformed rows and translation/token mismatches at load time, and
writes only the lookup indexes used by the API. Ingestion writes each corpus's pinned `sourceRevision`,
generated file SHA-256, row count, and gap-allowlist SHA-256 into its
`MANIFEST.json`. The command validates a complete staging directory against the
trusted revision/count/checksum contract before replacing the live directory.

To validate checked-in data without source inputs, run:

```sh
pnpm --filter @workspace/scripts run validate-references
```

The validation contract rejects unexpected row counts, duplicate keys,
malformed rows, changed generated checksums, and changed gap allowlists.