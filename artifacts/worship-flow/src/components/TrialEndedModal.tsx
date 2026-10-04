import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Flame, Check, Loader2, X } from 'lucide-react';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { useCreateBillingCheckoutSession } from '@workspace/api-client-react';
import { toast } from 'sonner';
import { openExternalUrl } from '../mobile/nativeRuntime';

const SESSION_KEY = 'trialEndedModalSeen';

const FEATURES = [
  'Unlimited service plans & AI generators',
  'Sermon Builder with scholarly sources',
  'Song Assistant with your repertoire',
  'Liturgy, speaking moments & devotionals',
  'Soul Care sessions for personal & team',
  'Planning Center Services integration',
];

export function TrialEndedModal() {
  const { state, allowed, isLoading } = useSubscriptionStatus();
  const [open, setOpen] = useState(false);
  const checkout = useCreateBillingCheckoutSession();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (allowed) return;
    const lapsed = state?.kind === 'expired' || state?.kind === 'canceled';
    if (!lapsed) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    setOpen(true);
  }, [isLoading, allowed, state?.kind]);

  const onSubscribe = async () => {
    setLoading(true);
    try {
      const result = await checkout.mutateAsync();
      if (result?.url) {
        await openExternalUrl(result.url);
      } else {
        toast.error('Checkout could not be started.');
        setLoading(false);
      }
    } catch (err: unknown) {
      const data = (err as { data?: { error?: unknown } } | undefined)?.data;
      const msg =
        typeof data?.error === 'string' ? data.error : 'Could not start checkout.';
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md mx-auto rounded-2xl shadow-2xl overflow-hidden focus:outline-none"
          style={{ backgroundColor: 'var(--worship-white)' }}
        >
          <Dialog.Title className="sr-only">Trial ended — subscribe to continue</Dialog.Title>

          <div
            className="px-7 py-6 flex items-center gap-4"
            style={{ backgroundColor: 'var(--worship-navy)' }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--worship-gold)' }}
            >
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="font-serif text-xl font-semibold leading-snug"
                style={{ color: 'white' }}
              >
                {state?.kind === 'canceled'
                  ? 'Your subscription has ended'
                  : 'Your free trial has ended'}
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                All your work is saved — subscribe to keep going.
              </p>
            </div>
            <Dialog.Close asChild>
              <button
                className="rounded-lg p-1.5 transition-colors hover:bg-white/10 shrink-0"
                style={{ color: 'rgba(255,255,255,0.6)' }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-7 py-5" style={{ backgroundColor: 'var(--worship-cream)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--worship-slate)' }}>
              WHAT YOU HAD ACCESS TO
            </p>
            <ul className="space-y-2 mb-5">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm" style={{ color: 'var(--worship-charcoal)' }}>
                  <Check
                    className="w-4 h-4 shrink-0"
                    style={{ color: 'var(--worship-gold)' }}
                  />
                  {f}
                </li>
              ))}
            </ul>

            <div className="flex items-baseline gap-1.5 mb-5">
              <span
                className="text-3xl font-bold"
                style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}
              >
                $9.99
              </span>
              <span className="text-sm" style={{ color: 'var(--worship-muted-slate)' }}>
                / month — cancel any time
              </span>
            </div>

            <button
              type="button"
              onClick={onSubscribe}
              disabled={loading || checkout.isPending}
              className="w-full py-3 rounded-xl text-base font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--worship-navy)',
                color: 'white',
              }}
            >
              {loading || checkout.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting checkout…
                </>
              ) : (
                'Start subscription →'
              )}
            </button>

            <p className="text-xs text-center mt-3" style={{ color: 'var(--worship-muted-slate)' }}>
              Secure checkout via Stripe.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
