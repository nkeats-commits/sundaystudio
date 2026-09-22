---
name: Mixed capability fixtures
description: Testing guidance for result lists that render different labels and actions based on per-item capabilities.
---

When a UI fixture contains multiple items with the same capability, assert the expected count and list order, and use item-specific metadata to identify cards.

**Why:** A singular text or role query becomes ambiguous as soon as a mixed response includes more than one capable or incapable item, while count-and-order assertions protect both rendering and grouping behavior.

**How to apply:** For result-card tests, include at least two items in each capability group when stable grouping matters, then assert the group labels, card metadata order, and representative actions.