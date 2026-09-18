import {describe, expect, it} from 'vitest';
import {parseMoney} from '../src/lib/money';

describe('amount entry', () => {
  it.each(['1.5', ' 1.5', '1.5 ', ' 1.5\n'])('parses %j as 150 cents', value => {
    expect(parseMoney(value)).toBe(150);
  });
  it.each(['0', '-1', '1.234', '1 2', 'abc', ''])('rejects %j', value => {
    expect(() => parseMoney(value)).toThrow();
  });
});
