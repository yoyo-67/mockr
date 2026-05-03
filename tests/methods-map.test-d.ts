import { describe, it } from 'vitest';
import { handler } from '../src/index.js';
import type { EndpointDef } from '../src/types.js';

describe('methods map types', () => {
  it('accepts uppercase verb keys with HandlerSpec values', () => {
    const def: EndpointDef = {
      url: '/x',
      methods: {
        GET: handler({ fn: () => ({ body: {} }) }),
        POST: handler({ fn: () => ({ body: {} }) }),
      },
    };
    void def;
  });

  it('rejects lowercase verb keys', () => {
    const def: EndpointDef = {
      url: '/x',
      methods: {
        // @ts-expect-error — methods keys must be uppercase HTTP verbs
        get: handler({ fn: () => ({ body: {} }) }),
      },
    };
    void def;
  });

  it('rejects non-HandlerSpec values', () => {
    const def: EndpointDef = {
      url: '/x',
      methods: {
        // @ts-expect-error — value must be a HandlerSpec (handler({...}) result)
        GET: () => ({ body: {} }),
      },
    };
    void def;
  });

  it('rejects handler + methods together', () => {
    // @ts-expect-error — cannot set both handler and methods
    const def: EndpointDef = {
      url: '/x',
      handler: handler({ fn: () => ({ body: {} }) }),
      methods: { GET: handler({ fn: () => ({ body: {} }) }) },
    };
    void def;
  });

  it('rejects method + methods together', () => {
    // @ts-expect-error — cannot set both top-level method shorthand and methods map
    const def: EndpointDef = {
      url: '/x',
      method: 'GET',
      methods: { GET: handler({ fn: () => ({ body: {} }) }) },
    };
    void def;
  });
});
