import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  validateConfig,
  checkDelayValue,
  formatErrors,
} from '../src/config-validator.js';

describe('validateConfig fuzz', () => {
  it('never throws on arbitrary config input', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        // Must return a structured result, never throw.
        validateConfig(input as any);
      }),
    );
  });

  it('never throws on arbitrary endpoints array', () => {
    fc.assert(
      fc.property(fc.array(fc.anything()), (endpoints) => {
        validateConfig({ endpoints } as any);
      }),
    );
  });
});

describe('checkDelayValue fuzz', () => {
  it('never throws and always returns string|null', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const r = checkDelayValue(input);
        return r === null || typeof r === 'string';
      }),
    );
  });
});

describe('formatErrors fuzz', () => {
  it('never throws on arbitrary error arrays', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            index: fc.integer(),
            url: fc.string(),
            message: fc.string(),
          }),
        ),
        (errors) => {
          const s = formatErrors(errors);
          return typeof s === 'string';
        },
      ),
    );
  });
});
