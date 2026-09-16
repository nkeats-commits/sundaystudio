---
name: Public commentary corpus ingestion
description: Coverage and cleanup rules for importing public-domain Bible commentary from heterogeneous hosts.
---

Use exact coverage gates for each commentary source, but allowlist only gaps verified against the upstream page. A shared minimum excerpt length is unsafe when a source preserves genuine short cross-reference notes; use a documented source-specific floor instead. Strip host attribution/page-footer text from chapter excerpts while retaining provenance in the manifest and `_sourceUrl` metadata.

**Why:** BibleHub and SermonIndex expose different page structures, and both can return successful pages that contain only attribution or a short but authentic note. Treating every short result as parser failure either loses valid commentary or weakens completeness checks.

**How to apply:** When adding another source, audit every missing chapter, record verified upstream gaps, preserve partial-book scope in runtime coverage, and test representative clean text plus attribution and budget behavior.

For passage-keyed sources outside BibleHub, treat host banners, publication
blocks, and reader navigation as parser failures. Keep an explicit chapter-key
inventory when a verified edition is intentionally partial within a book.

**Why:** New Advent places a support banner before Augustine's article and
varies publication-block quoting, while CCEL wraps Luther's chapters in nested
XHTML reader markup. Neither should become runtime commentary or an implicit
coverage gap.

**How to apply:** Add a dedicated extractor and source-specific exact
inventory, then regenerate the checked-in corpus and run the offline audit
before changing the registry.