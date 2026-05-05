import { AppLayout } from '../components/layout/AppLayout';
import {
  useGetPcsStatus,
  useCreatePcsConnectUrl,
  useSyncPcsSongs,
  useDisconnectPcs,
  getGetPcsStatusQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Building2, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';

/**
 * Integrations page: today, only the Planning Center Services connection.
 *
 * The connect flow lives partly outside React Query because the OAuth
 * round-trip is a full-page navigation: we POST to create-url, then
 * `window.location.assign` to PCO. PCO eventually 302s the browser back
 * to /api/integrations/pcs/callback, which redirects back here with
 * `?pcs=ok` (or `?pcs=error&message=...`). The effect at the top of this
 * component reads those params and shows a toast.
 */
export default function Integrations() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const status = useGetPcsStatus();
  const connect = useCreatePcsConnectUrl();
  const sync = useSyncPcsSongs();
  const disconnect = useDisconnectPcs();

  const search = typeof window === 'undefined' ? '' : window.location.search;
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const pcsResult = params.get('pcs');
  const pcsMessage = params.get('message');

  // Surface OAuth callback results once on mount, then strip the params.
  useEffect(() => {
    if (!pcsResult) return;
    if (pcsResult === 'ok') {
      toast.success('Planning Center connected. Songs are syncing.');
      void qc.invalidateQueries({ queryKey: getGetPcsStatusQueryKey() });
    } else {
      toast.error(`Planning Center connection failed: ${pcsMessage ?? 'Unknown error'}`);
    }
    navigate('/settings/integrations', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcsResult]);

  const handleConnect = async () => {
    try {
      const { authUrl } = await connect.mutateAsync();
      window.location.assign(authUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start connection';
      toast.error(msg);
    }
  };

  const handleSync = async () => {
    try {
      const r = await sync.mutateAsync();
      toast.success(
        `Synced ${r.total} song${r.total === 1 ? '' : 's'} (${r.inserted} new, ${r.updated} updated).`,
      );
      await qc.invalidateQueries({ queryKey: getGetPcsStatusQueryKey() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      toast.error(msg);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Planning Center? Your imported songs will stay in your library, but new BPM updates will stop syncing until you reconnect.')) {
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

  const s = status.data;
  const lastSynced = s?.lastSyncedAt ? new Date(s.lastSyncedAt) : null;

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
            Connect Sunday Studio to your church's other tools so song tempos,
            keys, and arrangements stay in sync.
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
                Import your church's song library — including the verified
                BPM and key from each arrangement. Once connected, the AI
                Song Assistant prefers your real tempos over its own
                guesses, and re-syncing keeps everything current.
              </p>

              {status.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--worship-slate)]">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking connection…
                </div>
              ) : !s?.configured ? (
                <div className="text-sm text-[var(--worship-slate)] bg-[var(--worship-cream)] border border-[var(--worship-border)] rounded-lg p-3">
                  Planning Center is not configured on this server. Ask an
                  administrator to set <code className="font-mono text-xs">PCS_CLIENT_ID</code>{' '}
                  and <code className="font-mono text-xs">PCS_CLIENT_SECRET</code>{' '}
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
                          ? ` — ${s.lastSyncSongCount} songs in your PCS library.`
                          : '.'}
                      </div>
                    )}
                    {s.lastSyncError && (
                      <div className="text-[var(--worship-rust,#b45309)] mt-1">
                        Last sync had a problem: {s.lastSyncError}
                      </div>
                    )}
                  </div>
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
                      Sync now
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
