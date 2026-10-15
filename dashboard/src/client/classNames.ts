/**
 * Joins class names and drops falsy entries. Enough for the handful of
 * conditional class lists here; a real utility would be dead weight.
 */
export function classNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}
