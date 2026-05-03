/**
 * "Import from CSV" modal for the Repertoire tab.
 *
 * Two flows in one modal:
 * 1. **Planning Center Services export** — auto-detected by header sniff.
 * 2. **Generic CSV** — any spreadsheet with a `title` column.
 *
 * Parsing is done client-side with Papa Parse so we never round-trip raw
 * file bytes through the API. The mapped songs ride the existing
 * `POST /api/library/repertoire/bulk-import` endpoint, chunked into
 * batches of 500 so very large PCO exports don't time out.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { FileUp, Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  useBulkImportRepertoire,
  type RepertoireImportSong,
} from '@workspace/api-client-react';
import {
  detectFormat,
  mapRowsByFormat,
  dedupeByTitle,
  splitNewVsDuplicate,
  type CsvFormat,
} from '../../lib/parsePcoCsv';

const CHUNK_SIZE = 500;

type ParseResult =
  | { status: 'idle' }
  | { status: 'parsing' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      format: CsvFormat;
      songs: RepertoireImportSong[];
      totalRows: number;
      droppedRows: number;
      intraFileDupes: number;
      newCount: number;
      duplicateCount: number;
      sample: RepertoireImportSong[];
      fileName: string;
    };

type ImportProgress = {
  done: number;
  total: number;
  added: number;
  skippedDuplicates: number;
  invalidLines: number;
};

export function CsvImportModal({
  onClose,
  onImported,
  existingTitles,
}: {
  onClose: () => void;
  onImported: () => void;
  /**
   * Titles of songs already in the user's repertoire. Used to compute
   * the "X new · Y already in repertoire" preview counts so the user
   * knows exactly what will land before they click Import. Order and
   * casing don't matter — comparison is case-insensitive and trimmed,
   * matching the server's normalizeTitle.
   */
  existingTitles: string[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parse, setParse] = useState<ParseResult>({ status: 'idle' });
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const bulkImport = useBulkImportRepertoire();

  // Acceptance criterion: clicking "Import from CSV" opens the file
  // picker. The button itself opens this modal, so on first mount we
  // auto-trigger the file picker — the user goes straight from one
  // click to choosing a file, with the preview/import surface waiting
  // here once they've made a selection. We only do this in the idle
  // state so it doesn't fire again after parsing/errors.
  useEffect(() => {
    if (parse.status === 'idle') {
      // Defer one tick so the modal has mounted and the input is in the
      // DOM before .click() runs.
      const id = window.setTimeout(() => {
        fileInputRef.current?.click();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = (file: File) => {
    setParse({ status: 'parsing' });
    setProgress(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      // PCO exports use standard quoting; let Papa handle escaping.
      complete: (results) => {
        const rows = results.data ?? [];
        const headers = (results.meta.fields ?? []).map((h) => h ?? '');
        if (rows.length === 0) {
          setParse({
            status: 'error',
            message:
              "We couldn't find any rows in that file. Make sure it's a CSV with a header row.",
          });
          return;
        }
        const format = detectFormat(headers);
        if (format === 'unknown') {
          setParse({
            status: 'error',
            message:
              "We couldn't recognize this CSV. Expected either a Planning Center Services export (must include an 'Arrangement 1 Name' column) or a generic CSV with at least a 'title' column. Other recognized columns: artist, bpm, key, ccli, tags (or themes), notes, arrangement notes, last scheduled date.",
          });
          return;
        }
        const mapped = mapRowsByFormat(format, rows, headers);
        const droppedRows = rows.length - mapped.length;
        const { unique, intraFileDupes } = dedupeByTitle(mapped);
        if (unique.length === 0) {
          setParse({
            status: 'error',
            message:
              "We parsed the file, but no rows had a usable title. Check the column headers and try again.",
          });
          return;
        }
        const { newSongs, existingMatches } = splitNewVsDuplicate(
          unique,
          existingTitles,
        );
        setParse({
          status: 'ready',
          format,
          songs: unique,
          totalRows: rows.length,
          droppedRows,
          intraFileDupes,
          newCount: newSongs.length,
          duplicateCount: existingMatches.length,
          // Preview shows the first 5 mapped rows verbatim — i.e. what
          // the file actually contains at the top — rather than filtering
          // to "new only", so the user can sanity-check parsing.
          sample: unique.slice(0, 5),
          fileName: file.name,
        });
      },
      error: (err) => {
        setParse({
          status: 'error',
          message: err.message || 'Could not read that file.',
        });
      },
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (parse.status !== 'ready') return;
    const totals: ImportProgress = {
      done: 0,
      total: parse.songs.length,
      added: 0,
      skippedDuplicates: 0,
      invalidLines: 0,
    };
    setProgress({ ...totals });
    try {
      for (let i = 0; i < parse.songs.length; i += CHUNK_SIZE) {
        const chunk = parse.songs.slice(i, i + CHUNK_SIZE);
        try {
          const res = await bulkImport.mutateAsync({ data: { songs: chunk } });
          totals.done += chunk.length;
          totals.added += res.added;
          totals.skippedDuplicates += res.skippedDuplicates;
          totals.invalidLines += res.invalidLines;
          setProgress({ ...totals });
        } catch (chunkErr) {
          const failedChunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
          const totalChunks = Math.ceil(parse.songs.length / CHUNK_SIZE);
          // Refresh the page's repertoire view so anything that *did* land
          // is visible to the user immediately.
          onImported();
          const detail =
            chunkErr instanceof Error ? chunkErr.message : 'Unknown error.';
          toast.error(
            `Imported ${totals.added} song${totals.added === 1 ? '' : 's'} so far, then failed at batch ${failedChunkIndex}/${totalChunks}. ${detail} Retrying will skip what already imported.`,
            { duration: 10000 },
          );
          // Keep the modal open with progress so the user can see exactly
          // what landed and retry.
          return;
        }
      }
      const parts: string[] = [];
      if (totals.added) parts.push(`${totals.added} added`);
      if (totals.skippedDuplicates)
        parts.push(`${totals.skippedDuplicates} already in repertoire`);
      if (totals.invalidLines) parts.push(`${totals.invalidLines} skipped`);
      toast.success(parts.length ? parts.join(' · ') : 'No new songs to add.');
      onImported();
      onClose();
    } catch (err) {
      // Defensive — should not be reached given the inner try/catch.
      toast.error(
        err instanceof Error ? err.message : 'Could not import that CSV.',
      );
    }
  };

  // While a bulk-import is in flight we lock the modal: clicking the
  // backdrop, X button, or Cancel does nothing. Otherwise a misclick
  // could hide a long-running import that's still mutating data.
  const importing = bulkImport.isPending;
  const safeClose = () => {
    if (importing) return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--worship-navy)]/40 backdrop-blur-sm p-4"
      onClick={safeClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--worship-border)]">
          <div>
            <h3 className="font-serif text-xl text-[var(--worship-navy)]">
              Import from CSV
            </h3>
            <p className="text-xs text-[var(--worship-slate)] mt-1">
              Upload a Planning Center Services export, or any spreadsheet
              with a <code>title</code> column.
            </p>
          </div>
          <button
            onClick={safeClose}
            disabled={importing}
            className="p-1 rounded hover:bg-[var(--worship-cream)] text-[var(--worship-slate)] disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Close"
            data-testid="button-close-csv-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="p-6 space-y-4 flex-1 overflow-y-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
              className="hidden"
              data-testid="input-csv-file"
            />
            {parse.status === 'idle' && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-12 rounded-xl border-2 border-dashed border-[var(--worship-border)] hover:border-[var(--worship-gold)] text-[var(--worship-slate)] hover:text-[var(--worship-gold)] transition-colors flex flex-col items-center gap-3"
                data-testid="button-pick-csv"
              >
                <FileUp className="w-8 h-8" />
                <span className="text-sm font-medium">
                  Click to choose a CSV file
                </span>
                <span className="text-xs">
                  Planning Center Services export, or your own spreadsheet
                </span>
              </button>
            )}
            {parse.status === 'parsing' && (
              <div className="py-12 flex flex-col items-center gap-3 text-[var(--worship-slate)]">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">Parsing CSV…</span>
              </div>
            )}
            {parse.status === 'error' && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">{parse.message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParse({ status: 'idle' });
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-sm text-[var(--worship-navy)] underline"
                >
                  Try another file
                </button>
              </div>
            )}
            {parse.status === 'ready' && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="text-sm space-y-1">
                    <div className="font-medium">
                      Recognized as{' '}
                      {parse.format === 'pco'
                        ? 'a Planning Center Services export'
                        : 'a generic CSV'}
                      .
                    </div>
                    <div
                      className="text-xs text-emerald-800/90"
                      data-testid="csv-preview-counts"
                    >
                      <strong>{parse.newCount}</strong> new
                      {' · '}
                      <strong>{parse.duplicateCount}</strong> already in
                      repertoire
                      {' · '}
                      <strong>{parse.songs.length}</strong> total in file
                    </div>
                    <div className="text-xs text-emerald-800/80">
                      From <em>{parse.fileName}</em>
                      {parse.droppedRows > 0
                        ? ` · ${parse.droppedRows} row${parse.droppedRows === 1 ? '' : 's'} skipped (no title)`
                        : ''}
                      {parse.intraFileDupes > 0
                        ? ` · ${parse.intraFileDupes} duplicate title${parse.intraFileDupes === 1 ? '' : 's'} merged within file`
                        : ''}
                      .
                    </div>
                    {parse.newCount === 0 && (
                      <div className="text-xs text-emerald-800/80 italic">
                        Every song in this file is already in your
                        repertoire — nothing new to add.
                      </div>
                    )}
                  </div>
                </div>
                {parse.format === 'pco' && (
                  <div className="text-xs text-[var(--worship-slate)] bg-[var(--worship-cream)] rounded-lg px-3 py-2">
                    Planning Center exports can carry up to 19 arrangements
                    per song. We'll import the <strong>default</strong>{' '}
                    arrangement (BPM, key, notes). The full CSV stays on
                    your computer.
                  </div>
                )}
                <div className="border border-[var(--worship-border)] rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--worship-cream)]/40 text-xs font-medium text-[var(--worship-slate)] uppercase tracking-wider">
                    Sample (first {parse.sample.length} of {parse.songs.length})
                  </div>
                  <ul className="divide-y divide-[var(--worship-border)]">
                    {parse.sample.map((s, i) => (
                      <li
                        key={`${s.title}-${i}`}
                        className="px-3 py-2 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1"
                        data-testid={`csv-preview-row-${i}`}
                      >
                        <span className="font-medium text-[var(--worship-navy)]">
                          {s.title}
                        </span>
                        {s.artist && (
                          <span className="text-xs text-[var(--worship-slate)]">
                            {s.artist}
                          </span>
                        )}
                        {s.bpm !== undefined && (
                          <span className="text-xs text-[var(--worship-slate)]">
                            {s.bpm} BPM
                          </span>
                        )}
                        {s.key && (
                          <span className="text-xs text-[var(--worship-slate)]">
                            Key: {s.key}
                          </span>
                        )}
                        {s.tags && s.tags.length > 0 && (
                          <span className="text-xs text-[var(--worship-gold)]">
                            {s.tags.slice(0, 3).join(', ')}
                            {s.tags.length > 3 ? '…' : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                {progress && progress.total > CHUNK_SIZE && (
                  <div className="space-y-1">
                    <div className="h-2 bg-[var(--worship-cream)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--worship-gold)] transition-all"
                        style={{
                          width: `${Math.round((progress.done / progress.total) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs text-[var(--worship-slate)] text-right">
                      {progress.done} / {progress.total}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--worship-border)] bg-[var(--worship-cream)]/40">
            <button
              type="button"
              onClick={safeClose}
              disabled={importing}
              className="px-4 py-2 text-sm font-medium text-[var(--worship-slate)] hover:text-[var(--worship-navy)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={parse.status !== 'ready' || bulkImport.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white worship-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              data-testid="button-import-csv"
            >
              {bulkImport.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Importing…
                </>
              ) : parse.status === 'ready' ? (
                <>
                  {parse.newCount > 0 ? (
                    <>
                      Import {parse.newCount} new song
                      {parse.newCount === 1 ? '' : 's'}
                    </>
                  ) : (
                    <>
                      Import {parse.songs.length} song
                      {parse.songs.length === 1 ? '' : 's'}
                    </>
                  )}
                </>
              ) : (
                <>Import</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
