import {
  REQUIRED_SPEC_KEYS,
  missingSpecKeys,
  findIncompleteSpecLines,
  formatSpecs,
} from '../mold-specs';

const full = { machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' };

describe('missingSpecKeys', () => {
  it('returns nothing when all four are present', () => {
    expect(missingSpecKeys(full)).toEqual([]);
  });

  it('lists every absent key', () => {
    expect(missingSpecKeys({ machine: 'MV' }).sort()).toEqual(
      ['capacity', 'grams', 'pattern'],
    );
  });

  it('treats blank and whitespace-only values as missing', () => {
    expect(missingSpecKeys({ ...full, pattern: '   ' })).toEqual(['pattern']);
    expect(missingSpecKeys({ ...full, grams: '' })).toEqual(['grams']);
  });

  it('treats null and non-objects as everything missing', () => {
    expect(missingSpecKeys(null).sort()).toEqual([...REQUIRED_SPEC_KEYS].sort());
    expect(missingSpecKeys('nope').sort()).toEqual([...REQUIRED_SPEC_KEYS].sort());
  });
});

describe('findIncompleteSpecLines', () => {
  it('ignores lines that do not require specs', () => {
    expect(
      findIncompleteSpecLines([
        { index: 0, requiresLineSpecs: false, specs: null },
        { index: 1, requiresLineSpecs: false, specs: { machine: 'MV' } },
      ]),
    ).toEqual([]);
  });

  it('reports each incomplete mold line with its index and missing keys', () => {
    const result = findIncompleteSpecLines([
      { index: 0, requiresLineSpecs: true, specs: full },
      { index: 1, requiresLineSpecs: true, specs: { machine: 'MV', capacity: '6K' } },
      { index: 2, requiresLineSpecs: true, specs: null },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].index).toBe(1);
    expect(result[0].missing.sort()).toEqual(['grams', 'pattern']);
    expect(result[1].index).toBe(2);
  });

  it('returns nothing when every mold line is complete', () => {
    expect(
      findIncompleteSpecLines([{ index: 0, requiresLineSpecs: true, specs: full }]),
    ).toEqual([]);
  });
});

describe('formatSpecs', () => {
  it('joins the four values in a fixed order', () => {
    expect(formatSpecs(full)).toBe('MV · 6K · 250 · Rose');
  });

  it('skips absent values rather than leaving empty separators', () => {
    expect(formatSpecs({ machine: 'MV', pattern: 'Rose' })).toBe('MV · Rose');
  });

  it('returns an empty string for no specs', () => {
    expect(formatSpecs(null)).toBe('');
    expect(formatSpecs({})).toBe('');
  });
});
