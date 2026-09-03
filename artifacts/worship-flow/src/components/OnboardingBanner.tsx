import { Link } from 'wouter';
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import {
  useGetMe,
  useListSermons,
  useListServicePlans,
} from '@workspace/api-client-react';

type Step = {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
};

/**
 * Three-step onboarding banner. Hidden once all three are complete.
 * State derives entirely from existing endpoints (no new schema):
 *   1. Church profile filled (church + leader names)
 *   2. At least one sermon OR service plan exists
 *   3. At least one service plan saved
 *
 * Step 2 catches the user who started a sermon but no service yet, and
 * step 3 nudges them across the line into a finished plan.
 */
export function OnboardingBanner() {
  const meQ = useGetMe();
  const sermonsQ = useListSermons();
  const servicesQ = useListServicePlans();

  const profile = meQ.data?.profile;
  const profileReady =
    !!(profile?.churchName ?? '').trim() &&
    !!(profile?.leaderName ?? '').trim();

  const sermons = sermonsQ.data ?? [];
  const services = servicesQ.data ?? [];
  const hasAnyContent = sermons.length > 0 || services.length > 0;
  const hasService = services.length > 0;

  // Wait for all queries to resolve before deciding to render — we don't
  // want to flash the banner for a returning user while their /me request
  // is still in flight.
  const stillLoading =
    meQ.isLoading || sermonsQ.isLoading || servicesQ.isLoading;
  if (stillLoading) return null;

  // Users who completed the onboarding wizard already set up their profile —
  // no need to show the checklist banner.
  if (
    meQ.data?.onboardingCompletedAt ||
    profileReady
  ) return null;

  const steps: Step[] = [
    {
      key: 'profile',
      label: 'Set up your profile',
      description:
        'Tell us your tradition, theology, and rhythms so the AI matches your context.',
      done: profileReady,
      href: '/church?next=/dashboard',
      cta: 'Set up profile',
    },
    {
      key: 'first-content',
      label: 'Draft your first sermon or service',
      description:
        'Pick a passage and let Sunday Studio draft your big idea, outline, or service flow.',
      done: hasAnyContent,
      href: '/sermons/new',
      cta: 'Start a sermon',
    },
    {
      key: 'first-service',
      label: 'Save a complete service plan',
      description:
        'Build out an order of worship and save it so your team can run with it.',
      done: hasService,
      href: '/service-builder',
      cta: 'Build a service',
    },
  ];

  if (steps.every((s) => s.done)) return null;

  const completed = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <section
      className="rounded-2xl border p-6 md:p-7"
      style={{
        backgroundColor: 'var(--worship-white)',
        borderColor: 'var(--worship-gold)',
      }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: 'var(--worship-pale-gold)',
              color: 'var(--worship-navy)',
            }}
          >
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-serif text-xl text-[var(--worship-navy)]">
              Get started with Sunday Studio
            </h2>
            <p className="text-sm text-[var(--worship-slate)]">
              {completed} of {steps.length} complete · a couple of minutes to a
              ready-to-run service.
            </p>
          </div>
        </div>
        {next && (
          <Link
            href={next.href}
            className="worship-btn-primary text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm"
          >
            {next.cta} <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.key}
            className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
              step.done ? 'opacity-60' : 'bg-[var(--worship-cream)]'
            }`}
          >
            <span
              className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                step.done
                  ? 'bg-[var(--worship-success)] text-white'
                  : 'bg-white border border-[var(--worship-border)] text-[var(--worship-navy)]'
              }`}
            >
              {step.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--worship-navy)]">
                {step.label}
              </div>
              <div className="text-xs text-[var(--worship-slate)] mt-0.5">
                {step.description}
              </div>
            </div>
            {!step.done && (
              <Link
                href={step.href}
                className="text-xs font-medium text-[var(--worship-gold)] hover:underline shrink-0 mt-1"
              >
                Open →
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
