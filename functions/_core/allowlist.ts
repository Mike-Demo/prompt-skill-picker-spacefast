/**
 * Worker-side allowlist of skill ids that were actually surfaced to a client
 * by a prior search or library listing. The download endpoint only resolves
 * ids from this set, so it cannot be driven as an anonymous proxy for
 * arbitrary GitHub repository paths.
 *
 * NOTE: this is per-isolate memory. The durable fallback is the stored shared
 * searches (see saved-search.ts).
 */
const ALLOWLIST_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 5000;

const allowed = new Map<string, number>();

/** owner/repo/skill-id — the only shape the registry ever produces. */
const ID_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export function isWellFormedSkillId(id: string): boolean {
  return ID_PATTERN.test(id) && !id.includes("..");
}

function prune(now: number): void {
  for (const [id, expiresAt] of allowed) {
    if (expiresAt <= now) allowed.delete(id);
  }
  if (allowed.size <= MAX_ENTRIES) return;
  const overflow = allowed.size - MAX_ENTRIES;
  let removed = 0;
  for (const id of allowed.keys()) {
    if (removed++ >= overflow) break;
    allowed.delete(id);
  }
}

export function allowSkillIds(ids: readonly string[]): void {
  const now = Date.now();
  prune(now);
  for (const id of ids) {
    if (isWellFormedSkillId(id)) allowed.set(id, now + ALLOWLIST_TTL_MS);
  }
}

export function isSkillIdAllowed(id: string): boolean {
  const expiresAt = allowed.get(id);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    allowed.delete(id);
    return false;
  }
  return true;
}
