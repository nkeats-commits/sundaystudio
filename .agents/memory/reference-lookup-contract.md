---
name: Reference lookup contract
description: The Bible reference lookup accepts passage-plus-optional terms and term-only requests while preserving legacy empty-term callers.
---

The lookup request must accept a passage with omitted or empty optional terms, a non-empty lexical term list without a passage, or both; it must reject requests containing neither.

**Why:** Sermon Resources already sends an explicit empty terms array for passage previews, while Bible Tools needs safe term-only Strong's and dictionary lookup.

**How to apply:** Keep the route's Zod/OpenAPI validation and generated client types aligned when changing this request shape, and always regression-test both legacy passage calls and term-only calls.

Passage-scoped lexical matching must use a full normalized occurrence index separate from the bounded references displayed in API results.

**Why:** The response intentionally truncates lexical references for budget control, but a requested verse can occur after that display cutoff and still be a valid indexed match.

**How to apply:** Preserve the bounded `references` field for clients while filtering candidates against the complete normalized occurrence set.