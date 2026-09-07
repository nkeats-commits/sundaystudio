---
name: Generated API client freshness
description: The generated client and runtime validators can drift from the canonical OpenAPI request contract.
---

When a request body supports multiple valid shapes, regenerate the API client and Zod artifacts from the canonical OpenAPI spec before changing application code to satisfy generated types.

**Why:** A stale generated declaration can reject a request shape that the OpenAPI contract and server already support, making a typecheck failure look like a product bug.

**How to apply:** Run the API spec codegen workflow after request-contract changes or when generated client types disagree with route validation; then rerun the consuming artifact's typecheck.