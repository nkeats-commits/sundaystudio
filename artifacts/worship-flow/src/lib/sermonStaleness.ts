import type {
  Sermon,
  SermonStudyOutput,
  SermonBigIdeaOutput,
  SermonOutlineOutput,
  SermonOutlineOption,
  SermonApplicationsOutput,
  SermonSectionHashes,
} from '@workspace/api-client-react';

/**
 * Per-section input fingerprinting for the Sermon Builder.
 *
 * The Sermon Builder generates sections in a dependency chain:
 *
 *   Study → Big Idea → Outline → Manuscript
 *                  ↘ Applications
 *                  ↘ Illustrations (also needs Outline)
 *                  ↘ Worship Integration (also needs Outline + Applications)
 *
 * When the user changes an upstream input (a different Big Idea selection,
 * a re-generated Study, a new passage, etc.) downstream sections become
 * stale — they were drafted against values that no longer match.
 *
 * To surface this in the UI we record a short hash of the upstream inputs
 * each time we successfully generate a section. On render we recompute the
 * hash for the section's *current* upstream inputs and compare. A mismatch
 * means stale.
 *
 * The hash is intentionally not cryptographic: it just needs to be stable
 * and collision-resistant enough for UI hints. We use FNV-1a over a
 * canonical JSON serialization (sorted keys) so the same inputs always
 * produce the same string.
 */

export const SECTION_KEYS = [
  'study',
  'bigIdea',
  'outline',
  'manuscript',
  'applications',
  'illustrations',
  'worshipIntegration',
  'smallGroupQuestions',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** Snapshot of all values any section might depend on. */
export interface SectionInputSnapshot {
  passage: string;
  secondaryPassages: string[];
  outputFormat: string;
  study: SermonStudyOutput | null;
  /** The Big Idea string the user has selected (or the first option). */
  selectedBigIdea: string | null;
  /** The outline option currently selected. */
  selectedOutline: SermonOutlineOption | null;
  applications: SermonApplicationsOutput | null;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = (value as Record<string, unknown>)[k];
    if (v === undefined) continue;
    parts.push(JSON.stringify(k) + ':' + stableStringify(v));
  }
  return '{' + parts.join(',') + '}';
}

function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // unsigned 32-bit hex, padded
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

function pickSelectedBigIdea(big: SermonBigIdeaOutput | null | undefined): string | null {
  if (!big) return null;
  if (big.selected) return big.selected;
  return big.options?.[0]?.bigIdea ?? null;
}

function pickSelectedOutline(
  outline: SermonOutlineOutput | null | undefined,
): SermonOutlineOption | null {
  if (!outline) return null;
  const idx = outline.selectedIndex ?? 0;
  return outline.options?.[idx] ?? null;
}

/** Build a snapshot from a (possibly partial) sermon record + form values. */
export function buildSnapshot(args: {
  passage: string;
  secondaryPassages: string[];
  outputFormat: string;
  study: SermonStudyOutput | null;
  bigIdea: SermonBigIdeaOutput | null;
  outline: SermonOutlineOutput | null;
  applications: SermonApplicationsOutput | null;
}): SectionInputSnapshot {
  return {
    passage: args.passage,
    secondaryPassages: args.secondaryPassages,
    outputFormat: args.outputFormat,
    study: args.study,
    selectedBigIdea: pickSelectedBigIdea(args.bigIdea),
    selectedOutline: pickSelectedOutline(args.outline),
    applications: args.applications,
  };
}

/**
 * For each section, the inputs that section depends on. Keep this list
 * focused — including too many inputs would make sections look stale on
 * every minor edit; including too few would let real drift go unnoticed.
 */
function sectionInputs(section: SectionKey, s: SectionInputSnapshot): unknown {
  switch (section) {
    case 'study':
      return { passage: s.passage, secondaryPassages: s.secondaryPassages };
    case 'bigIdea':
      return { passage: s.passage, study: s.study };
    case 'outline':
      return { passage: s.passage, study: s.study, bigIdea: s.selectedBigIdea };
    case 'manuscript':
      return {
        passage: s.passage,
        study: s.study,
        bigIdea: s.selectedBigIdea,
        outline: s.selectedOutline,
        outputFormat: s.outputFormat,
      };
    case 'applications':
      return { passage: s.passage, study: s.study, bigIdea: s.selectedBigIdea };
    case 'illustrations':
      return {
        passage: s.passage,
        bigIdea: s.selectedBigIdea,
        outline: s.selectedOutline,
      };
    case 'worshipIntegration':
      return {
        passage: s.passage,
        bigIdea: s.selectedBigIdea,
        outline: s.selectedOutline,
        applications: s.applications,
      };
    case 'smallGroupQuestions':
      return {
        passage: s.passage,
        bigIdea: s.selectedBigIdea,
        outline: s.selectedOutline,
        applications: s.applications,
      };
  }
}

export function computeSectionHash(
  section: SectionKey,
  snapshot: SectionInputSnapshot,
): string {
  return fnv1aHex(stableStringify(sectionInputs(section, snapshot)));
}

/**
 * Returns the set of sections whose stored input hash no longer matches
 * the live upstream inputs. Sections without a stored hash (legacy data)
 * are never reported as stale.
 */
export function staleSections(
  stored: SermonSectionHashes | null | undefined,
  snapshot: SectionInputSnapshot,
  hasContent: Record<SectionKey, boolean>,
): Set<SectionKey> {
  const out = new Set<SectionKey>();
  if (!stored) return out;
  for (const key of SECTION_KEYS) {
    if (!hasContent[key]) continue;
    const recorded = stored[key];
    if (!recorded) continue; // legacy → treat as current
    if (recorded !== computeSectionHash(key, snapshot)) out.add(key);
  }
  return out;
}

export function snapshotFromSermon(
  sermon: Sermon | null,
  fallback: { passage: string; secondaryPassages: string[]; outputFormat: string },
): SectionInputSnapshot {
  return buildSnapshot({
    passage: sermon?.passage ?? fallback.passage,
    secondaryPassages: sermon?.secondaryPassages ?? fallback.secondaryPassages,
    outputFormat: sermon?.outputFormat ?? fallback.outputFormat,
    study: sermon?.study ?? null,
    bigIdea: sermon?.bigIdea ?? null,
    outline: sermon?.outline ?? null,
    applications: sermon?.applications ?? null,
  });
}
