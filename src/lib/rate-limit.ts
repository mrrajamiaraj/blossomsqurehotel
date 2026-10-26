import "server-only";

// Fixed-window limiter held in memory. It protects a single server instance
// from bursts; on multi-instance hosting, put an edge limiter in front too.
const hits = new Map<string, { count: number; reset: number }>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset <= now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
