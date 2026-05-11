import { Link } from 'wouter';
import { Sparkles, CheckCircle2, Circle } from 'lucide-react';
import { useGetMe } from '@workspace/api-client-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from './ui/hover-card';

/**
 * Compact pill shown on generator pages to remind the pastor that their
 * profile context is shaping results. Only renders when at least one
 * depth-personalization field is filled (voice, mission, or focus areas).
 * Hover reveals which layers are active; clicking links to /church.
 */
export function PersonalizationChip() {
  const { data: me } = useGetMe();
  const profile = me?.profile;

  if (!profile) return null;

  const hasVoice = !!(
    (profile.toneDescription as string | null | undefined)?.trim() ||
    (profile.derivedToneDescription as string | null | undefined)?.trim()
  );
  const hasMission = !!(profile.missionStatement as string | null | undefined)?.trim();
  const hasFocus = Array.isArray(profile.focusAreas)
    ? (profile.focusAreas as string[]).length > 0
    : false;

  const anyActive = hasVoice || hasMission || hasFocus;
  if (!anyActive) return null;

  const churchName = (profile.churchName as string | null | undefined)?.trim() || null;

  const layers: { label: string; active: boolean }[] = [
    { label: 'Preaching voice', active: hasVoice },
    { label: 'Church mission', active: hasMission },
    { label: 'Ministry focus', active: hasFocus },
  ];

  const activeCount = layers.filter((l) => l.active).length;
  const allActive = activeCount === layers.length;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Link
          href="/church"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border bg-[var(--worship-cream)] text-[var(--worship-navy)] hover:bg-white transition-colors"
          style={{ borderColor: 'var(--worship-border)' }}
        >
          <Sparkles className="w-3 h-3 text-[var(--worship-gold)]" />
          {churchName ? `Personalized for ${churchName}` : 'Personalized'}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-64 p-3 text-sm">
        <div className="text-xs uppercase tracking-wider text-[var(--worship-slate)] mb-2.5 font-bold">
          Personalization active
        </div>
        <ul className="space-y-1.5 mb-3">
          {layers.map((layer) => (
            <li key={layer.label} className="flex items-center gap-2">
              {layer.active ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--worship-gold)] shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-[var(--worship-border)] shrink-0" />
              )}
              <span
                className={
                  layer.active
                    ? 'text-[var(--worship-charcoal)]'
                    : 'text-[var(--worship-muted-slate)]'
                }
              >
                {layer.label}
              </span>
            </li>
          ))}
        </ul>
        {!allActive && (
          <Link
            href="/church"
            className="inline-flex items-center gap-1 text-xs text-[var(--worship-navy)] underline"
          >
            Complete your profile →
          </Link>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
