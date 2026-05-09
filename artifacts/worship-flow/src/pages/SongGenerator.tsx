import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AppLayout } from '../components/layout/AppLayout';
import { Loader2, Music, AlertCircle, Star, Info, CalendarPlus } from 'lucide-react';
import {
  useCreateLibraryItem,
  useListLibraryItems,
  getListLibraryItemsQueryKey,
  type GeneratedSongs,
  type SongSuggestion,
  type LibraryItem,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useJobGenerate } from '../hooks/useJobGenerate';
import { ProfileRequiredBanner } from '../components/ProfileRequiredGate';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { AddToServiceDialog } from '../components/AddToServiceDialog';

type RepertoireMode = 'off' | 'prefer' | 'strict';

const SONG_PHASES = [
  'Reviewing your passage and theme…',
  'Checking your repertoire…',
  'Matching songs to your worship arc…',
  'Suggesting songs and explanations…',
];

/**
 * Tiny inline editor shown next to suggestions whose BPM the AI did not
 * return. Captures the typed value in parent state; the parent merges it
 * into the saved library item on Save (and also feeds the cross-church
 * crowdsource pool downstream).
 */
function BpmInlineEditor({
  index,
  value,
  onChange,
}: {
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-[var(--worship-cream)] text-[var(--worship-slate)] border border-dashed border-[var(--worship-border)]"
      data-testid={`bpm-editor-${index}`}
    >
      <span className="opacity-70">BPM</span>
      <input
        type="number"
        inputMode="numeric"
        min={30}
        max={300}
        step={1}
        placeholder="—"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-12 bg-transparent text-[var(--worship-navy)] font-medium outline-none focus:underline"
        aria-label="Set tempo"
        data-testid={`input-bpm-${index}`}
      />
    </span>
  );
}

const REPERTOIRE_OPTIONS: {
  value: RepertoireMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'prefer',
    label: 'Prefer',
    description: 'Lean on your repertoire, fill gaps with other songs.',
  },
  {
    value: 'strict',
    label: 'Strict',
    description: 'Only suggest songs your team already knows.',
  },
  {
    value: 'off',
    label: 'Off',
    description: "Ignore the repertoire — pick from anywhere.",
  },
];

export default function SongGenerator() {
  const MUSICAL_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'Ab', 'F#', 'Db'];

  const [formData, setFormData] = useState({
    theme: '',
    scripture: '',
    style: 'mixed (modern worship and hymns)',
    count: 5,
    repertoireMode: 'prefer' as RepertoireMode,
    alignmentNotes: '',
    // BPM range — empty strings mean "no constraint on that side". Stored
    // as strings so the user can clear the field naturally; coerced to
    // ints at submit time.
    bpmMin: '',
    bpmMax: '',
    // Preferred musical keys — empty means no preference.
    preferredKeys: [] as string[],
  });
  const ALIGNMENT_MAX = 4000;

  const generate = useJobGenerate<GeneratedSongs>('/api/generate/songs');
  const createLibraryItem = useCreateLibraryItem();
  const queryClient = useQueryClient();
  const lastSubmittedRef = useRef<typeof formData | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  useEffect(() => {
    if (!generate.isPending) { setPhaseIdx(0); return; }
    const t = setInterval(() => setPhaseIdx((i) => (i + 1) % SONG_PHASES.length), 3000);
    return () => clearInterval(t);
  }, [generate.isPending]);
  const { ready: profileReady } = useChurchProfileReady();
  const { allowed: subAllowed } = useSubscriptionStatus();
  // Per-row save tracking, keyed by song index in the current generation.
  // Reset on each fresh generation so we never reuse a stale id.
  const [savedSongs, setSavedSongs] = useState<Record<number, LibraryItem>>({});
  const [addToServiceIndex, setAddToServiceIndex] = useState<number | null>(null);
  // Per-row BPM the user has typed for songs the AI didn't have a verified
  // tempo for. Captured in the result card so it flows through to the
  // saved library item AND seeds the crowdsource pool on save. Reset on
  // each fresh generation alongside savedSongs.
  const [bpmDrafts, setBpmDrafts] = useState<Record<number, string>>({});
  // Per-row in-flight save promise so a quick Save + Add-to-service can't
  // create two library items for the same generated song.
  const songSavePromisesRef = useRef<Record<number, Promise<LibraryItem>>>({});

  // Drives the segmented control. Strict mode is meaningless without a
  // repertoire, so we disable it and downgrade to Prefer if the user picked
  // it before adding any songs.
  const repertoireQuery = useListLibraryItems({
    kind: 'song',
    repertoire: true,
  });
  const repertoireCount = repertoireQuery.data?.length ?? 0;
  const hasRepertoire = repertoireCount > 0;

  const runGeneration = (body?: typeof formData) => {
    if (!profileReady) {
      toast.error('Set up your profile first.', {
        description: 'Music style suggestions depend on it.',
      });
      return;
    }
    const payload = body ?? lastSubmittedRef.current ?? formData;
    // Strict is the only mode that's truly unsatisfiable with an empty
    // repertoire — downgrade to Prefer so the user keeps the default
    // behavior and the server can still emit its helpful "repertoire empty"
    // notice. Prefer/Off pass through untouched.
    const safeMode: RepertoireMode =
      payload.repertoireMode === 'strict' && !hasRepertoire
        ? 'prefer'
        : payload.repertoireMode;
    const safePayload = { ...payload, repertoireMode: safeMode };
    lastSubmittedRef.current = safePayload;
    setSavedSongs({});
    setBpmDrafts({});
    songSavePromisesRef.current = {};
    const trimmedAlignment = safePayload.alignmentNotes.trim();
    // Coerce the BPM bounds. Empty / non-numeric / out-of-range values
    // simply drop the constraint on that side; the server normalizes
    // reversed bounds.
    const parseBpm = (raw: string): number | undefined => {
      const t = raw.trim();
      if (!t) return undefined;
      const n = Number(t);
      if (!Number.isFinite(n)) return undefined;
      const r = Math.round(n);
      if (r < 30 || r > 300) return undefined;
      return r;
    };
    const bpmMin = parseBpm(safePayload.bpmMin);
    const bpmMax = parseBpm(safePayload.bpmMax);
    const requestBody = {
      theme: safePayload.theme,
      scripture: safePayload.scripture || undefined,
      style: safePayload.style,
      count: safePayload.count,
      repertoireMode: safePayload.repertoireMode,
      ...(trimmedAlignment ? { alignmentNotes: trimmedAlignment.slice(0, ALIGNMENT_MAX) } : {}),
      ...(bpmMin !== undefined ? { bpmMin } : {}),
      ...(bpmMax !== undefined ? { bpmMax } : {}),
      ...(safePayload.preferredKeys.length > 0 ? { preferredKeys: safePayload.preferredKeys } : {}),
    };
    generate.mutate(requestBody).catch((err: Error) => {
      toast.error(err.message || 'Generation failed. Please try again.');
    });
  };

  const buildSongPayload = (index: number, song: SongSuggestion) => {
    const alignmentNotes = generate.data?.alignmentNotes;
    // If the AI didn't return a tempo and the user typed one in the result
    // card, fold it into the saved content so the row lands in the library
    // already complete (and the crowdsource pool gets a sample).
    const draft = bpmDrafts[index]?.trim();
    const draftBpm = draft ? Number(draft) : NaN;
    const overrideBpm =
      typeof song.bpm !== 'number' &&
      Number.isFinite(draftBpm) &&
      draftBpm >= 30 &&
      draftBpm <= 300
        ? Math.round(draftBpm)
        : undefined;
    return {
      kind: 'song' as const,
      title: song.title,
      content: {
        ...song,
        ...(overrideBpm !== undefined ? { bpm: overrideBpm } : {}),
        ...(alignmentNotes ? { alignmentNotes } : {}),
      },
      tags: [song.style ?? 'Song', ...(song.themes ?? [])],
    };
  };

  const ensureSongSaved = (index: number, song: SongSuggestion) => (): Promise<LibraryItem> => {
    const existing = savedSongs[index];
    if (existing) return Promise.resolve(existing);
    const inFlight = songSavePromisesRef.current[index];
    if (inFlight) return inFlight;
    const promise = (async () => {
      try {
        const item = await createLibraryItem.mutateAsync({ data: buildSongPayload(index, song) });
        queryClient.invalidateQueries({ queryKey: getListLibraryItemsQueryKey() });
        setSavedSongs((prev) => ({ ...prev, [index]: item }));
        return item;
      } finally {
        delete songSavePromisesRef.current[index];
      }
    })();
    songSavePromisesRef.current[index] = promise;
    return promise;
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.theme) {
      toast.error('Please provide a theme or topic.');
      return;
    }
    runGeneration({ ...formData });
  };

  const handleSaveSingle = (index: number, song: SongSuggestion) => {
    if (savedSongs[index]) return;
    ensureSongSaved(index, song)()
      .then(() => toast.success(`"${song.title}" saved to Library`))
      .catch((err: Error) => toast.error(err.message || "Could not save"));
  };

  return (
    <AppLayout title="Song Assistant">
      <ProfileRequiredBanner variant="inline" />
      <div className="flex flex-col md:flex-row gap-8 h-auto min-h-[calc(100vh-8rem)]">
        {/* FORM */}
        <div className="w-full md:w-1/3 flex flex-col space-y-6">
          <div className="pb-4 border-b border-[var(--worship-border)]">
            <h2 className="text-xl font-serif text-[var(--worship-navy)]">
              Find Songs
            </h2>
            <p className="text-sm text-[var(--worship-slate)] mt-1">
              Discover songs that fit your thematic arc.
            </p>
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">
                THEME / TOPIC *
              </label>
              <input
                type="text"
                value={formData.theme}
                onChange={(e) =>
                  setFormData({ ...formData, theme: e.target.value })
                }
                placeholder="e.g. Surrender, Holy Spirit, Resurrection"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
                required
                data-testid="input-theme"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">
                SCRIPTURE (OPTIONAL)
              </label>
              <input
                type="text"
                value={formData.scripture}
                onChange={(e) =>
                  setFormData({ ...formData, scripture: e.target.value })
                }
                placeholder="e.g. Psalm 51"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">
                STYLE PREFERENCE
              </label>
              <select
                value={formData.style}
                onChange={(e) =>
                  setFormData({ ...formData, style: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
              >
                <option value="mixed (modern worship and hymns)">Mixed</option>
                <option value="modern worship (e.g. Hillsong, Elevation)">
                  Modern Worship
                </option>
                <option value="traditional hymns">Traditional Hymns</option>
                <option value="gospel / contemporary black church">
                  Gospel
                </option>
                <option value="acoustic / stripped down">
                  Acoustic / Folk
                </option>
              </select>
            </div>

            <div>
              <div className="flex justify-between">
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">
                  NUMBER OF SONGS
                </label>
                <span className="text-xs text-[var(--worship-gold)] font-medium">
                  {formData.count}
                </span>
              </div>
              <input
                type="range"
                min="3"
                max="10"
                value={formData.count}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    count: parseInt(e.target.value),
                  })
                }
                className="w-full accent-[var(--worship-gold)]"
              />
            </div>

            {/* Optional tempo range. Either bound can be left blank; the
                server clamps to 30-300 and swaps reversed bounds. */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--worship-slate)]">
                  TEMPO RANGE (BPM)
                </label>
                {(formData.bpmMin || formData.bpmMax) && (
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, bpmMin: '', bpmMax: '' })
                    }
                    className="text-[10px] text-[var(--worship-slate)] hover:text-[var(--worship-navy)] underline"
                    data-testid="button-clear-bpm-range"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={30}
                  max={300}
                  step={1}
                  placeholder="Min"
                  value={formData.bpmMin}
                  onChange={(e) =>
                    setFormData({ ...formData, bpmMin: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm"
                  data-testid="input-bpm-min"
                />
                <span className="text-[var(--worship-muted-slate)]">–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={30}
                  max={300}
                  step={1}
                  placeholder="Max"
                  value={formData.bpmMax}
                  onChange={(e) =>
                    setFormData({ ...formData, bpmMax: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm"
                  data-testid="input-bpm-max"
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-[var(--worship-slate)]">
                Optional. Leave a side blank for no limit. Range 30–300.
              </p>
            </div>

            {/* Preferred musical keys chip selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--worship-slate)]">
                  PREFERRED KEYS
                </label>
                {formData.preferredKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, preferredKeys: [] })}
                    className="text-[10px] text-[var(--worship-slate)] hover:text-[var(--worship-navy)] underline"
                    data-testid="button-clear-keys"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preferred musical keys">
                {MUSICAL_KEYS.map((k) => {
                  const selected = formData.preferredKeys.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        const next = selected
                          ? formData.preferredKeys.filter((pk) => pk !== k)
                          : [...formData.preferredKeys, k];
                        setFormData({ ...formData, preferredKeys: next });
                      }}
                      data-testid={`button-key-${k}`}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                        selected
                          ? 'bg-[var(--worship-navy)] text-white border-[var(--worship-navy)]'
                          : 'bg-white text-[var(--worship-slate)] border-[var(--worship-border)] hover:border-[var(--worship-navy)] hover:text-[var(--worship-navy)]'
                      }`}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-[var(--worship-slate)]">
                Optional. Bias suggestions toward these keys; other keys are fine when no fit exists.
              </p>
            </div>

            {/* Repertoire mode — only meaningful when the user has marked
                some songs as repertoire. */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--worship-slate)]">
                  USE MY REPERTOIRE
                </label>
                <span className="text-[10px] text-[var(--worship-muted-slate)]">
                  {hasRepertoire
                    ? `${repertoireCount} song${repertoireCount === 1 ? '' : 's'}`
                    : 'none yet'}
                </span>
              </div>
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[var(--worship-cream)] border border-[var(--worship-border)]"
                role="radiogroup"
                aria-label="Repertoire mode"
              >
                {REPERTOIRE_OPTIONS.map((opt) => {
                  const disabled = opt.value === 'strict' && !hasRepertoire;
                  // Reflect the user's actual selection. The only quiet
                  // downgrade is Strict→Prefer when the repertoire is empty
                  // (handled at submit time) so the segmented control mirrors
                  // what will actually be sent.
                  const isSelected =
                    formData.repertoireMode === opt.value && !disabled;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={disabled}
                      onClick={() =>
                        setFormData({ ...formData, repertoireMode: opt.value })
                      }
                      title={
                        disabled
                          ? 'Add songs to your repertoire to use Strict mode.'
                          : opt.description
                      }
                      data-testid={`button-repertoire-${opt.value}`}
                      className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        isSelected
                          ? 'bg-white text-[var(--worship-navy)] shadow-sm'
                          : 'text-[var(--worship-slate)] hover:text-[var(--worship-navy)]'
                      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-[var(--worship-slate)]">
                {!hasRepertoire ? (
                  <>
                    Your repertoire is empty.{' '}
                    <Link
                      href="/library"
                      className="text-[var(--worship-gold)] underline underline-offset-2"
                    >
                      Add songs in the Library
                    </Link>{' '}
                    to enable Strict mode.
                  </>
                ) : (
                  REPERTOIRE_OPTIONS.find(
                    (o) => o.value === formData.repertoireMode,
                  )?.description
                )}
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="block text-xs font-semibold text-[var(--worship-slate)]">ALIGNMENT NOTES (OPTIONAL)</label>
                <span className={`text-[10px] ${formData.alignmentNotes.length > ALIGNMENT_MAX ? 'text-red-600' : 'text-[var(--worship-muted-slate)]'}`}>
                  {formData.alignmentNotes.length}/{ALIGNMENT_MAX}
                </span>
              </div>
              <textarea
                value={formData.alignmentNotes}
                onChange={e => setFormData({ ...formData, alignmentNotes: e.target.value.slice(0, ALIGNMENT_MAX) })}
                placeholder="Paste sermon notes, source text, or other material the song picks should echo."
                rows={4}
                data-testid="input-alignment-notes"
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-white focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm leading-relaxed resize-y"
              />
              <p className="text-[10px] text-[var(--worship-muted-slate)] mt-1 italic">
                Song lyrics will be paraphrased, not copied verbatim, to honor copyright.
              </p>
            </div>

            <button
              type="submit"
              disabled={generate.isPending || !profileReady || !subAllowed}
              title={
                !subAllowed
                  ? 'Subscribe to enable AI generation'
                  : !profileReady
                  ? 'Finish your profile to enable AI generation'
                  : undefined
              }
              className="w-full py-3 rounded-xl font-medium text-white worship-btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-find-songs"
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Digging into the
                  hymnal...
                </>
              ) : (
                'Find Songs'
              )}
            </button>
          </form>
        </div>

        {/* OUTPUT */}
        <div className="w-full md:w-2/3 bg-white rounded-2xl border border-[var(--worship-border)] shadow-sm relative min-h-[400px]">
          {!generate.data && !generate.isPending && !generate.error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
              <Music className="w-12 h-12 text-[var(--worship-gold)] opacity-50 mb-4" />
              <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">
                Awaiting context
              </h3>
              <p className="text-[var(--worship-slate)] max-w-sm text-sm">
                Set your theme and preferences to discover theologically
                grounded songs.
              </p>
            </div>
          )}

          {generate.isPending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-[var(--worship-cream)]/80 backdrop-blur-sm rounded-2xl z-10">
              <div className="w-full max-w-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 font-semibold text-sm text-[var(--worship-navy)]">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    {SONG_PHASES[phaseIdx % SONG_PHASES.length]}
                  </div>
                  <button
                    type="button"
                    onClick={() => generate.reset()}
                    className="text-xs text-[var(--worship-slate)] hover:text-[var(--worship-navy)] px-2 py-1 rounded hover:bg-[var(--worship-sand)] transition-colors shrink-0"
                  >
                    Cancel
                  </button>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden mb-4" style={{ backgroundColor: 'var(--worship-sand)' }}>
                  <div style={{ height: '100%', width: '38%', backgroundColor: 'var(--worship-gold)', borderRadius: '9999px', animation: 'genProgressSlide 1.8s ease-in-out infinite' }} />
                </div>
                <p className="text-xs italic leading-relaxed text-center" style={{ color: 'var(--worship-slate)' }}>
                  Taking time to be thorough — this usually takes 20–30 seconds.
                </p>
              </div>
            </div>
          )}

          {generate.error && !generate.isPending && !generate.data && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[var(--worship-cream)] rounded-2xl">
              <AlertCircle className="w-12 h-12 text-red-500 opacity-80 mb-4" />
              <h3 className="font-serif text-xl text-[var(--worship-navy)] mb-2">
                Generation failed
              </h3>
              <p className="text-[var(--worship-slate)] max-w-sm text-sm mb-5">
                {generate.error.message}
              </p>
              <button
                onClick={() => runGeneration()}
                className="px-5 py-2.5 rounded-lg font-medium text-sm worship-btn-primary text-white"
              >
                Try again
              </button>
            </div>
          )}

          {generate.data && !generate.isPending && (
            <div className="p-4 sm:p-6 h-full flex flex-col">
              <div className="flex flex-wrap justify-between items-center mb-4 sm:mb-6 gap-2">
                <div className="min-w-0">
                  <h2 className="text-xl font-serif text-[var(--worship-navy)]">
                    Suggested Songs
                  </h2>
                  <p className="text-sm text-[var(--worship-slate)]">
                    Theme:{' '}
                    <span className="italic">{generate.data.theme}</span>
                  </p>
                </div>
              </div>

              {generate.data.notice && (
                <div
                  className="mb-4 flex gap-2 p-3 rounded-lg bg-[var(--worship-pale-gold)] border border-[var(--worship-gold)]/40 text-sm text-[var(--worship-charcoal)]"
                  data-testid="banner-notice"
                >
                  <Info className="w-4 h-4 mt-0.5 shrink-0 text-[var(--worship-gold)]" />
                  <p>{generate.data.notice}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {generate.data.songs.map((song, i) => (
                  <div
                    key={i}
                    className="p-5 border border-[var(--worship-border)] rounded-xl hover:border-[var(--worship-gold)] transition-colors bg-white"
                    data-testid={`card-song-${i}`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-serif font-medium text-[var(--worship-navy)]">
                            {song.title}
                          </h3>
                          {song.inRepertoire && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-bold"
                              data-testid={`badge-in-repertoire-${i}`}
                            >
                              <Star className="w-3 h-3 fill-current" /> In
                              your repertoire
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--worship-slate)] font-medium mb-3">
                          {song.artist}
                        </p>

                        <div className="flex flex-wrap gap-2 mb-4">
                          {song.style && (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--worship-cream)] text-[var(--worship-slate)] border border-[var(--worship-border)]">
                              {song.style}
                            </span>
                          )}
                          {typeof song.bpm === 'number' ? (
                            <span
                              className="text-xs px-2 py-0.5 rounded-md bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] font-medium border border-[var(--worship-pale-gold)]"
                              data-testid={`badge-bpm-${i}`}
                            >
                              {song.bpm} BPM
                            </span>
                          ) : (
                            <BpmInlineEditor
                              index={i}
                              value={bpmDrafts[i] ?? ''}
                              onChange={(v) =>
                                setBpmDrafts((prev) => ({ ...prev, [i]: v }))
                              }
                            />
                          )}
                          {song.key && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-md font-medium border ${
                                song.keyFromLibrary
                                  ? 'bg-[var(--worship-pale-gold)] text-[var(--worship-gold)] border-[var(--worship-pale-gold)]'
                                  : 'bg-[var(--worship-cream)] text-[var(--worship-slate)] border-[var(--worship-border)]'
                              }`}
                              title={song.keyFromLibrary ? 'Key confirmed from your library' : 'Key suggested by AI'}
                              data-testid={`badge-key-${i}`}
                            >
                              Key: {song.key}{song.keyFromLibrary ? ' ✓' : ''}
                            </span>
                          )}
                          {song.themes?.map((t) => (
                            <span
                              key={t}
                              className="text-xs px-2 py-0.5 rounded-md bg-[var(--worship-sand)] text-[var(--worship-navy)]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>

                        <p className="text-sm italic font-serif text-[var(--worship-charcoal)] leading-relaxed">
                          "{song.whyItFits}"
                        </p>
                      </div>

                      <div className="shrink-0 flex flex-col gap-1.5">
                        <button
                          onClick={() => handleSaveSingle(i, song)}
                          disabled={!!savedSongs[i]}
                          className="px-3 py-1.5 text-xs font-medium border border-[var(--worship-border)] rounded-lg text-[var(--worship-charcoal)] hover:bg-[var(--worship-cream)] hover:text-[var(--worship-navy)] transition-colors disabled:opacity-60"
                          data-testid={`button-save-song-${i}`}
                        >
                          {savedSongs[i] ? 'Saved' : 'Save'}
                        </button>
                        <button
                          onClick={() => setAddToServiceIndex(i)}
                          className="px-3 py-1.5 text-xs font-medium border border-[var(--worship-border)] rounded-lg text-[var(--worship-charcoal)] hover:bg-[var(--worship-cream)] hover:text-[var(--worship-navy)] transition-colors flex items-center gap-1"
                          data-testid={`button-add-song-to-service-${i}`}
                        >
                          <CalendarPlus className="w-3 h-3" /> Add to service
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {addToServiceIndex !== null && generate.data?.songs[addToServiceIndex] && (
        <AddToServiceDialog
          open={addToServiceIndex !== null}
          onClose={() => setAddToServiceIndex(null)}
          kind="song"
          ensureSaved={ensureSongSaved(
            addToServiceIndex,
            generate.data.songs[addToServiceIndex]!,
          )}
        />
      )}
    </AppLayout>
  );
}
