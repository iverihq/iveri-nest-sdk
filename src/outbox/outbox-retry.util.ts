/**
 * When a failed publish may be attempted again.
 *
 * **Full jitter, not plain exponential backoff.** A realtime outage fails every claimed row at
 * once, so a shared deterministic delay brings all of them back in the same instant — the
 * synchronized herd that keeps a recovering service down. Randomising the whole interval
 * spreads them, and it is the one property worth preserving if this is ever tuned.
 *
 * The exponent is clamped at 20 so an absurd `attemptCount` cannot overflow into an infinite
 * ceiling; `maxMs` bounds it in practice long before that.
 */
export const nextOutboxAttemptAt = (dto: { attemptCount: number; baseMs: number; maxMs: number }): Date => {
    const exponent = Math.min(Math.max(dto.attemptCount - 1, 0), 20);
    const ceiling = Math.min(dto.baseMs * 2 ** exponent, dto.maxMs);

    return new Date(Date.now() + Math.floor(Math.random() * ceiling));
};
