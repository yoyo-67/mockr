import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createMatcher } from '../src/router.js';

describe('createMatcher fuzz', () => {
  it('never throws building a matcher from a wildcard pattern', () => {
    // Patterns always contain a '*' so they hit mockr's own regex builder.
    fc.assert(
      fc.property(fc.string(), (s) => {
        const pattern = '*' + s;
        const matchFn = createMatcher(pattern);
        // And the returned matcher must not throw on arbitrary paths.
        matchFn('/some/path');
        matchFn(s);
      }),
    );
  });

  it('treats regex-special chars in a wildcard pattern as literals', () => {
    // '/a(b' is a literal path segment after the leading wildcard segment.
    const matchFn = createMatcher('*/a(b');
    expect(matchFn('seg/a(b')).not.toBeNull();
    expect(matchFn('seg/axb')).toBeNull();
  });
});
