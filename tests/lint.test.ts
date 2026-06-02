import { describe, it, expect } from 'vitest';
import { lintEndpoints } from '../src/lint.js';
import type { EndpointDef } from '../src/types.js';

const h: EndpointDef['handler'] = () => ({ body: {} });

describe('lintEndpoints — shadowed routes', () => {
  it('warns when a globstar endpoint shadows a later specific one', () => {
    const warnings = lintEndpoints([
      { url: '/api/**', method: 'GET', handler: h },
      { url: '/api/todos', method: 'GET', handler: h },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/\/api\/todos/);
    expect(warnings[0]).toMatch(/shadow/i);
  });

  it('warns when a single-segment wildcard shadows a later specific one', () => {
    const warnings = lintEndpoints([
      { url: '/api/:anything', method: 'GET', handler: h },
      { url: '/api/todos', method: 'GET', handler: h },
    ]);
    expect(warnings).toHaveLength(1);
  });

  it('does not warn for distinct, non-overlapping routes', () => {
    const warnings = lintEndpoints([
      { url: '/api/todos', method: 'GET', handler: h },
      { url: '/api/users', method: 'GET', handler: h },
    ]);
    expect(warnings).toEqual([]);
  });

  it('does not warn when methods do not overlap', () => {
    const warnings = lintEndpoints([
      { url: '/api/**', method: 'POST', handler: h },
      { url: '/api/todos', method: 'GET', handler: h },
    ]);
    expect(warnings).toEqual([]);
  });

  it('does not warn when the specific route is registered first', () => {
    const warnings = lintEndpoints([
      { url: '/api/todos', method: 'GET', handler: h },
      { url: '/api/**', method: 'GET', handler: h },
    ]);
    expect(warnings).toEqual([]);
  });
});
