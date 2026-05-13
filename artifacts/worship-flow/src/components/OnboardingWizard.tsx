import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import {
  Layers,
  BookOpen,
  Music,
  Users,
  Heart,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';
import {
  useGetMe,
  useUpdateChurchProfile,
  useCompleteOnboarding,
  getGetMeQueryKey,
} from '@workspace/api-client-react';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const profileSchema = z.object({
  churchName: z.string().min(1, 'Church name is required'),
  leaderName: z.string().min(1, 'Your name is required'),
  leaderRole: z.string().optional(),
  denomination: z.string().optional(),
  musicStyle: z.string().optional(),
  theology: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

type PathId = 'service' | 'sermon' | 'songs' | 'devotional' | 'soul-care';

const PATHS: {
  id: PathId;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  cta: string;
}[] = [
  {
    id: 'service',
    Icon: Layers,
    title: "Plan this Sunday's service",
    description: 'Build a full order of worship in minutes',
    href: '/service-builder',
    cta: 'Open Service Builder',
  },
  {
    id: 'sermon',
    Icon: BookOpen,
    title: 'Start my sermon',
    description: 'Develop your passage from study notes to manuscript',
    href: '/sermons/new',
    cta: 'Open Sermon Builder',
  },
  {
    id: 'songs',
    Icon: Music,
    title: 'Find songs for worship',
    description: 'Discover songs matched to your style and tradition',
    href: '/generators/songs',
    cta: 'Explore Song Finder',
  },
  {
    id: 'devotional',
    Icon: Users,
    title: 'Create a team devotional',
    description: 'Generate a devotional for staff or small group',
    href: '/generators/devotional',
    cta: 'Open Devotional Generator',
  },
  {
    id: 'soul-care',
    Icon: Heart,
    title: 'Craft a Soul Care Practice',
    description: 'A guided practice to care for your own spiritual life',
    href: '/generators/soul-care',
    cta: 'Open Soul Care',
  },
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i + 1 <= current
              ? 'bg-[var(--worship-gold)] w-8'
              : 'bg-[var(--worship-border)] w-4'
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-[var(--worship-slate)]">
        Step {current} of {total}
      </span>
    </div>
  );
}

function Step1Profile({
  onNext,
  existingProfile,
}: {
  onNext: () => void;
  existingProfile: ProfileFormData | null;
}) {
  const updateProfile = useUpdateChurchProfile();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      churchName: existingProfile?.churchName ?? '',
      leaderName: existingProfile?.leaderName ?? '',
      leaderRole: existingProfile?.leaderRole ?? '',
      denomination: existingProfile?.denomination ?? '',
      musicStyle: existingProfile?.musicStyle ?? '',
      theology: existingProfile?.theology ?? '',
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    await new Promise<void>((resolve, reject) => {
      updateProfile.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
            resolve();
          },
          onError: reject,
        },
      );
    });
    onNext();
  };

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)] text-sm text-[var(--worship-charcoal)]';
  const labelClass = 'block text-xs font-semibold mb-1 text-[var(--worship-slate)] uppercase tracking-wide';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-2xl font-serif text-[var(--worship-navy)] mb-1">
          Tell us about yourself
        </h2>
        <p className="text-sm text-[var(--worship-slate)]">
          This helps Sunday Studio tailor every feature to your church's theology, tradition, and style.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Church Name <span className="text-red-400">*</span></label>
          <input {...register('churchName')} placeholder="Grace Community Church" className={inputClass} />
          {errors.churchName && (
            <p className="text-xs text-red-500 mt-1">{errors.churchName.message}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Your Name <span className="text-red-400">*</span></label>
          <input {...register('leaderName')} placeholder="Pastor John Smith" className={inputClass} />
          {errors.leaderName && (
            <p className="text-xs text-red-500 mt-1">{errors.leaderName.message}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>Your Role</label>
          <input
            {...register('leaderRole')}
            placeholder="e.g. Lead Pastor, Worship Pastor"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Denomination / Network</label>
          <input
            {...register('denomination')}
            placeholder="e.g. Non-denominational, ACNA"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Music Style</label>
          <input
            {...register('musicStyle')}
            placeholder="e.g. Modern Worship, Traditional Hymns"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Theological Bent</label>
          <input
            {...register('theology')}
            placeholder="e.g. Reformed, Charismatic, Liturgical"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSubmitting || updateProfile.isPending}
          className="worship-btn-primary px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {isSubmitting || updateProfile.isPending ? 'Saving...' : <>Next <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </form>
  );
}

function Step2Paths({
  selectedPath,
  onSelect,
  onNext,
  onSkip,
}: {
  selectedPath: PathId | null;
  onSelect: (id: PathId) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-serif text-[var(--worship-navy)] mb-1">
          What would you like to do first?
        </h2>
        <p className="text-sm text-[var(--worship-slate)]">
          Choose a starting point. You can explore everything else once you're in.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PATHS.map(({ id, Icon, title, description }) => {
          const selected = selectedPath === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                selected
                  ? 'border-[var(--worship-gold)] bg-[var(--worship-pale-gold)]'
                  : 'border-[var(--worship-border)] bg-[var(--worship-white)] hover:border-[var(--worship-gold)] hover:bg-[var(--worship-cream)]'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  selected
                    ? 'bg-[var(--worship-gold)] text-white'
                    : 'bg-[var(--worship-cream)] text-[var(--worship-navy)]'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--worship-navy)] leading-snug">
                  {title}
                </div>
                <div className="text-xs text-[var(--worship-slate)] mt-0.5">{description}</div>
              </div>
              {selected && (
                <div className="w-5 h-5 rounded-full bg-[var(--worship-gold)] flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-[var(--worship-slate)] hover:text-[var(--worship-navy)] underline"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!selectedPath}
          className="worship-btn-primary px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Step3Ready({
  selectedPath,
  onFinish,
  onSkip,
  isFinishing,
}: {
  selectedPath: PathId | null;
  onFinish: (href: string) => void;
  onSkip: () => void;
  isFinishing: boolean;
}) {
  const path = PATHS.find((p) => p.id === selectedPath);

  return (
    <div className="space-y-6 text-center py-4">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
        style={{ backgroundColor: 'var(--worship-pale-gold)' }}
      >
        <Check className="w-8 h-8 text-[var(--worship-gold)]" />
      </div>

      <div>
        <h2 className="text-2xl font-serif text-[var(--worship-navy)] mb-2">You're all set!</h2>
        <p className="text-[var(--worship-slate)] max-w-sm mx-auto leading-relaxed">
          Great! Your profile is saved. We will now tailor all of the features to your profile.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => onFinish(path?.href ?? '/dashboard')}
          disabled={isFinishing}
          className="worship-btn-primary px-8 py-3 rounded-xl font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {isFinishing ? (
            'Opening...'
          ) : (
            <>
              {path ? path.cta : 'Go to Dashboard'} <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={isFinishing}
          className="text-sm text-[var(--worship-slate)] hover:text-[var(--worship-navy)] underline underline-offset-2 disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

export function OnboardingWizard() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { data: me, isLoading: meLoading } = useGetMe({
    query: { enabled: authLoaded && !!isSignedIn, queryKey: getGetMeQueryKey() },
  });
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedPath, setSelectedPath] = useState<PathId | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const completeOnboarding = useCompleteOnboarding();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  if (!authLoaded || !isSignedIn) return null;
  if (meLoading) return null;
  if (dismissed) return null;
  if (me?.onboardingCompletedAt) return null;

  const existingProfile = me?.profile
    ? {
        churchName: me.profile.churchName ?? '',
        leaderName: me.profile.leaderName ?? '',
        leaderRole: me.profile.leaderRole ?? '',
        denomination: me.profile.denomination ?? '',
        musicStyle: me.profile.musicStyle ?? '',
        theology: me.profile.theology ?? '',
      }
    : null;

  const handleComplete = (href: string) => {
    completeOnboarding.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setDismissed(true);
        setLocation(href);
      },
    });
  };

  const handleSkip = () => {
    completeOnboarding.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setDismissed(true);
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: 'rgba(15, 20, 30, 0.7)' }}
    >
      <div className="flex min-h-full items-start justify-center p-4 pb-safe sm:items-center sm:py-8">
        <div
          className="relative w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
          style={{
            backgroundColor: 'var(--worship-white)',
            maxHeight: 'calc(100dvh - 2rem)',
          }}
        >
          {/* Header — stays pinned while body scrolls */}
          <div
            className="px-6 pt-6 pb-4 border-b flex items-center justify-between flex-shrink-0"
            style={{ borderColor: 'var(--worship-border)', backgroundColor: 'var(--worship-cream)' }}
          >
            <div className="flex items-center gap-3">
              <img src={`${basePath}/logo.svg`} alt="Sunday Studio" className="w-7 h-7" />
              <span className="font-serif text-[var(--worship-navy)] font-semibold">Sunday Studio</span>
            </div>
            <div className="flex items-center gap-4">
              <StepIndicator current={step} total={3} />
              {step > 1 && (
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-[var(--worship-slate)] hover:text-[var(--worship-navy)] transition-colors"
                  aria-label="Skip setup"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Body — scrolls independently on short screens */}
          <div className="p-6 md:p-8 overflow-y-auto flex-1 min-h-0">
            {step === 1 && (
              <Step1Profile
                onNext={() => setStep(2)}
                existingProfile={existingProfile}
              />
            )}
            {step === 2 && (
              <Step2Paths
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                onNext={() => setStep(3)}
                onSkip={handleSkip}
              />
            )}
            {step === 3 && (
              <Step3Ready
                selectedPath={selectedPath}
                onFinish={handleComplete}
                onSkip={handleSkip}
                isFinishing={completeOnboarding.isPending}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
