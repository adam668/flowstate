/**
 * Formats a Date as a `YYYY-MM-DD` string in the *local* calendar day.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that yields the UTC day, which
 * shifts the date near midnight for any trader not on UTC and mis-attributes
 * trades to the wrong trading day. This is the single source of truth for the
 * local-day convention shared by the rule engine and the IPC handlers — both
 * must agree, so neither may keep a private copy.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
