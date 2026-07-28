import { isValidTransition } from '../order-workflow';

describe('isValidTransition', () => {
  it('starts both flows at QUOTATION and moves to CONFIRMED', () => {
    expect(isValidTransition('NEW_MOLD', 'QUOTATION', 'CONFIRMED')).toBe(true);
    expect(isValidTransition('REPEAT', 'QUOTATION', 'CONFIRMED')).toBe(true);
  });

  it('rejects skipping past CONFIRMED', () => {
    expect(isValidTransition('NEW_MOLD', 'QUOTATION', 'SAMPLE_RECEIVED')).toBe(false);
    expect(isValidTransition('REPEAT', 'QUOTATION', 'SENT_TO_FACTORY')).toBe(false);
  });

  it('keeps the rest of each flow in order', () => {
    expect(isValidTransition('NEW_MOLD', 'CONFIRMED', 'SAMPLE_RECEIVED')).toBe(true);
    expect(isValidTransition('REPEAT', 'CONFIRMED', 'SENT_TO_FACTORY')).toBe(true);
    expect(isValidTransition('NEW_MOLD', 'SHIPPED_TO_CUSTOMER', 'COMPLETED')).toBe(true);
  });

  it('rejects backwards moves', () => {
    expect(isValidTransition('NEW_MOLD', 'CONFIRMED', 'QUOTATION')).toBe(false);
    expect(isValidTransition('NEW_MOLD', 'COMPLETED', 'SHIPPED_TO_CUSTOMER')).toBe(false);
  });

  it('allows REJECTED only from QUOTATION', () => {
    expect(isValidTransition('NEW_MOLD', 'QUOTATION', 'REJECTED')).toBe(true);
    expect(isValidTransition('REPEAT', 'QUOTATION', 'REJECTED')).toBe(true);
    expect(isValidTransition('NEW_MOLD', 'CONFIRMED', 'REJECTED')).toBe(false);
    expect(isValidTransition('NEW_MOLD', 'COMPLETED', 'REJECTED')).toBe(false);
  });

  it('makes REJECTED terminal', () => {
    expect(isValidTransition('NEW_MOLD', 'REJECTED', 'QUOTATION')).toBe(false);
    expect(isValidTransition('NEW_MOLD', 'REJECTED', 'CONFIRMED')).toBe(false);
  });

  it('rejects an unknown order type or status', () => {
    expect(isValidTransition('BOGUS', 'QUOTATION', 'CONFIRMED')).toBe(false);
    expect(isValidTransition('BOGUS', 'QUOTATION', 'REJECTED')).toBe(false);
    expect(isValidTransition('NEW_MOLD', 'QUOTATION', 'NOPE')).toBe(false);
  });

  it('no longer knows the NEW status', () => {
    expect(isValidTransition('NEW_MOLD', 'NEW', 'SAMPLE_RECEIVED')).toBe(false);
  });
});
