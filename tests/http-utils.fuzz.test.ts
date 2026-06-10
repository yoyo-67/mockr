import { describe, it } from 'vitest';
import fc from 'fast-check';
import { parseRange, parseBody, parseQuery } from '../src/http-utils.js';

describe('parseRange fuzz', () => {
  it('never throws and any returned range is valid for the size', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.nat({ max: 1_000_000 }),
        (header, size) => {
          const r = parseRange(header, size);
          if (r === null) return true;
          if ('unsatisfiable' in r) return true;
          // Concrete range must be in-bounds and ordered.
          return (
            Number.isInteger(r.start) &&
            Number.isInteger(r.end) &&
            r.start >= 0 &&
            r.start <= r.end &&
            r.end <= size - 1
          );
        },
      ),
    );
  });
});

// Regression guards for the external HTTP surface: these pass today (both
// functions are robust), they fail if a future edit drops a try/catch or
// assumes a body shape.
describe('parseBody fuzz', () => {
  it('never throws on arbitrary bytes + content-type', () => {
    fc.assert(
      fc.property(
        fc.uint8Array(),
        fc.option(fc.string(), { nil: undefined }),
        (bytes, ct) => {
          parseBody(Buffer.from(bytes), ct);
        },
      ),
    );
  });
});

describe('parseQuery fuzz', () => {
  it('never throws and always returns an object', () => {
    fc.assert(
      fc.property(fc.string(), (url) => {
        const r = parseQuery(url);
        return r !== null && typeof r === 'object' && !Array.isArray(r);
      }),
    );
  });
});
