---
name: Translation token alignment
description: Accuracy constraints for connecting displayed Bible translation tokens to original-language lexical entries
---

Token-level Bible study must be translation-specific and provenance-backed. A lexical match is authoritative only when the selected translation, verse, token position, and displayed token text all match a validated alignment row. Unsupported or incomplete coverage must remain an explicit unavailable state rather than borrowing another translation's tags or inferring from an English gloss.

**Why:** Public-domain translations can differ in wording and tokenization, while lexical occurrences alone do not prove which displayed word they support.

**How to apply:** Keep alignment indexes separate from verse text and lexical occurrence indexes; pin source revision, license, checksums, row counts, and coverage gaps; resolve candidate identifiers only through enabled lexical sources.