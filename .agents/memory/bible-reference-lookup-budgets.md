---
name: Bible reference lookup budgets
description: Durable guidance for bounded reference bundles when one source type grows much larger than the others.
---

Keep the shared reference-context budget balanced across enabled translation,
lexical, and cross-reference channels rather than consuming it in raw source
order.

**Why:** Expanding a cross-reference corpus from a small sample to tens of
thousands of passages can silently crowd out Strong's or translation context,
even though the lookup still technically respects the total character cap.

**How to apply:** Preserve the total cap, allocate a bounded share to each
enabled source kind, and keep exact lexical searches prioritized within the
lexical share. Add regression coverage whenever a corpus is expanded.