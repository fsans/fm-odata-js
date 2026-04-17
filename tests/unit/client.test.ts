import { describe, it, expect } from 'vitest'
import { FMOData } from '../../src/client.js'

describe('FMOData (M1 scaffold)', () => {
  it('constructs with minimal options and derives the OData base URL', () => {
    const db = new FMOData({
      host: 'https://fms.example.com',
      database: 'Invoices',
      token: 'xxx',
    })
    expect(db.baseUrl).toBe('https://fms.example.com/fmi/odata/v4/Invoices')
  })

  it('strips trailing slashes from host', () => {
    const db = new FMOData({
      host: 'https://fms.example.com/',
      database: 'Invoices',
      token: 'xxx',
    })
    expect(db.baseUrl).toBe('https://fms.example.com/fmi/odata/v4/Invoices')
  })

  it('throws when required options are missing', () => {
    expect(
      // @ts-expect-error - intentionally invalid
      () => new FMOData({ database: 'X', token: 't' }),
    ).toThrow(/host/)
  })

  it('exposes a .from(entitySet) entry point returning a Query', async () => {
    const { Query } = await import('../../src/query.js')
    const db = new FMOData({
      host: 'https://fms.example.com',
      database: 'Invoices',
      token: 'xxx',
    })
    const q = db.from('Customer')
    expect(q).toBeInstanceOf(Query)
    expect(q.toURL()).toBe('https://fms.example.com/fmi/odata/v4/Invoices/Customer')
  })

  it('throws when .from() is called without an entity set', () => {
    const db = new FMOData({
      host: 'https://fms.example.com',
      database: 'Invoices',
      token: 'xxx',
    })
    expect(() => db.from('')).toThrow(/entitySet/)
  })

  it('URL-encodes the database name in the base URL', () => {
    const db = new FMOData({
      host: 'https://fms.example.com',
      database: 'My Invoices',
      token: 'xxx',
    })
    expect(db.baseUrl).toBe('https://fms.example.com/fmi/odata/v4/My%20Invoices')
  })
})
