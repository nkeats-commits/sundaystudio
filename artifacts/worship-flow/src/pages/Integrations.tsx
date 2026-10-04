import { AppLayout } from '../components/layout/AppLayout';
import {
  useGetPcsStatus,
  useGetPcsServiceTypes,
  useCreatePcsConnectUrl,
  useSyncPcsSongs,
  useDisconnectPcs,
  getGetPcsStatusQueryKey,
  getListLibraryItemsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { openExternalUrl } from '../mobile/nativeRuntime';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Link2,
  Loader2,
  RefreshCw,
  Unlink,
} from 'lucide-react';

/**
 * Integrations page: Planning Center Services OAuth connection + sync.
 *
 * The connect flow lives partly outside React Query because the OAuth
 * round-trip is a full-page navigation: we POST to create-url, then
 * `window.location.assign` to PCO. PCO eventually 302s the browser back
 * to /api/integrations/pcs/callback, which redirects back here with
 * `?pcs=ok` (or `?pcs=error&message=...`). The effect at the top of this
 * component reads those params and shows a toast.
 *
 * Sync filters (optional):
 *  - serviceTypeIds: only import songs used in the selected service types.
 *  - lastUsedSince: only import songs used since the given ISO date.
 */
export default function Integrations() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const status = useGetPcsStatus();
  const connect = useCreatePcsConnectUrl();
  const sync = useSyncPcsSongs();
  const disconnect = useDisconnectPcs();

  // Sync filter state.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedServiceTypeIds, setSelectedServiceTypeIds] = useState<string[]>([]);
  const [lastUsedSince, setLastUsedSince] = useState('');

  // Only fetch service types when the user is connected and has opened filters.
  const serviceTypes = useGetPcsServiceTypes({
    query: {
      queryKey: ['pcs-service-types'],
      enabled: Boolean(status.data?.connected) && filtersOpen,
      staleTime: 5 * 60 * 1000,
    },
  });

  const search = typeof window === 'undefined' ? '' : window.location.search;
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const pcsResult = params.get('pcs');
  const pcsMessage = params.get('message');

  // Surface OAuth callback results once on mount, then strip the params.
  useEffect(() => {
    if (!pcsResult) return;
    if (pcsResult === 'ok') {
      toast.success('Planning Center connected. Songs are syncing.');
      void Promise.all([
        qc.invalidateQueries({ queryKey: getGetPcsStatusQueryKey() }),
        qc.invalidateQueries({ queryKey: getListLibraryItemsQueryKey() }),
      ]);
    } else {
      toast.error(`Planning Center connection failed: ${pcsMessage ?? 'Unknown error'}`);
    }
    navigate('/settings/integrations', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcsResult]);

  const handleConnect = async () => {
    try {
      const { authUrl } = await connect.mutateAsync();
      await openExternalUrl(authUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start connection';
      toast.error(msg);
    }
  };

  const handleSync = async () => {
    try {
      // Build the optional filter body — only include keys that are actually set.
      const filterBody: { serviceTypeIds?: string[]; lastUsedSince?: string } = {};
      if (selectedServiceTypeIds.length > 0) {
        filterBody.serviceTypeIds = selectedServiceTypeIds;
      }
      if (lastUsedSince) {
        filterBody.lastUsedSince = lastUsedSince;
      }

      const r = await sync.mutateAsync({ data: filterBody });
      const hasFilters = !!(filterBody.serviceTypeIds || filterBody.lastUsedSince);

      let message: string;
      if (r.serviceTypeFilterSkipped) {
        // Service-type filter resolved to 0 — server imported all songs instead
        const countNote = `${r.total} song${r.total === 1 ? '' : 's'}`;
        message =
          `Could not apply service type filter — imported all ${countNote} instead ` +
          `(${r.inserted} new, ${r.updated} updated).`;
      } else if (r.total === 0) {
        if (hasFilters) {
          message =
            'No songs matched your filters — try broadening your selection or syncing without filters.';
        } else {
          message = 'No songs found in your Planning Center library.';
        }
      } else {
        const filterNote = hasFilters ? ' (filtered)' : '';
        message = `Synced ${r.total} song${r.total === 1 ? '' : 's'}${filterNote} (${r.inserted} new, ${r.updated} updated).`;
      }

      toast.success(message);
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetPcsStatusQueryKey() }),
        qc.invalidateQueries({ queryKey: getListLibraryItemsQueryKey() }),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      toast.error(msg);
    }
  };

  const handleDisconnect = async () => {
    if (
      !window.confirm(
        'Disconnect Planning Center? Your imported songs will stay in your library, but updates will stop syncing until you reconnect.',
      )
    ) {
      return;
    }
    try {
      await disconnect.mutateAsync();
      toast.success('Planning Center disconnected.');
      await qc.invalidateQueries({ queryKey: getGetPcsStatusQueryKey() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  const toggleServiceType = (id: string) => {
    setSelectedServiceTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const s = status.data;
  const lastSynced = s?.lastSyncedAt ? new Date(s.lastSyncedAt) : null;
  const hasFilters = selectedServiceTypeIds.length > 0 || Boolean(lastUsedSince);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div className="mb-8">
          <h1
            className="text-3xl font-semibold text-[var(--worship-navy)] mb-2"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Integrations
          </h1>
          <p className="text-[var(--worship-slate)]">
            Connect Sunday Studio to your church's other tools so song data
            stays current and the AI has accurate context when making
            suggestions.
          </p>
        </div>

        <div className="bg-white border border-[var(--worship-border)] rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-[var(--worship-pale-gold)] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[var(--worship-gold)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-[var(--worship-navy)] mb-1">
                Planning Center Services
              </h2>
              <p className="text-sm text-[var(--worship-slate)] mb-4">
                Import your church's song library — including verified BPM,
                keys, themes, and lyrics. Once connected, the AI Song
                Assistant uses your real song data for better suggestions,
                and re-syncing keeps everything current.
              </p>

              {status.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--worship-slate)]">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking connection…
                </div>
              ) : !s?.configured ? (
                <div className="text-sm text-[var(--worship-slate)] bg-[var(--worship-cream)] border border-[var(--worship-border)] rounded-lg p-3">
                  Planning Center is not configured on this server. Ask an
                  administrator to set{' '}
                  <code className="font-mono text-xs">PCS_CLIENT_ID</code> and{' '}
                  <code className="font-mono text-xs">PCS_CLIENT_SECRET</code>{' '}
                  in the environment.
                </div>
              ) : !s.connected ? (
                <button
                  onClick={handleConnect}
                  disabled={connect.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--worship-navy)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
                  data-testid="button-connect-pcs"
                >
                  {connect.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  Connect Planning Center
                </button>
              ) : (
                <div className="space-y-4">
                  {/* Connection status */}
                  <div className="text-sm">
                    <div className="text-[var(--worship-charcoal)]">
                      Connected
                      {s.organizationName ? (
                        <>
                          {' '}to{' '}
                          <span className="font-semibold">{s.organizationName}</span>
                        </>
                      ) : null}
                      .
                    </div>
                    {lastSynced && (
                      <div className="text-[var(--worship-slate)] mt-1">
                        Last synced {lastSynced.toLocaleString()}
                        {typeof s.lastSyncSongCount === 'number'
                          ? ` — ${s.lastSyncSongCount} songs imported.`
                          : '.'}
                      </div>
                    )}
                    {s.lastSyncError && (
                      <div className="text-[var(--worship-rust,#b45309)] mt-1">
                        Last sync had a problem: {s.lastSyncError}
                      </div>
                    )}
                  </div>

                  {/* Sync filters — collapsible */}
                  <div className="border border-[var(--worship-border)] rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setFiltersOpen((o) => !o)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--worship-cream)] text-sm font-medium text-[var(--worship-charcoal)] hover:bg-[var(--worship-sand)] transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        Sync filters
                        {hasFilters && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-[var(--worship-gold)] text-white">
                            {(selectedServiceTypeIds.length > 0 ? 1 : 0) +
                              (lastUsedSince ? 1 : 0)}{' '}
                            active
                          </span>
                        )}
                      </span>
                      {filtersOpen ? (
                        <ChevronUp className="w-4 h-4 text-[var(--worship-slate)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--worship-slate)]" />
                      )}
                    </button>

                    {filtersOpen && (
                      <div className="px-4 py-4 space-y-4 bg-white">
                        {/* Service type filter */}
                        <div>
                          <p className="text-xs font-medium text-[var(--worship-navy)] mb-2 uppercase tracking-wide">
                            Only import songs from
                          </p>
                          {serviceTypes.isLoading ? (
                            <div className="flex items-center gap-2 text-xs text-[var(--worship-slate)]">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Loading service types…
                            </div>
                          ) : serviceTypes.isError ? (
                            <p className="text-xs text-[var(--worship-rust,#b45309)]">
                              Could not load service types from Planning Center.
                            </p>
                          ) : !serviceTypes.data || serviceTypes.data.length === 0 ? (
                            <p className="text-xs text-[var(--worship-slate)]">
                              No service types found.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {serviceTypes.data.map((st) => {
                                const checked = selectedServiceTypeIds.includes(st.id);
                                return (
                                  <label
                                    key={st.id}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs cursor-pointer border transition-colors ${
                                      checked
                                        ? 'bg-[var(--worship-navy)] text-white border-[var(--worship-navy)]'
                                        : 'bg-white text-[var(--worship-charcoal)] border-[var(--worship-border)] hover:border-[var(--worship-navy)]'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="sr-only"
                                      checked={checked}
                                      onChange={() => toggleServiceType(st.id)}
                                    />
                                    {st.name}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {selectedServiceTypeIds.length === 0 && (
                            <p className="text-xs text-[var(--worship-slate)] mt-1">
                              No selection = import all service types.
                            </p>
                          )}
                        </div>

                        {/* Last-used-since filter */}
                        <div>
                          <label
                            htmlFor="last-used-since"
                            className="text-xs font-medium text-[var(--worship-navy)] mb-2 uppercase tracking-wide block"
                          >
                            Only songs used since
                          </label>
                          <input
                            id="last-used-since"
                            type="date"
                            value={lastUsedSince}
                            onChange={(e) => setLastUsedSince(e.target.value)}
                            max={new Date().toISOString().slice(0, 10)}
                            className="text-sm border border-[var(--worship-border)] rounded-lg px-3 py-1.5 text-[var(--worship-charcoal)] focus:outline-none focus:ring-2 focus:ring-[var(--worship-navy)] focus:border-transparent"
                          />
                          {lastUsedSince && (
                            <button
                              type="button"
                              onClick={() => setLastUsedSince('')}
                              className="ml-2 text-xs text-[var(--worship-slate)] underline hover:text-[var(--worship-navy)]"
                            >
                              Clear
                            </button>
                          )}
                          <p className="text-xs text-[var(--worship-slate)] mt-1">
                            Leave blank to import songs regardless of when they were last used.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSync}
                      disabled={sync.isPending}
                      className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--worship-border)] rounded-lg text-sm font-medium text-[var(--worship-charcoal)] hover:bg-[var(--worship-cream)] disabled:opacity-60"
                      data-testid="button-sync-pcs"
                    >
                      {sync.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      {hasFilters ? 'Sync with filters' : 'Sync now'}
                    </button>
                    <button
                      onClick={handleDisconnect}
                      disabled={disconnect.isPending}
                      className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--worship-border)] rounded-lg text-sm font-medium text-[var(--worship-charcoal)] hover:bg-[var(--worship-cream)] disabled:opacity-60"
                      data-testid="button-disconnect-pcs"
                    >
                      <Unlink className="w-4 h-4" />
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
