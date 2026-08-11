import { describe, it, expect } from 'vitest'
import { toLocalDateString } from './date'

describe('toLocalDateString', () => {
  it('formats a midday UTC timestamp as the same local day under the UTC test pin', () => {
    expect(toLocalDateString(new Date('2026-08-11T12:00:00Z'))).toBe('2026-08-11')
  })

  it('zero-pads month and day', () => {
    expect(toLocalDateString(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05')
  })

  it('uses the local calendar day, not the UTC day, near midnight', () => {
    // 2026-08-11T23:30Z is still 2026-08-11 in UTC but 2026-08-12 anywhere at
    // UTC+1 or later. Derive the expectation from local time rather than
    // hardcoding it, so this asserts the local-day contract in any timezone.
    const d = new Date('2026-08-11T23:30:00Z')
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
    expect(toLocalDateString(d)).toBe(expected)
    // And it must never be the naive UTC slice when the local day differs.
    if (expected !== d.toISOString().slice(0, 10)) {
      expect(toLocalDateString(d)).not.toBe(d.toISOString().slice(0, 10))
    }
  })

  it('agrees with the local calendar day for a timestamp before UTC midnight going backwards', () => {
    // 00:30Z is the previous local day for any negative UTC offset.
    const d = new Date('2026-08-11T00:30:00Z')
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
    expect(toLocalDateString(d)).toBe(expected)
  })
})
