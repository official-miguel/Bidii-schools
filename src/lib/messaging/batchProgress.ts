/**
 * src/lib/messaging/batchProgress.ts
 *
 * In-process progress tracking for exam-results bulk sends.
 * Uses a simple Map so the POST and GET progress routes on the same server
 * instance can share state. For multi-instance deployments this would need
 * a Redis store, but for the current single-server setup this is sufficient.
 */

export type BatchProgress = {
  total:   number;
  sent:    number;
  failed:  number;
  done:    boolean;
  skipped: { name: string; reason: string }[];
};

type Entry = BatchProgress & { startedAt: number };

const _store = new Map<string, Entry>();

/** How long a finished batch stays readable by the progress poller. */
const TTL_MS = 30 * 60 * 1000;

/** Drop batches older than the TTL so a long-lived server does not grow forever. */
function evictStale(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, entry] of _store) {
    if (entry.startedAt < cutoff) _store.delete(id);
  }
}

export function initBatch(batchId: string, total: number): void {
  evictStale();
  _store.set(batchId, { total, sent: 0, failed: 0, done: false, skipped: [], startedAt: Date.now() });
}

export function incrementSent(batchId: string): void {
  const b = _store.get(batchId);
  if (b) b.sent++;
}

export function incrementFailed(batchId: string): void {
  const b = _store.get(batchId);
  if (b) b.failed++;
}

export function addSkipped(batchId: string, name: string, reason: string): void {
  const b = _store.get(batchId);
  if (b) b.skipped.push({ name, reason });
}

export function markDone(batchId: string): void {
  const b = _store.get(batchId);
  if (b) b.done = true;
}

export function getProgress(batchId: string): BatchProgress | null {
  const entry = _store.get(batchId);
  if (!entry) return null;
  const { startedAt: _startedAt, ...progress } = entry;
  return progress;
}
