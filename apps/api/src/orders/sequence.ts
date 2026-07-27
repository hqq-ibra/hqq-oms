/**
 * Next value in a zero-padded numeric sequence such as QT-2026-0007.
 * Uses slice() rather than replace() so a prefix whose characters recur in
 * the suffix cannot corrupt the parsed number.
 */
export function nextSequenceNumber(
  prefix: string,
  lastValue: string | null,
): string {
  const parsed = lastValue
    ? parseInt(lastValue.slice(prefix.length), 10)
    : NaN;
  const next = Number.isFinite(parsed) ? parsed + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
