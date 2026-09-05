# Public-domain Bible reference inventory

The reference catalog is intentionally separate from `data/commentaries`.
Translation rows are keyed by canonical book/chapter/verse, Treasury rows by
source passage, and dictionary rows by a stable lexical key. The API exposes
metadata and bounded passage lookups; it never serves these files directly.

## Sources

| ID | Edition / data type | Provenance and rights evidence |
| --- | --- | --- |
| `kjv-1769` | King James Version, 1769; 31,102 verses across all 66 books | Pinned structured snapshot of `jsubroto/bible-api`; the underlying 1769 KJV is public domain |
| `asv-1901` | American Standard Version, 1901; 31,086 indexed verses across all 66 books | Pinned high-fidelity USX snapshot of `openbibleinfo/American-Standard-Version-Bible`; public-domain mark |
| `tsk-1830` | Treasury of Scripture Knowledge, 1830; 30,412 source passages with relationships | Pinned SoulLiberty source snapshot as distributed by `neuu-org/bible-crossrefs-dataset`; public-domain TSK text |
| `strongs-1890` | Strong's Exhaustive Concordance, 1890; 14,197 lexical entries | Pinned Open Scriptures Hebrew/Greek dictionary data; source XML identifies the 1890 work as public domain |
| `eastons-1897` | Easton's Bible Dictionary, 1897; 3,961 dictionary entries | Pinned structured source from `garydavenport73/eastons-bible-dictionary-json`; 1897 edition is public domain |

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

The ingestion command is `pnpm --filter @workspace/scripts run
ingest-references` with pinned source roots. It normalizes duplicate TSK shard
keys, rejects malformed rows at load time, and writes only the bounded lookup
indexes used by the API.