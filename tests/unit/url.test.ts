import { describe, it, expect } from 'vitest'
import {
  buildQueryString,
  encodePathSegment,
  escapeStringLiteral,
  formatDateTime,
  formatLiteral,
  parseDateTime,
} from '../../src/url.js'

describe('escapeStringLiteral', () => {
  it('doubles single quotes', () => {
    expect(escapeStringLiteral("O'Brien")).toBe("O''Brien")
  })

  it('leaves other characters untouched', () => {
    expect(escapeStringLiteral('plain text 123 !@#')).toBe('plain text 123 !@#')
  })

  it('handles empty strings', () => {
    expect(escapeStringLiteral('')).toBe('')
  })

  it('handles strings containing only quotes', () => {
    expect(escapeStringLiteral("'''")).toBe("''''''")
  })
})

describe('formatDateTime', () => {
  it('emits UTC ISO without milliseconds', () => {
    const d = new Date(Date.UTC(2026, 3, 17, 14, 45, 30, 123))
    expect(formatDateTime(d)).toBe('2026-04-17T14:45:30Z')
  })

  it('emits zero seconds correctly', () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0))
    expect(formatDateTime(d)).toBe('2026-01-01T00:00:00Z')
  })

  it('throws on invalid Date', () => {
    expect(() => formatDateTime(new Date('not-a-date'))).toThrow(/invalid Date/)
  })

  it('rejects non-Date arguments', () => {
    // @ts-expect-error - intentionally invalid
    expect(() => formatDateTime('2026-01-01')).toThrow(/invalid Date/)
  })
})

describe('parseDateTime', () => {
  it('parses ISO strings with milliseconds', () => {
    expect(parseDateTime('2026-04-17T14:45:30.123Z').getTime()).toBe(
      Date.UTC(2026, 3, 17, 14, 45, 30, 123),
    )
  })

  it('parses ISO strings without milliseconds', () => {
    expect(parseDateTime('2026-04-17T14:45:30Z').getTime()).toBe(
      Date.UTC(2026, 3, 17, 14, 45, 30),
    )
  })

  it('throws on invalid input', () => {
    expect(() => parseDateTime('not-a-date')).toThrow(/invalid date string/)
  })
})

describe('formatLiteral', () => {
  it('encodes strings with single-quote escaping', () => {
    expect(formatLiteral("O'Brien")).toBe("'O''Brien'")
  })

  it('encodes integers and floats verbatim', () => {
    expect(formatLiteral(0)).toBe('0')
    expect(formatLiteral(42)).toBe('42')
    expect(formatLiteral(-1.5)).toBe('-1.5')
  })

  it('encodes booleans as lowercase', () => {
    expect(formatLiteral(true)).toBe('true')
    expect(formatLiteral(false)).toBe('false')
  })

  it('encodes null and undefined as `null`', () => {
    expect(formatLiteral(null)).toBe('null')
    expect(formatLiteral(undefined)).toBe('null')
  })

  it('encodes Date as UTC ISO without milliseconds', () => {
    const d = new Date(Date.UTC(2026, 3, 17, 14, 45, 30, 500))
    expect(formatLiteral(d)).toBe('2026-04-17T14:45:30Z')
  })

  it('rejects non-finite numbers', () => {
    expect(() => formatLiteral(Infinity)).toThrow(/non-finite/)
    expect(() => formatLiteral(Number.NaN)).toThrow(/non-finite/)
  })

  it('rejects unsupported types', () => {
    // @ts-expect-error - intentionally invalid
    expect(() => formatLiteral({ foo: 1 })).toThrow(/unsupported/)
  })
})

describe('encodePathSegment', () => {
  it('percent-encodes spaces as %20', () => {
    expect(encodePathSegment('My Layout')).toBe('My%20Layout')
  })

  it('percent-encodes other reserved characters', () => {
    expect(encodePathSegment("O'Brien & Sons")).toBe("O'Brien%20%26%20Sons")
  })
})

describe('buildQueryString', () => {
  it('emits key=value pairs joined by &', () => {
    expect(
      buildQueryString([
        ['$top', '10'],
        ['$skip', '5'],
      ]),
    ).toBe('$top=10&$skip=5')
  })

  it('preserves the key verbatim (including leading $)', () => {
    expect(buildQueryString([['$filter', 'a eq 1']])).toBe('$filter=a%20eq%201')
  })

  it('percent-encodes spaces in values as %20, not +', () => {
    // Note: apostrophes are RFC 3986 sub-delims and left unencoded by
    // encodeURIComponent; OData servers accept both encoded and literal.
    expect(buildQueryString([['$filter', "name eq 'Joe'"]])).toBe(
      "$filter=name%20eq%20'Joe'",
    )
  })

  it('skips empty / nullish values', () => {
    expect(
      buildQueryString([
        ['$top', ''],
        ['$skip', '0'],
      ]),
    ).toBe('$skip=0')
  })

  it('preserves order of insertion', () => {
    expect(
      buildQueryString([
        ['$skip', '5'],
        ['$top', '10'],
      ]),
    ).toBe('$skip=5&$top=10')
  })
})
