import { describe, it, expect } from '@jest/globals';
import { nairaToKobo, koboToNaira, calculatePlatformFeeKobo, calculateNetAmountKobo } from '../src/utils/money.js';

describe('money utils', () => {
  it('converts Naira to kobo correctly', () => {
    expect(nairaToKobo(5000)).toBe(500000);
    expect(nairaToKobo(1500.5)).toBe(150050);
  });

  it('converts kobo to Naira correctly', () => {
    expect(koboToNaira(500000)).toBe(5000);
  });

  it('calculates a 5% platform fee without floating point drift', () => {
    // 5000 Naira => 250 Naira fee (5%)
    expect(calculatePlatformFeeKobo(500000, 5)).toBe(25000);
    expect(calculateNetAmountKobo(500000, 5)).toBe(475000);
  });

  it('calculates a 3% Pro commission correctly', () => {
    expect(calculatePlatformFeeKobo(500000, 3)).toBe(15000);
  });

  it('rejects non-integer kobo amounts', () => {
    expect(() => calculatePlatformFeeKobo(500000.5, 5)).toThrow();
  });
});
