import type { LibraryItem, ServicePlanItem } from '@workspace/api-client-react';

/**
 * Mapping between service-plan slot kinds and library item kinds.
 *
 * Used by:
 *   - SlotPicker (slot → which library kinds can fill it)
 *   - AddToServiceDialog (library kind → which slots it can drop into)
 *
 * Keep these two functions inverses of each other.
 */
export function libraryKindsForSlot(
  kind: ServicePlanItem['kind'],
): LibraryItem['kind'][] | null {
  switch (kind) {
    case 'song':
      return ['song'];
    case 'prayer':
    case 'welcome':
    case 'benediction':
    case 'communion':
    case 'scripture':
    case 'transition':
      return ['liturgy'];
    case 'custom':
      return ['speaking_moment', 'devotional', 'soul_care'];
    default:
      return null;
  }
}

/**
 * Which slot kinds in a service plan can a library item of this kind drop into?
 * Inverse of libraryKindsForSlot.
 */
export function slotKindsForLibraryKind(
  kind: LibraryItem['kind'],
): ServicePlanItem['kind'][] {
  switch (kind) {
    case 'song':
      return ['song'];
    case 'liturgy':
      return [
        'prayer',
        'welcome',
        'benediction',
        'communion',
        'scripture',
        'transition',
      ];
    case 'speaking_moment':
    case 'devotional':
    case 'soul_care':
      return ['custom'];
    default:
      return [];
  }
}

/**
 * Default slot kind to use when adding this library item as a fresh slot
 * appended to the end of a service plan.
 */
export function defaultNewSlotKindForLibraryKind(
  kind: LibraryItem['kind'],
): ServicePlanItem['kind'] {
  switch (kind) {
    case 'song':
      return 'song';
    case 'liturgy':
      return 'prayer';
    case 'speaking_moment':
    case 'devotional':
    case 'soul_care':
      return 'custom';
    default:
      return 'custom';
  }
}

/**
 * Best-effort body snapshot for a library item, used when linking it into a
 * service plan slot. Mirrors SlotPicker's preview logic.
 */
export function libraryItemBodyPreview(item: LibraryItem): string {
  const c = item.content as Record<string, unknown>;
  if (typeof c.body === 'string' && c.body) return c.body;
  if (typeof c.opening === 'string' && c.opening) return c.opening;
  if (typeof c.reflection === 'string' && c.reflection) return c.reflection;
  if (typeof c.lyrics === 'string' && c.lyrics) return c.lyrics;
  if (typeof c.text === 'string' && c.text) return c.text;
  if (typeof c.artist === 'string' && c.artist) return c.artist;
  return '';
}
