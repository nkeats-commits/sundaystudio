import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { AppLayout } from '../components/layout/AppLayout';
import { Loader2, Music, AlertCircle, Star, Info } from 'lucide-react';
import {
  useCreateLibraryItem,
  useListLibraryItems,
  getListLibraryItemsQueryKey,
  type GeneratedSongs,
  type SongSuggestion,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useStreamingGenerate } from '../hooks/useStreamingGenerate';
import { ProfileRequiredBanner } from '../components/ProfileRequiredGate';
import { useChurchProfileReady } from '../hooks/useChurchProfileReady';

type RepertoireMode = 'off' | 'prefer' | 'strict';

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
  const [formData, setFormData] = useState({
    theme: '',
    scripture: '',
    style: 'mixed (modern worship and hymns)',
    count: 5,
    repertoireMode: 'prefer' as RepertoireMode,
  });

  const generate = useStreamingGenerate<GeneratedSongs>('/api/generate/songs');
  const createLibraryItem = useCreateLibraryItem();
  const queryClient = useQueryClient();
  const lastSubmittedRef = useRef<typeof formData | null>(null);
  const { ready: profileReady } = useChurchProfileReady();

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
      toast.error('Set up your church profile first.', {
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
    generate.mutate(safePayload).catch((err: Error) => {
      toast.error(err.message || 'Generation failed. Please try again.');
    });
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.theme) {
      toast.error('Please provide a theme or topic.');
      return;
    }
    runGeneration({ ...formData });
  };

  const handleSaveSingle = (song: SongSuggestion) => {
    createLibraryItem.mutate(
      {
        data: {
          kind: 'song',
          title: song.title,
          content: { ...song },
          tags: [song.style ?? 'Song', ...(song.themes ?? [])],
        },
      },
      {
        onSuccess: () => {
          toast.success(`"${song.title}" saved to Library`);
          queryClient.invalidateQueries({
            queryKey: getListLibraryItemsQueryKey(),
          });
        },
      },
    );
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

            <button
              type="submit"
              disabled={generate.isPending || !profileReady}
              title={
                !profileReady
                  ? 'Finish your church profile to enable AI generation'
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
            <div className="absolute inset-0 flex flex-col p-8 bg-[var(--worship-cream)]/80 backdrop-blur-sm rounded-2xl z-10">
              <div className="flex flex-col items-center text-center mb-4">
                <Loader2 className="w-10 h-10 animate-spin text-[var(--worship-gold)] mb-4" />
                <h3 className="font-serif text-xl text-[var(--worship-navy)]">
                  Finding the perfect songs...
                </h3>
                {generate.partialText.length > 0 && (
                  <p className="text-xs text-[var(--worship-slate)] mt-2">
                    {generate.partialText.length} characters received
                  </p>
                )}
              </div>
              {generate.partialText.length > 0 && (
                <div className="flex-1 overflow-y-auto rounded-lg bg-white/70 border border-[var(--worship-border)] p-4 text-sm font-mono text-[var(--worship-charcoal)] whitespace-pre-wrap leading-relaxed">
                  {generate.partialText}
                </div>
              )}
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
            <div className="p-6 h-full flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <div>
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
                      <div>
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

                      <button
                        onClick={() => handleSaveSingle(song)}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium border border-[var(--worship-border)] rounded-lg text-[var(--worship-charcoal)] hover:bg-[var(--worship-cream)] hover:text-[var(--worship-navy)] transition-colors"
                        data-testid={`button-save-song-${i}`}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
