import { nextSequenceNumber } from '../sequence';
import { buildQuotationDefaults } from '../quotation-defaults';

describe('nextSequenceNumber', () => {
  it('starts at 0001 when there is no previous value', () => {
    expect(nextSequenceNumber('QT-2026-', null)).toBe('QT-2026-0001');
  });

  it('increments the previous value', () => {
    expect(nextSequenceNumber('QT-2026-', 'QT-2026-0007')).toBe('QT-2026-0008');
  });

  it('rolls past four digits without truncating', () => {
    expect(nextSequenceNumber('ORD-2026-', 'ORD-2026-9999')).toBe('ORD-2026-10000');
  });

  it('handles a prefix whose characters recur in the suffix', () => {
    expect(nextSequenceNumber('FO-2026-FO-', 'FO-2026-FO-0003')).toBe('FO-2026-FO-0004');
  });

  it('restarts at 0001 when the previous value is malformed', () => {
    expect(nextSequenceNumber('QT-2026-', 'QT-2026-BROKEN')).toBe('QT-2026-0001');
  });
});

describe('buildQuotationDefaults', () => {
  const quoteDate = new Date('2026-07-27T00:00:00.000Z');

  it('sets validity to 14 days after the quote date', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme',
      customerCity: null,
      contactName: null,
      contactPhone: null,
      quoteDate,
    });
    expect(d.validUntil.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('builds the client block from name and city', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme Dates Factory',
      customerCity: 'Dammam',
      contactName: null,
      contactPhone: null,
      quoteDate,
    });
    expect(d.clientBlock).toBe('Acme Dates Factory\nDammam');
  });

  it('omits the city line when there is no city', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme',
      customerCity: null,
      contactName: null,
      contactPhone: null,
      quoteDate,
    });
    expect(d.clientBlock).toBe('Acme');
  });

  it('carries the contact phone and name across', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme',
      customerCity: 'Dammam',
      contactName: 'Khaled',
      contactPhone: '0500000000',
      quoteDate,
    });
    expect(d.contact).toBe('0500000000');
    expect(d.attn).toBe('Khaled');
  });

  it('returns Date objects, not strings, for Prisma', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme',
      customerCity: null,
      contactName: null,
      contactPhone: null,
      quoteDate,
    });
    expect(d.quoteDate).toBeInstanceOf(Date);
    expect(d.validUntil).toBeInstanceOf(Date);
  });
});
