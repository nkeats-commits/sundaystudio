---
name: Stripe-backed trial administration
description: Safe handling of admin operations that change card-backed trial dates
---

Do not change the local confirmed trial start to extend access. A card-backed trial's access end and Stripe's first-charge date must move together. When the end moves, reset end-relative reminder stamps so notifications reschedule against the new date, but preserve start-relative milestones.

**Why:** Moving only the local date can misstate the trial countdown and let Stripe charge on the old date while the app implies a later one. Keeping old reminder stamps can also suppress notices for the new charge date.

**How to apply:** Update Stripe's trial end and persist the same effective end for access, reporting, and lifecycle reminders. Keep the confirmed trial start and start-relative milestone stamps unchanged; clear expiring, final-reminder, and expired stamps when the effective end changes.