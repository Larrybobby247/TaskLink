import { describe, it, expect } from '@jest/globals';
import { escapeRegex, tokenizeQuery, isObjectIdString } from '../src/utils/search.js';

describe('search utils', () => {
  it('escapes regex metacharacters so user input cannot change the pattern', () => {
    expect('a.b*c'.match(new RegExp(escapeRegex('a.b*c'), 'i'))).toBeTruthy();
    expect('axbbc'.match(new RegExp(escapeRegex('a.b*c'), 'i'))).toBeNull();
    expect(() => new RegExp(escapeRegex('(((['))).not.toThrow();
  });

  it('tokenizes, lowercases, drops a leading @ and caps the number of terms', () => {
    expect(tokenizeQuery('  Graphic   Designer ')).toEqual(['graphic', 'designer']);
    expect(tokenizeQuery('@LarryDev')).toEqual(['larrydev']);
    expect(tokenizeQuery('a b c d e f g')).toHaveLength(5);
    expect(tokenizeQuery(undefined)).toEqual([]);
    expect(tokenizeQuery('x'.repeat(200))[0]).toHaveLength(40);
  });

  it('recognises 24-char hex ids only', () => {
    expect(isObjectIdString('507f1f77bcf86cd799439011')).toBe(true);
    expect(isObjectIdString('larrydev')).toBe(false);
    expect(isObjectIdString(undefined)).toBe(false);
  });
});
