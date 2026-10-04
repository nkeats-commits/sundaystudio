import { useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import {
  useGetServicePlan,
  getGetServicePlanQueryKey,
  useExportServicePlan,
} from '@workspace/api-client-react';
import { isNativeApp, shareTextFile } from '../mobile/nativeRuntime';
import { toast } from 'sonner';

/**
 * Single-column print-friendly view of a service plan. Calls
 * `window.print()` once the data has loaded so the user lands directly
 * in their browser's print dialog (which doubles as "Save as PDF").
 *
 * Rendered outside AppLayout so there's no sidebar/header to suppress.
 * `worship-print-page` styles in index.css strip browser chrome margins
 * and force black-on-white when printed.
 */
export default function ServicePlanPrint() {
  const [, params] = useRoute('/services/:id/print');
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id) : 0;
  const exportPlan = useExportServicePlan();
  const { data: service, isLoading } = useGetServicePlan(id, {
    query: { enabled: !!id, queryKey: getGetServicePlanQueryKey(id) },
  });

  useEffect(() => {
    if (!service || isNativeApp()) return;
    // Defer one frame so layout settles before the print dialog snapshots.
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        // ignore — user can use the on-page button.
      }
    }, 250);
    return () => clearTimeout(t);
  }, [service]);

  const sharePlan = async () => {
    try {
      const exported = await exportPlan.mutateAsync({
        id,
        data: { format: 'markdown' },
      });
      await shareTextFile(
        'Service plan',
        exported.content,
        `service-plan-${id}.md`,
      );
      toast.success('Service plan ready to share');
    } catch {
      toast.error('Could not share service plan');
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-500">Loading service…</div>
    );
  }
  if (!service) {
    return (
      <div className="p-12 text-center text-slate-500">
        Service not found.
      </div>
    );
  }

  const c = service.content;
  const order = c.order ?? [];
  const dateStr = service.serviceDate
    ? new Date(service.serviceDate).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unscheduled';

  return (
    <div className="worship-print-page bg-white text-slate-900 min-h-screen">
      <div className="worship-print-toolbar print:hidden flex items-center justify-between gap-4 px-6 py-3 border-b border-slate-200 bg-slate-50">
        <button
          onClick={() => setLocation(`/services/${id}`)}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to service
        </button>
        <div className="flex items-center gap-2">
          {isNativeApp() ? (
            <button
              onClick={() => void sharePlan()}
              disabled={exportPlan.isPending}
              className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
            >
              {exportPlan.isPending ? 'Preparing…' : 'Share / export plan'}
            </button>
          ) : (
            <button
              onClick={() => window.print()}
              className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              Print / Save as PDF
            </button>
          )}
        </div>
      </div>
      {isNativeApp() && (
        <p className="worship-print-toolbar print:hidden px-6 py-3 text-sm text-slate-600">
          Printing is not available inside the app. Share the Markdown file to save, print, or send this plan.
        </p>
      )}

      <article className="max-w-3xl mx-auto px-10 py-12 worship-print-article">
        <header className="text-center mb-10 pb-6 border-b border-slate-300">
          <h1
            className="text-4xl mb-3"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {service.title}
          </h1>
          <p className="text-sm uppercase tracking-widest text-slate-600 mb-2">
            {dateStr}
            {service.scripture ? ` · ${service.scripture}` : ''}
          </p>
          {(service.theme || service.season) && (
            <p className="text-sm text-slate-500 italic">
              {[service.theme, service.season].filter(Boolean).join(' — ')}
            </p>
          )}
        </header>

        {c.notes && (
          <Section title="Pastoral Notes">
            <p className="whitespace-pre-wrap leading-relaxed">{c.notes}</p>
          </Section>
        )}

        {c.callToWorship && (
          <Section title="Call to Worship">
            <p
              className="whitespace-pre-wrap italic leading-relaxed"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {c.callToWorship}
            </p>
          </Section>
        )}

        {c.openingPrayer && (
          <Section title="Opening Prayer">
            <p
              className="whitespace-pre-wrap italic leading-relaxed"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {c.openingPrayer}
            </p>
          </Section>
        )}

        {c.scriptureReading && (
          <Section title="Scripture Reading">
            <p className="whitespace-pre-wrap leading-relaxed">
              {c.scriptureReading}
            </p>
          </Section>
        )}

        {c.confession && (
          <Section title="Confession">
            <p
              className="whitespace-pre-wrap italic leading-relaxed"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {c.confession}
            </p>
          </Section>
        )}

        {c.assurance && (
          <Section title="Assurance">
            <p
              className="whitespace-pre-wrap italic leading-relaxed"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {c.assurance}
            </p>
          </Section>
        )}

        {order.length > 0 && (
          <Section title="Order of Service">
            <ol className="space-y-5 list-none p-0">
              {order.map((item, i) => (
                <li
                  key={item.id || i}
                  className="border-l-2 border-slate-300 pl-4"
                >
                  <div className="flex justify-between items-baseline gap-3 mb-1">
                    <h3
                      className="text-lg font-semibold"
                      style={{ fontFamily: 'var(--font-serif)' }}
                    >
                      {i + 1}. {item.title}
                    </h3>
                    <span className="text-xs uppercase tracking-wider text-slate-500 shrink-0">
                      {item.kind.replace(/_/g, ' ')}
                      {item.durationMinutes ? ` · ${item.durationMinutes}m` : ''}
                    </span>
                  </div>
                  {item.body && (
                    <p className="whitespace-pre-wrap leading-relaxed text-slate-700 mt-2">
                      {item.body}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {c.sermonNotes && (
          <Section title="Sermon Notes">
            <p className="whitespace-pre-wrap leading-relaxed">
              {c.sermonNotes}
            </p>
          </Section>
        )}

        {c.benediction && (
          <Section title="Benediction">
            <p
              className="whitespace-pre-wrap italic leading-relaxed"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {c.benediction}
            </p>
          </Section>
        )}

        <footer className="mt-12 pt-4 border-t border-slate-200 text-xs text-slate-400 text-center print:block">
          Prepared with Sunday Studio
        </footer>
      </article>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10 worship-print-section">
      <h2
        className="text-xl mb-3 pb-2 border-b border-slate-200"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {title}
      </h2>
      <div className="text-base text-slate-800">{children}</div>
    </section>
  );
}
