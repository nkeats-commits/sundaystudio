---
name: Stripe-backed trial administration
description: Safe handling of admin operations that change card-backed trial dates
---

Do not change the local confirmed trial start to extend access. A card-backed trial's access end and Stripe's first-charge date must move together; until that can be guaranteed, reject admin trial extensions.

**Why:** Moving only the local date can misstate the trial countdown and let Stripe charge on the old date while the app implies a later one.

**How to apply:** If admin extensions are re-enabled, update Stripe's trial end, persist an authoritative effective end for access and lifecycle reminders, and keep the confirmed trial start unchanged.